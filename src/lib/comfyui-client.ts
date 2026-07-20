import fs from "node:fs";
import path from "node:path";
import {
  type ComfyUiRuntimeConfig,
  type ResolvedComfyUiConfig,
  injectPromptsWithFallbacks,
  parseWorkflowJson,
  resolvePlaceholderTokens,
  resolveQueueParams,
  resolveCustomWorkflowTokens,
  type WorkflowParamValues,
} from "./comfyui-config";
import { writeQueueArtifact } from "./queue-artifacts";
import { loadServerWorkflowJson } from "./comfyui-server-workflows";
import { applyUserComfyUiOverride } from "./user-comfy-url";
import { resolveComfyUiUrlWithPool } from "./comfyui-pool";
import {
  getComfyUiAllowedHosts,
  isComfyClientUrlAllowed,
  normalizeSafeHttpUrl,
} from "./url-safety";

export type ComfyQueueRequest = {
  prompt: string;
  negativePrompt?: string;
  params?: WorkflowParamValues;
  workflowId?: string;
  nodeTitle?: string;
};

export type ComfyQueueResult = {
  ok: boolean;
  promptId?: string;
  error?: string;
  comfyUrl: string;
  workflowSource?: "client" | "env" | "minimal";
  replacements?: { positive: number; negative: number };
};

/** Max prompts accepted by /api/comfyui in one request. */
export const COMFYUI_MAX_BATCH_PROMPTS = 12;

function envComfyUiBaseUrl(): string {
  return (
    process.env.COMFYUI_API_URL?.trim() ||
    process.env.COMFY_PROMPT_API_URL?.trim()?.replace(/:\d+$/, ":8188") ||
    "http://127.0.0.1:8188"
  );
}

export function getComfyUiBaseUrl(runtime?: ComfyUiRuntimeConfig, routingSeed?: string): string {
  const runtimeWithUser = applyUserComfyUiOverride(runtime ?? {});
  const allowedHosts = getComfyUiAllowedHosts();
  const clientUrl = runtimeWithUser.apiUrl?.trim();

  if (clientUrl && isComfyClientUrlAllowed()) {
    return normalizeSafeHttpUrl(clientUrl, {
      allowPrivate: true,
      allowedHosts,
    });
  }

  return normalizeSafeHttpUrl(
    resolveComfyUiUrlWithPool({
      userUrl: runtimeWithUser.apiUrl,
      envUrl: envComfyUiBaseUrl(),
      routingSeed,
    }),
    {
      allowPrivate: true,
      allowedHosts,
    },
  );
}

function loadWorkflowFromEnv(): Record<string, unknown> | null {
  const inline = process.env.COMFYUI_WORKFLOW_JSON?.trim();
  if (inline) {
    return parseWorkflowJson(inline);
  }

  const filePath = process.env.COMFYUI_WORKFLOW_PATH?.trim();
  if (!filePath) {
    return null;
  }

  try {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(/* turbopackIgnore: true */ process.cwd(), filePath);
    return parseWorkflowJson(fs.readFileSync(resolved, "utf8"));
  } catch {
    return null;
  }
}

export function resolveComfyUiConfig(
  runtime?: ComfyUiRuntimeConfig,
): ResolvedComfyUiConfig {
  const clientWorkflow = parseWorkflowJson(runtime?.workflowJson);
  const selectedServerWorkflow = runtime?.workflowFileId
    ? loadServerWorkflowJson(runtime.workflowFileId)
    : null;
  const envWorkflow = selectedServerWorkflow ?? loadWorkflowFromEnv();
  const workflow = clientWorkflow ?? envWorkflow;

  return {
    apiUrl: getComfyUiBaseUrl(runtime),
    workflow,
    placeholderTokens: resolvePlaceholderTokens(runtime),
    legacyPositiveNodeId:
      process.env.COMFYUI_POSITIVE_NODE_ID?.trim() ||
      process.env.COMFYUI_PROMPT_NODE_ID?.trim() ||
      undefined,
    legacyNegativeNodeId: process.env.COMFYUI_NEGATIVE_NODE_ID?.trim() || undefined,
    workflowSource: clientWorkflow
      ? "client"
      : envWorkflow
        ? "env"
        : "none",
  };
}

function injectPromptsIntoWorkflow(
  workflow: Record<string, unknown>,
  request: ComfyQueueRequest,
  config: ResolvedComfyUiConfig,
  runtime?: ComfyUiRuntimeConfig,
) {
  const params = resolveQueueParams(runtime, request.params);
  const customTokens = resolveCustomWorkflowTokens(runtime);
  return injectPromptsWithFallbacks(
    workflow,
    {
      positive: request.prompt,
      negative: request.negativePrompt,
      params,
      customTokens,
    },
    config.placeholderTokens,
    {
      legacyPositiveNodeId: config.legacyPositiveNodeId,
      legacyNegativeNodeId: config.legacyNegativeNodeId,
    },
  );
}

export async function queuePromptToComfyUi(
  request: ComfyQueueRequest,
  runtime?: ComfyUiRuntimeConfig,
): Promise<ComfyQueueResult> {
  const config = resolveComfyUiConfig(runtime);

  try {
    const promptBody = config.workflow
      ? (() => {
          const injected = injectPromptsIntoWorkflow(
            config.workflow,
            request,
            config,
            runtime,
          );
          return {
            prompt: injected.workflow,
            workflowSource:
              config.workflowSource === "env" ? ("env" as const) : ("client" as const),
            replacements: {
              positive: injected.positiveReplacements,
              negative: injected.negativeReplacements,
            },
          };
        })()
      : {
          prompt: buildMinimalWorkflow(request.prompt, request.nodeTitle),
          workflowSource: "minimal" as const,
          replacements: { positive: 1, negative: 0 },
        };

    const workflowResponse = await fetch(`${config.apiUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: promptBody.prompt }),
    });

    if (!workflowResponse.ok) {
      const text = await workflowResponse.text();
      return {
        ok: false,
        error: text || `ComfyUI returned ${workflowResponse.status}`,
        comfyUrl: config.apiUrl,
        workflowSource: promptBody.workflowSource,
        replacements: promptBody.replacements,
      };
    }

    const data = (await workflowResponse.json()) as { prompt_id?: string };

    writeQueueArtifact({
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      promptId: data.prompt_id,
      comfyUrl: config.apiUrl,
      workflow:
        typeof promptBody.prompt === "object"
          ? (promptBody.prompt as Record<string, unknown>)
          : undefined,
    });

    return {
      ok: true,
      promptId: data.prompt_id,
      comfyUrl: config.apiUrl,
      workflowSource: promptBody.workflowSource,
      replacements: promptBody.replacements,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "ComfyUI unreachable",
      comfyUrl: config.apiUrl,
    };
  }
}

export type ComfyBatchQueueResult = {
  ok: boolean;
  queued: number;
  failed: number;
  results: ComfyQueueResult[];
  comfyUrl: string;
};

export async function queueBatchToComfyUi(
  requests: ComfyQueueRequest[],
  runtime?: ComfyUiRuntimeConfig,
): Promise<ComfyBatchQueueResult> {
  const config = resolveComfyUiConfig(runtime);
  const results: ComfyQueueResult[] = [];

  for (const request of requests) {
    if (!request.prompt.trim()) {
      continue;
    }
    results.push(await queuePromptToComfyUi(request, runtime));
  }

  const queued = results.filter((entry) => entry.ok).length;
  return {
    ok: queued > 0,
    queued,
    failed: results.length - queued,
    results,
    comfyUrl: config.apiUrl,
  };
}

function buildMinimalWorkflow(prompt: string, nodeTitle = "CLIP Text Encode") {
  return {
    "1": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
      _meta: { title: nodeTitle },
    },
    "2": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "model.safetensors" },
    },
  };
}
