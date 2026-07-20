import { resolveComfyUiConfig } from "./comfyui-client";
import {
  injectPromptsWithFallbacks,
  resolveQueueInjectionContext,
  stripEmptyComfyUiRuntime,
  resolveWorkflowGraphEnrichOptions,
  type ComfyUiRuntimeConfig,
  type WorkflowParamValues,
} from "./comfyui-config";
import {
  auditWorkflowPreviewIssues,
  type WorkflowPlaceholderAuditIssue,
} from "./workflow-placeholder-audit";
import { optimizeWorkflowForQueue } from "./workflow-queue-optimizer";

export type WorkflowPreviewInput = {
  prompt: string;
  negativePrompt?: string;
  params?: WorkflowParamValues;
  comfy?: ComfyUiRuntimeConfig;
  model?: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
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
  resolvedParams?: WorkflowParamValues;
  snippets?: WorkflowPreviewSnippet[];
  workflowJson?: string;
  truncated?: boolean;
  preflightIssues?: WorkflowPlaceholderAuditIssue[];
  queueOptimizeChanges?: string[];
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

  if (!config.workflow) {
    const { params: resolvedParams } = resolveQueueInjectionContext({
      runtime,
      override: input.params,
      model: input.model ?? runtime?.queueTargetModel,
    });
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

  const { params: resolvedParams, loaders, customTokens } = resolveQueueInjectionContext({
    runtime,
    override: input.params,
    model: input.model ?? runtime?.queueTargetModel,
    workflow: config.workflow,
  });

  const optimized =
    runtime?.workflowQueueOptimize !== false
      ? optimizeWorkflowForQueue({
          workflow: config.workflow,
          tokens: config.placeholderTokens,
          model: input.model ?? runtime?.queueTargetModel,
          qualityProfile: runtime?.queueQualityProfile,
          upscaleModelFilename: resolvedParams.upscaleModelFilename,
          refinerCheckpointFilename: resolvedParams.refinerCheckpointFilename,
          ...resolveWorkflowGraphEnrichOptions(runtime),
        })
      : { workflow: config.workflow, changes: [] as import("./workflow-queue-optimizer").WorkflowQueueOptimizeChange[] };

  const injected = injectPromptsWithFallbacks(
    optimized.workflow,
    {
      positive: prompt,
      negative: input.negativePrompt,
      params: resolvedParams,
      customTokens,
    },
    config.placeholderTokens,
    {
      legacyPositiveNodeId: config.legacyPositiveNodeId,
      legacyNegativeNodeId: config.legacyNegativeNodeId,
      directWorkflowPatching: runtime?.directWorkflowPatching,
      loaders,
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
  const model = input.model ?? "qwen-image-2512";
  const optimizerWarnings: WorkflowPlaceholderAuditIssue[] = optimized.changes
    .filter((change) => change.severity === "warn")
    .map((change) => ({ severity: "warn", message: change.message }));
  const preflightIssues =
    config.workflowSource === "minimal"
      ? []
      : [
          ...optimizerWarnings,
          ...auditWorkflowPreviewIssues({
            workflowJson,
            model,
            hasInputImage:
              input.hasInputImage ?? Boolean(resolvedParams.inputImageFilename),
            hasMaskImage:
              input.hasMaskImage ?? Boolean(resolvedParams.maskImageFilename),
          }),
        ];

  const queueOptimizeChanges = optimized.changes
    ?.filter((change) => change.severity === "info")
    .map((change) => change.message);

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
    preflightIssues,
    queueOptimizeChanges,
  };
}
