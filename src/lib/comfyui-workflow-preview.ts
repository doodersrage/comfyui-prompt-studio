import { resolveComfyUiConfig } from "./comfyui-client";
import {
  injectPromptsWithFallbacks,
  resolveCustomWorkflowTokens,
  resolveQueueParams,
  stripEmptyComfyUiRuntime,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from "./comfyui-config";

export type WorkflowPreviewInput = {
  prompt: string;
  negativePrompt?: string;
  params?: WorkflowParamValues;
  comfy?: ComfyUiRuntimeConfig;
};

export type WorkflowPreviewSnippet = {
  path: string;
  value: string;
};

export type WorkflowPreviewResult = {
  ok: boolean;
  error?: string;
  workflowSource?: "client" | "env" | "minimal" | "none";
  replacements?: {
    positive: number;
    negative: number;
    params: Partial<Record<keyof WorkflowParamValues, number>>;
    custom?: Record<string, number>;
  };
  resolvedParams?: Required<WorkflowParamValues>;
  snippets?: WorkflowPreviewSnippet[];
  workflowJson?: string;
  truncated?: boolean;
};

function findValuePaths(
  value: unknown,
  needle: string,
  path = "",
  limit = 6,
): WorkflowPreviewSnippet[] {
  if (!needle || limit <= 0) {
    return [];
  }

  const snippets: WorkflowPreviewSnippet[] = [];

  if (typeof value === "string") {
    if (value.includes(needle)) {
      snippets.push({
        path: path || "root",
        value: value.length > 160 ? `${value.slice(0, 160)}…` : value,
      });
    }
    return snippets;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      snippets.push(
        ...findValuePaths(value[index], needle, `${path}[${index}]`, limit - snippets.length),
      );
      if (snippets.length >= limit) {
        break;
      }
    }
    return snippets;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      snippets.push(
        ...findValuePaths(entry, needle, nextPath, limit - snippets.length),
      );
      if (snippets.length >= limit) {
        break;
      }
    }
  }

  return snippets;
}

const MAX_PREVIEW_CHARS = 6000;

export function previewWorkflowInjection(
  input: WorkflowPreviewInput,
): WorkflowPreviewResult {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, error: "Prompt is required." };
  }

  const runtime = stripEmptyComfyUiRuntime(input.comfy);
  const config = resolveComfyUiConfig(runtime);
  const resolvedParams = resolveQueueParams(runtime, input.params);

  if (!config.workflow) {
    return {
      ok: true,
      workflowSource: "minimal",
      replacements: { positive: 1, negative: 0, params: {} },
      resolvedParams,
      snippets: [{ path: "minimal.prompt", value: prompt.slice(0, 160) }],
      workflowJson: JSON.stringify(
        { note: "Minimal fallback workflow (no custom workflow configured)" },
        null,
        2,
      ),
    };
  }

  const injected = injectPromptsWithFallbacks(
    config.workflow,
    {
      positive: prompt,
      negative: input.negativePrompt,
      params: resolvedParams,
      customTokens: resolveCustomWorkflowTokens(runtime),
    },
    config.placeholderTokens,
    {
      legacyPositiveNodeId: config.legacyPositiveNodeId,
      legacyNegativeNodeId: config.legacyNegativeNodeId,
    },
  );

  const snippets: WorkflowPreviewSnippet[] = [
    ...findValuePaths(injected.workflow, prompt, "", 3),
  ];

  if (input.negativePrompt?.trim()) {
    snippets.push(
      ...findValuePaths(injected.workflow, input.negativePrompt.trim(), "", 2),
    );
  }

  for (const value of Object.values(resolvedParams)) {
    snippets.push(...findValuePaths(injected.workflow, String(value), "", 1));
    if (snippets.length >= 8) {
      break;
    }
  }

  const workflowJson = JSON.stringify(injected.workflow, null, 2);
  const truncated = workflowJson.length > MAX_PREVIEW_CHARS;

  return {
    ok: true,
    workflowSource: config.workflowSource,
    replacements: {
      positive: injected.positiveReplacements,
      negative: injected.negativeReplacements,
      params: injected.paramReplacements,
      custom: injected.customReplacements,
    },
    resolvedParams,
    snippets: snippets.slice(0, 8),
    workflowJson: truncated
      ? `${workflowJson.slice(0, MAX_PREVIEW_CHARS)}\n…`
      : workflowJson,
    truncated,
  };
}
