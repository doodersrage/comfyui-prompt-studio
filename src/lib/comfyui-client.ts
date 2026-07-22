import fs from "node:fs";
import path from "node:path";
import {
  type ComfyUiRuntimeConfig,
  type ResolvedComfyUiConfig,
  injectPromptsWithFallbacks,
  parseWorkflowJson,
  resolvePlaceholderTokens,
  resolveQueueInjectionContext,
  resolveWorkflowGraphEnrichOptions,
  findUnresolvedLoaderPlaceholders,
  normalizeComfyApiWorkflow,
  type WorkflowParamValues,
} from "./comfyui-config";
import { writeQueueArtifact } from "./queue-artifacts";
import { loadServerWorkflowJson } from "./comfyui-server-workflows";
import { applyUserComfyUiOverride } from "./user-comfy-url";
import { getComfyUiPoolStatsCache, resolveComfyUiUrlWithPool } from "./comfyui-pool";
import {
  getComfyUiAllowedHosts,
  isComfyClientUrlAllowed,
  normalizeSafeHttpUrl,
} from "./url-safety";
import { optimizeWorkflowForQueue } from "./workflow-queue-optimizer";
import { runWorkflowPreflightSync } from "./workflow-preflight-sync";
import { fetchComfyObjectInfoPayload } from "./comfyui-object-info";
import { formatComfyUiQueueValidationError } from "./comfyui-queue-validation-error";
import { workflowContentHash } from "./workflow-content-hash";

export type ComfyQueueRequest = {
  prompt: string;
  negativePrompt?: string;
  params?: WorkflowParamValues;
  /** Target model for server-side loader resolution when runtime is trimmed. */
  model?: string;
  workflowId?: string;
  nodeTitle?: string;
  /**
   * ComfyUI WebSocket client id — must match `?clientId=` on the browser WS
   * so latent preview frames are associated with this session.
   */
  clientId?: string;
};

export type ComfyQueueResult = {
  ok: boolean;
  promptId?: string;
  error?: string;
  comfyUrl: string;
  clientId?: string;
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
      // Best-effort VRAM-aware pick from the last known pool health snapshot —
      // stays synchronous (no fetch here); the cache is refreshed by
      // checkComfyUiPoolHealth() (health polling) and pool pick misses.
      poolStats: getComfyUiPoolStatsCache(),
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
  const workflowRaw = clientWorkflow ?? envWorkflow;
  const workflow = workflowRaw ? normalizeComfyApiWorkflow(workflowRaw) : null;

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

/** Cache optimized graphs across batch queue requests that share the same workflow object. */
const optimizedWorkflowCache = new WeakMap<
  object,
  { key: string; workflow: Record<string, unknown> }
>();

/**
 * Content-hash cache for rebuilt workflow objects (WeakMap misses when identity changes).
 * Insertion-order eviction keeps recent batch profiles warm.
 */
const optimizedWorkflowByHash = new Map<
  string,
  { optimizeKey: string; workflow: Record<string, unknown> }
>();
const OPTIMIZED_WORKFLOW_HASH_CACHE_MAX = 48;

function rememberOptimizedWorkflowByHash(
  sourceHash: string,
  optimizeKey: string,
  /** Already-cloned snapshot — shared with WeakMap; do not mutate. */
  workflow: Record<string, unknown>,
) {
  const cacheKey = `${sourceHash}|${optimizeKey}`;
  if (optimizedWorkflowByHash.has(cacheKey)) {
    optimizedWorkflowByHash.delete(cacheKey);
  }
  optimizedWorkflowByHash.set(cacheKey, {
    optimizeKey,
    workflow,
  });
  while (optimizedWorkflowByHash.size > OPTIMIZED_WORKFLOW_HASH_CACHE_MAX) {
    const oldest = optimizedWorkflowByHash.keys().next().value;
    if (oldest == null) {
      break;
    }
    optimizedWorkflowByHash.delete(oldest);
  }
}

function injectPromptsIntoWorkflow(
  workflow: Record<string, unknown>,
  request: ComfyQueueRequest,
  config: ResolvedComfyUiConfig,
  runtime?: ComfyUiRuntimeConfig,
  enrichInventory?: {
    availableUpscaleModels?: string[] | null;
    availableCheckpoints?: string[] | null;
    availableLoras?: string[] | null;
    supportsNeuralUpscaleTileSize?: boolean;
    availableNodeTypes?: Iterable<string> | null;
    webpSaveAdapters?: import("./workflow-save-format").WebpSaveAdapter[] | null;
  },
) {
  const { params, loaders, customTokens } = resolveQueueInjectionContext({
    runtime,
    override: request.params,
    model: runtime?.queueTargetModel ?? request.model,
    workflow,
  });
  const model = runtime?.queueTargetModel ?? request.model;
  const inventoryFingerprint = [
    enrichInventory?.availableUpscaleModels?.slice().sort().join(",") ?? "",
    String(enrichInventory?.availableCheckpoints?.length ?? 0),
    String(enrichInventory?.availableLoras?.length ?? 0),
    enrichInventory?.supportsNeuralUpscaleTileSize ? "1" : "0",
    enrichInventory?.availableNodeTypes
      ? [...enrichInventory.availableNodeTypes].filter((name) => /saveimage|image save/i.test(name)).sort().join(",")
      : "",
  ].join(";");
  const optimizeKey = [
    runtime?.queueQualityProfile ?? "draft",
    model ?? "",
    params.upscaleModelFilename ?? "",
    params.refinerCheckpointFilename ?? "",
    runtime?.workflowGraphEnrich === false ? "0" : "1",
    runtime?.compactDraftSaves === false ? "0" : "1",
    inventoryFingerprint,
  ].join("|");

  let optimizedWorkflow = workflow;
  if (runtime?.workflowQueueOptimize !== false) {
    const cached = optimizedWorkflowCache.get(workflow);
    if (cached && cached.key === optimizeKey) {
      optimizedWorkflow = structuredClone(cached.workflow);
    } else {
      const sourceHash = workflowContentHash(JSON.stringify(workflow));
      const byHash = optimizedWorkflowByHash.get(`${sourceHash}|${optimizeKey}`);
      if (byHash) {
        optimizedWorkflow = structuredClone(byHash.workflow);
        optimizedWorkflowCache.set(workflow, {
          key: optimizeKey,
          workflow: byHash.workflow,
        });
      } else {
        const optimized = optimizeWorkflowForQueue({
          workflow,
          tokens: config.placeholderTokens,
          model,
          qualityProfile: runtime?.queueQualityProfile,
          upscaleModelFilename: params.upscaleModelFilename,
          refinerCheckpointFilename: params.refinerCheckpointFilename,
          skipIfUnchanged: true,
          contentHash: runtime?.workflowOptimizedHash,
          optimizedModel: runtime?.workflowOptimizedModel,
          optimizedProfile: runtime?.workflowOptimizedProfile,
          availableUpscaleModels: enrichInventory?.availableUpscaleModels,
          availableCheckpoints: enrichInventory?.availableCheckpoints,
          supportsNeuralUpscaleTileSize: enrichInventory?.supportsNeuralUpscaleTileSize,
          availableNodeTypes: enrichInventory?.availableNodeTypes,
          webpSaveAdapters: enrichInventory?.webpSaveAdapters,
          compactDraftSaves: runtime?.compactDraftSaves,
          ...resolveWorkflowGraphEnrichOptions(runtime),
        });
        // One snapshot shared by WeakMap + hash cache; inject clones before mutating.
        const cloned = structuredClone(optimized.workflow);
        optimizedWorkflow = cloned;
        optimizedWorkflowCache.set(workflow, {
          key: optimizeKey,
          workflow: cloned,
        });
        rememberOptimizedWorkflowByHash(sourceHash, optimizeKey, cloned);
      }
    }
  }

  return injectPromptsWithFallbacks(
    optimizedWorkflow,
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
      directWorkflowPatching: runtime?.directWorkflowPatching,
      syncWorkflowLoadersToModel: runtime?.syncWorkflowLoadersToModel,
      loaders,
      model: runtime?.queueTargetModel ?? request.model,
      availableLoras: enrichInventory?.availableLoras,
      qualityProfile: runtime?.queueQualityProfile,
      loraLibrary: runtime?.loraLibrary,
    },
  );
}

async function fetchComfyObjectInfoForPreflight(runtime?: ComfyUiRuntimeConfig) {
  return fetchComfyObjectInfoPayload(runtime);
}

function buildPreflightFailure(
  preflight: ReturnType<typeof runWorkflowPreflightSync>,
  comfyUrl: string,
): ComfyQueueResult {
  return {
    ok: false,
    error: preflight.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join(" · "),
    comfyUrl,
  };
}

export async function queuePromptToComfyUi(
  request: ComfyQueueRequest,
  runtime?: ComfyUiRuntimeConfig,
  options?: {
    preflight?: boolean;
    objectInfo?: Awaited<ReturnType<typeof fetchComfyObjectInfoForPreflight>>;
  },
): Promise<ComfyQueueResult> {
  const config = resolveComfyUiConfig(runtime);
  const runPreflight = options?.preflight !== false;

  try {
    const objectInfo =
      config.workflow && runPreflight
        ? (options?.objectInfo ?? (await fetchComfyObjectInfoForPreflight(runtime)))
        : null;

    const promptBody = config.workflow
      ? (() => {
          const injected = injectPromptsIntoWorkflow(
            config.workflow,
            request,
            config,
            runtime,
            {
              availableUpscaleModels: objectInfo?.models.upscaleModels,
              availableCheckpoints: objectInfo?.models.checkpoints,
              availableLoras: objectInfo?.models.loras,
              supportsNeuralUpscaleTileSize: objectInfo?.supportsNeuralUpscaleTileSize,
              availableNodeTypes: objectInfo?.nodeTypes,
              webpSaveAdapters: objectInfo?.webpSaveAdapters,
            },
          );
          const unresolved = findUnresolvedLoaderPlaceholders(injected.workflow);
          if (unresolved.length > 0) {
            const modelHint =
              request.model ?? runtime?.queueTargetModel ?? "unknown";
            const loaderHint = [
              request.params?.unetFilename
                ? `unet=${request.params.unetFilename}`
                : null,
              request.params?.vaeFilename
                ? `vae=${request.params.vaeFilename}`
                : null,
            ]
              .filter(Boolean)
              .join(", ");
            throw new Error(
              `Workflow still has unresolved loader placeholders (${unresolved.join(", ")}) for model "${modelHint}"${loaderHint ? ` (${loaderHint})` : ""}. Set Settings → checkpoint/VAE maps for your model, then retry.`,
            );
          }

          if (runPreflight) {
            const preflight = runWorkflowPreflightSync({
              workflow: injected.workflow,
              model: request.model ?? runtime?.queueTargetModel ?? "qwen-image-2512",
              syncWorkflowLoadersToModel: runtime?.syncWorkflowLoadersToModel,
              knownNodeTypes: objectInfo?.nodeTypes,
              models: objectInfo?.models,
              objectInfoUnavailable: !objectInfo,
              customTokens: runtime?.customTokens,
              lightningAlreadyPrepared: true,
            });
            if (!preflight.ok) {
              return {
                kind: "preflight_failed" as const,
                preflight,
              };
            }
          }

          return {
            kind: "ready" as const,
            injected,
          };
        })()
      : {
          kind: "minimal" as const,
        };

    if (promptBody.kind === "preflight_failed") {
      return buildPreflightFailure(promptBody.preflight, config.apiUrl);
    }

    const resolvedPromptBody =
      promptBody.kind === "ready"
        ? {
            prompt: promptBody.injected.workflow,
            workflowSource:
              config.workflowSource === "env" ? ("env" as const) : ("client" as const),
            replacements: {
              positive: promptBody.injected.positiveReplacements,
              negative: promptBody.injected.negativeReplacements,
            },
          }
        : {
            prompt: buildMinimalWorkflow(request.prompt, request.nodeTitle),
            workflowSource: "minimal" as const,
            replacements: { positive: 1, negative: 0 },
          };

    const clientId =
      request.clientId?.trim() ||
      `srv${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;

    const workflowResponse = await fetch(`${config.apiUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: resolvedPromptBody.prompt,
        client_id: clientId,
      }),
    });

    if (!workflowResponse.ok) {
      const text = await workflowResponse.text();
      return {
        ok: false,
        error: formatComfyUiQueueValidationError(text || `ComfyUI returned ${workflowResponse.status}`),
        comfyUrl: config.apiUrl,
        clientId,
        workflowSource: resolvedPromptBody.workflowSource,
        replacements: resolvedPromptBody.replacements,
      };
    }

    const data = (await workflowResponse.json()) as { prompt_id?: string };

    writeQueueArtifact({
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      promptId: data.prompt_id,
      comfyUrl: config.apiUrl,
      workflow:
        typeof resolvedPromptBody.prompt === "object"
          ? (resolvedPromptBody.prompt as Record<string, unknown>)
          : undefined,
    });

    return {
      ok: true,
      promptId: data.prompt_id,
      comfyUrl: config.apiUrl,
      clientId,
      workflowSource: resolvedPromptBody.workflowSource,
      replacements: resolvedPromptBody.replacements,
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
  options?: { preflight?: boolean },
): Promise<ComfyBatchQueueResult> {
  const config = resolveComfyUiConfig(runtime);
  const results: ComfyQueueResult[] = [];
  const runPreflight = options?.preflight !== false;
  const objectInfo =
    runPreflight && config.workflow
      ? await fetchComfyObjectInfoForPreflight(runtime)
      : null;

  for (const request of requests) {
    if (!request.prompt.trim()) {
      continue;
    }

    results.push(
      await queuePromptToComfyUi(request, runtime, {
        preflight: runPreflight,
        objectInfo: objectInfo ?? undefined,
      }),
    );
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
