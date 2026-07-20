import { patchModelSamplingInWorkflow } from "./model-sampling-patch";
import {
  forceResolveLoaderPlaceholders,
  patchLoaderNodesInWorkflow,
  patchWorkflowDirectParams,
} from "./workflow-direct-patch";
import type { ModelLoaderFilenames } from "./model-checkpoint-map";

export const DEFAULT_POSITIVE_TOKEN = "{{POSITIVE}}";
export const DEFAULT_NEGATIVE_TOKEN = "{{NEGATIVE}}";
export const DEFAULT_SEED_TOKEN = "{{SEED}}";
export const DEFAULT_WIDTH_TOKEN = "{{WIDTH}}";
export const DEFAULT_HEIGHT_TOKEN = "{{HEIGHT}}";
export const DEFAULT_CFG_TOKEN = "{{CFG}}";
export const DEFAULT_STEPS_TOKEN = "{{STEPS}}";
export const DEFAULT_SAMPLER_TOKEN = "{{SAMPLER}}";
export const DEFAULT_SCHEDULER_TOKEN = "{{SCHEDULER}}";
export const DEFAULT_SHIFT_TOKEN = "{{SHIFT}}";
export const DEFAULT_FLUX_MAX_SHIFT_TOKEN = "{{FLUX_MAX_SHIFT}}";
export const DEFAULT_FLUX_BASE_SHIFT_TOKEN = "{{FLUX_BASE_SHIFT}}";
export const DEFAULT_DENOISE_TOKEN = "{{DENOISE}}";
export const DEFAULT_INPUT_IMAGE_TOKEN = "{{INPUT_IMAGE}}";
export const DEFAULT_MASK_IMAGE_TOKEN = "{{MASK_IMAGE}}";

import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  DEFAULT_REFINER_TOKEN,
  loaderFilenameCustomTokens,
  resolveLoaderFilenamesForModel,
  resolveRefinerFilenameForModel,
  type ModelCheckpointMap,
  type ModelRefinerMap,
  type ModelUnetMap,
  type ModelVaeMap,
} from "./model-checkpoint-map";
import {
  resolveLoaderPrecisionTier,
  type LoaderPrecisionTier,
} from "./model-loader-precision";
import {
  DEFAULT_UPSCALE_MODEL_TOKEN,
  resolveUpscaleModelFilename,
  type ModelUpscaleMap,
} from "./model-upscale-map";

export { DEFAULT_CHECKPOINT_TOKEN, DEFAULT_UNET_TOKEN, DEFAULT_VAE_TOKEN, DEFAULT_UPSCALE_MODEL_TOKEN, DEFAULT_REFINER_TOKEN };

export type WorkflowParamValues = {
  seed?: string | number;
  width?: string | number;
  height?: string | number;
  cfg?: string | number;
  steps?: string | number;
  samplerName?: string | number;
  scheduler?: string | number;
  samplingShift?: string | number;
  fluxMaxShift?: string | number;
  fluxBaseShift?: string | number;
  checkpointFilename?: string;
  unetFilename?: string;
  vaeFilename?: string;
  upscaleModelFilename?: string;
  refinerCheckpointFilename?: string;
  denoise?: string | number;
  inputImageFilename?: string;
  maskImageFilename?: string;
};

export type CustomWorkflowToken = {
  token: string;
  value: string;
};

export type ComfyUiRuntimeConfig = {
  apiUrl?: string;
  workflowJson?: string;
  /** Server-side workflow file path from COMFYUI_WORKFLOW_DIR / COMFYUI_WORKFLOW_PATHS. */
  workflowFileId?: string;
  positiveToken?: string;
  negativeToken?: string;
  queueParams?: WorkflowParamValues;
  customTokens?: CustomWorkflowToken[];
  /** When false, skip direct EmptyLatentImage / loader patching (placeholder injection still runs). */
  directWorkflowPatching?: boolean;
  /** When true (default), auto-bind missing placeholders before injection at queue time. */
  workflowQueueOptimize?: boolean;
  /** When true (default), insert model-sampling patch nodes when missing for FLUX/SD3 workflows. */
  workflowGraphEnrich?: boolean;
  /** When true (default), insert SDXL refiner pass on Final/Max when a refiner map is set. */
  workflowSdxlRefinerEnrich?: boolean;
  /** When true (default), chain Lanczos polish after neural UpscaleModel on Max. */
  workflowNeuralUpscalePolish?: boolean;
  /** When true (default), add a subtle ImageSharpen after upscale on Max. */
  workflowSharpenAfterUpscale?: boolean;
  /** Model id used for queue-time workflow optimize / graph enrich heuristics. */
  queueTargetModel?: string;
  /** Effective queue quality profile for this request (sampler, resolution, upscale). */
  queueQualityProfile?: import("./queue-quality-profile").QueueQualityProfile;
  /** Client-side checkpoint map forwarded for server-side loader resolution. */
  modelCheckpointMap?: ModelCheckpointMap;
  /** Client-side VAE map forwarded for server-side loader resolution. */
  modelVaeMap?: ModelVaeMap;
  /** Client-side SDXL refiner map forwarded for server-side loader resolution. */
  modelRefinerMap?: ModelRefinerMap;
  /** Client-side upscale model map forwarded for server-side loader resolution. */
  modelUpscaleMap?: ModelUpscaleMap;
};

export type WorkflowPlaceholderTokens = {
  positive: string;
  negative: string;
  seed: string;
  width: string;
  height: string;
  cfg: string;
  steps: string;
  sampler: string;
  scheduler: string;
  shift: string;
  fluxMaxShift: string;
  fluxBaseShift: string;
  denoise: string;
  inputImage: string;
  maskImage: string;
};

export type ResolvedComfyUiConfig = {
  apiUrl: string;
  workflow: Record<string, unknown> | null;
  placeholderTokens: WorkflowPlaceholderTokens;
  legacyPositiveNodeId?: string;
  legacyNegativeNodeId?: string;
  workflowSource: "client" | "env" | "none";
};

export type WorkflowInjectionResult = {
  workflow: Record<string, unknown>;
  positiveReplacements: number;
  negativeReplacements: number;
  paramReplacements: Partial<Record<keyof WorkflowParamValues, number>>;
  customReplacements?: Record<string, number>;
};

export function resolvePlaceholderTokens(
  runtime?: ComfyUiRuntimeConfig,
): WorkflowPlaceholderTokens {
  return {
    positive:
      runtime?.positiveToken?.trim() ||
      process.env.COMFYUI_POSITIVE_TOKEN?.trim() ||
      DEFAULT_POSITIVE_TOKEN,
    negative:
      runtime?.negativeToken?.trim() ||
      process.env.COMFYUI_NEGATIVE_TOKEN?.trim() ||
      DEFAULT_NEGATIVE_TOKEN,
    seed:
      process.env.COMFYUI_SEED_TOKEN?.trim() || DEFAULT_SEED_TOKEN,
    width:
      process.env.COMFYUI_WIDTH_TOKEN?.trim() || DEFAULT_WIDTH_TOKEN,
    height:
      process.env.COMFYUI_HEIGHT_TOKEN?.trim() || DEFAULT_HEIGHT_TOKEN,
    cfg: process.env.COMFYUI_CFG_TOKEN?.trim() || DEFAULT_CFG_TOKEN,
    steps:
      process.env.COMFYUI_STEPS_TOKEN?.trim() || DEFAULT_STEPS_TOKEN,
    sampler:
      process.env.COMFYUI_SAMPLER_TOKEN?.trim() || DEFAULT_SAMPLER_TOKEN,
    scheduler:
      process.env.COMFYUI_SCHEDULER_TOKEN?.trim() || DEFAULT_SCHEDULER_TOKEN,
    shift: process.env.COMFYUI_SHIFT_TOKEN?.trim() || DEFAULT_SHIFT_TOKEN,
    fluxMaxShift:
      process.env.COMFYUI_FLUX_MAX_SHIFT_TOKEN?.trim() || DEFAULT_FLUX_MAX_SHIFT_TOKEN,
    fluxBaseShift:
      process.env.COMFYUI_FLUX_BASE_SHIFT_TOKEN?.trim() || DEFAULT_FLUX_BASE_SHIFT_TOKEN,
    denoise: process.env.COMFYUI_DENOISE_TOKEN?.trim() || DEFAULT_DENOISE_TOKEN,
    inputImage:
      process.env.COMFYUI_INPUT_IMAGE_TOKEN?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    maskImage:
      process.env.COMFYUI_MASK_IMAGE_TOKEN?.trim() || DEFAULT_MASK_IMAGE_TOKEN,
  };
}

export function resolveQueueParams(
  runtime?: ComfyUiRuntimeConfig,
  override?: WorkflowParamValues,
): WorkflowParamValues {
  const merged = {
    ...(runtime?.queueParams ?? {}),
    ...(override ?? {}),
  };

  const result: WorkflowParamValues = {
    seed:
      merged.seed?.toString().trim() ||
      String(Math.floor(Math.random() * 2 ** 32)),
    width: merged.width?.toString().trim() || "1024",
    height: merged.height?.toString().trim() || "1024",
    cfg: merged.cfg?.toString().trim() || "7",
    steps: merged.steps?.toString().trim() || "20",
    samplerName: merged.samplerName?.toString().trim() || "euler",
    scheduler: merged.scheduler?.toString().trim() || "normal",
  };

  if (merged.samplingShift != null && merged.samplingShift.toString().trim() !== "") {
    result.samplingShift = merged.samplingShift;
  }
  if (merged.fluxMaxShift != null && merged.fluxMaxShift.toString().trim() !== "") {
    result.fluxMaxShift = merged.fluxMaxShift;
  }
  if (merged.fluxBaseShift != null && merged.fluxBaseShift.toString().trim() !== "") {
    result.fluxBaseShift = merged.fluxBaseShift;
  }
  if (merged.denoise != null && merged.denoise.toString().trim() !== "") {
    result.denoise = merged.denoise;
  }
  if (merged.inputImageFilename?.trim()) {
    result.inputImageFilename = merged.inputImageFilename.trim();
  }
  if (merged.maskImageFilename?.trim()) {
    result.maskImageFilename = merged.maskImageFilename.trim();
  }
  if (merged.checkpointFilename?.trim()) {
    result.checkpointFilename = merged.checkpointFilename.trim();
  }
  if (merged.unetFilename?.trim()) {
    result.unetFilename = merged.unetFilename.trim();
  }
  if (merged.vaeFilename?.trim()) {
    result.vaeFilename = merged.vaeFilename.trim();
  }
  if (merged.upscaleModelFilename?.trim()) {
    result.upscaleModelFilename = merged.upscaleModelFilename.trim();
  }
  if (merged.refinerCheckpointFilename?.trim()) {
    result.refinerCheckpointFilename = merged.refinerCheckpointFilename.trim();
  }

  return result;
}

export function ensureQueueLoaderParams(
  params: WorkflowParamValues,
  model?: string,
  options?: {
    checkpointMap?: ModelCheckpointMap;
    vaeMap?: ModelVaeMap;
    unetMap?: ModelUnetMap;
    customTokens?: CustomWorkflowToken[];
    precisionTier?: LoaderPrecisionTier;
  },
): WorkflowParamValues {
  if (!model?.trim()) {
    return params;
  }

  const loaders = resolveLoaderFilenamesForModel(model, options);
  const next = { ...params };

  if (!next.checkpointFilename?.trim() && loaders.checkpoint) {
    next.checkpointFilename = loaders.checkpoint;
  }
  if (!next.unetFilename?.trim() && loaders.unet) {
    next.unetFilename = loaders.unet;
  }
  if (!next.vaeFilename?.trim() && loaders.vae) {
    next.vaeFilename = loaders.vae;
  }

  return next;
}

export function resolveQueueInjectionContext(input: {
  runtime?: ComfyUiRuntimeConfig;
  override?: WorkflowParamValues;
  model?: string;
  workflow?: Record<string, unknown>;
  precisionTier?: LoaderPrecisionTier;
}): {
  params: WorkflowParamValues;
  loaders: ModelLoaderFilenames;
  customTokens: CustomWorkflowToken[];
} {
  const baseCustomTokens = resolveCustomWorkflowTokens(input.runtime);
  const model = input.model?.trim() || input.runtime?.queueTargetModel?.trim();
  const precisionTier = resolveLoaderPrecisionTier({
    workflow: input.workflow,
    explicit: input.precisionTier,
  });
  const loaderMapOptions = {
    customTokens: baseCustomTokens,
    checkpointMap: input.runtime?.modelCheckpointMap,
    vaeMap: input.runtime?.modelVaeMap,
    precisionTier,
  };
  let params = ensureQueueLoaderParams(
    resolveQueueParams(input.runtime, input.override),
    model,
    loaderMapOptions,
  );

  const inferred = model
    ? resolveLoaderFilenamesForModel(model, loaderMapOptions)
    : ({} as ModelLoaderFilenames);

  const loaders: ModelLoaderFilenames = {
    checkpoint: params.checkpointFilename?.trim() || inferred.checkpoint,
    unet: params.unetFilename?.trim() || inferred.unet,
    vae: params.vaeFilename?.trim() || inferred.vae,
  };

  params = { ...params };
  if (!params.checkpointFilename?.trim() && loaders.checkpoint) {
    params.checkpointFilename = loaders.checkpoint;
  }
  if (!params.unetFilename?.trim() && loaders.unet) {
    params.unetFilename = loaders.unet;
  }
  if (!params.vaeFilename?.trim() && loaders.vae) {
    params.vaeFilename = loaders.vae;
  }

  if (model) {
    if (!params.upscaleModelFilename?.trim()) {
      const upscale = resolveUpscaleModelFilename(model, {
        upscaleMap: input.runtime?.modelUpscaleMap,
        customTokens: baseCustomTokens,
      });
      if (upscale) {
        params.upscaleModelFilename = upscale;
      }
    }
    if (!params.refinerCheckpointFilename?.trim()) {
      const refiner = resolveRefinerFilenameForModel(model, {
        refinerMap: input.runtime?.modelRefinerMap,
        customTokens: baseCustomTokens,
      });
      if (refiner) {
        params.refinerCheckpointFilename = refiner;
      }
    }
  }

  const customTokens =
    mergeLoaderTokensIntoCustomTokens(params, baseCustomTokens) ??
    baseCustomTokens;

  return { params, loaders, customTokens };
}

export function normalizeComfyApiWorkflow(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (listWorkflowNodeIds(value).length > 0) {
    return value;
  }

  for (const key of ["prompt", "workflow", "graph"]) {
    const nested = value[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>;
      if (listWorkflowNodeIds(nestedRecord).length > 0) {
        return nestedRecord;
      }
    }
  }

  return value;
}

export function parseWorkflowJson(
  raw?: string,
): Record<string, unknown> | null {
  if (!raw?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return normalizeComfyApiWorkflow(parsed as Record<string, unknown>);
    }
  } catch {
    return null;
  }

  return null;
}

export function findUnresolvedLoaderPlaceholders(
  workflow: Record<string, unknown>,
): string[] {
  const unresolved = new Set<string>();
  const loaderTokens = [DEFAULT_UNET_TOKEN, DEFAULT_VAE_TOKEN, DEFAULT_CHECKPOINT_TOKEN];

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs) {
      continue;
    }
    for (const value of Object.values(inputs)) {
      if (typeof value !== "string") {
        continue;
      }
      for (const token of loaderTokens) {
        if (value.includes(token)) {
          unresolved.add(token);
        }
      }
    }
  }

  return [...unresolved];
}

export function listWorkflowNodeIds(workflow: Record<string, unknown>): string[] {
  return Object.keys(workflow)
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right));
}

export function countPlaceholders(raw: string, token: string): number {
  if (!token || !raw) {
    return 0;
  }

  let count = 0;
  let index = raw.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = raw.indexOf(token, index + token.length);
  }
  return count;
}

export function detectWorkflowPlaceholders(
  raw: string,
  tokens: Pick<WorkflowPlaceholderTokens, "positive" | "negative"> = {
    positive: DEFAULT_POSITIVE_TOKEN,
    negative: DEFAULT_NEGATIVE_TOKEN,
  },
): {
  positive: number;
  negative: number;
  seed: number;
  width: number;
  height: number;
  cfg: number;
  steps: number;
  sampler: number;
  scheduler: number;
  shift: number;
  fluxMaxShift: number;
  fluxBaseShift: number;
  denoise: number;
  inputImage: number;
  maskImage: number;
} {
  return {
    positive: countPlaceholders(raw, tokens.positive),
    negative: countPlaceholders(raw, tokens.negative),
    seed: countPlaceholders(raw, DEFAULT_SEED_TOKEN),
    width: countPlaceholders(raw, DEFAULT_WIDTH_TOKEN),
    height: countPlaceholders(raw, DEFAULT_HEIGHT_TOKEN),
    cfg: countPlaceholders(raw, DEFAULT_CFG_TOKEN),
    steps: countPlaceholders(raw, DEFAULT_STEPS_TOKEN),
    sampler: countPlaceholders(raw, DEFAULT_SAMPLER_TOKEN),
    scheduler: countPlaceholders(raw, DEFAULT_SCHEDULER_TOKEN),
    shift: countPlaceholders(raw, DEFAULT_SHIFT_TOKEN),
    fluxMaxShift: countPlaceholders(raw, DEFAULT_FLUX_MAX_SHIFT_TOKEN),
    fluxBaseShift: countPlaceholders(raw, DEFAULT_FLUX_BASE_SHIFT_TOKEN),
    denoise: countPlaceholders(raw, DEFAULT_DENOISE_TOKEN),
    inputImage: countPlaceholders(raw, DEFAULT_INPUT_IMAGE_TOKEN),
    maskImage: countPlaceholders(raw, DEFAULT_MASK_IMAGE_TOKEN),
  };
}

export function normalizeCustomWorkflowTokens(
  tokens?: CustomWorkflowToken[],
): CustomWorkflowToken[] {
  if (!tokens?.length) {
    return [];
  }

  return tokens
    .map((entry) => ({
      token: entry.token?.trim() ?? "",
      value: entry.value?.trim() ?? "",
    }))
    .filter((entry) => entry.token.length > 0 && entry.value.length > 0);
}

export function resolveCustomWorkflowTokens(
  runtime?: ComfyUiRuntimeConfig,
): CustomWorkflowToken[] {
  return normalizeCustomWorkflowTokens(runtime?.customTokens);
}

export function detectCustomWorkflowPlaceholders(
  raw: string,
  customTokens: CustomWorkflowToken[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of customTokens) {
    const count = countPlaceholders(raw, entry.token);
    if (count > 0) {
      counts[entry.token] = count;
    }
  }
  return counts;
}

function replaceTokenInValue(
  value: unknown,
  token: string,
  replacement: string,
): [unknown, number] {
  if (typeof value === "string") {
    if (!value.includes(token)) {
      return [value, 0];
    }
    return [value.split(token).join(replacement), countPlaceholders(value, token)];
  }

  if (Array.isArray(value)) {
    let total = 0;
    const next = value.map((entry) => {
      const [replaced, count] = replaceTokenInValue(entry, token, replacement);
      total += count;
      return replaced;
    });
    return [next, total];
  }

  if (value && typeof value === "object") {
    let total = 0;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const [replaced, count] = replaceTokenInValue(entry, token, replacement);
      next[key] = replaced;
      total += count;
    }
    return [next, total];
  }

  return [value, 0];
}

function injectParamToken(
  workflow: Record<string, unknown>,
  token: string,
  value: string,
): [Record<string, unknown>, number] {
  const [next, count] = replaceTokenInValue(workflow, token, value);
  return [next as Record<string, unknown>, count];
}

export function injectWorkflowPlaceholders(
  workflow: Record<string, unknown>,
  input: {
    positive: string;
    negative?: string;
    params?: WorkflowParamValues;
    customTokens?: CustomWorkflowToken[];
  },
  tokens: WorkflowPlaceholderTokens,
): WorkflowInjectionResult {
  let current = structuredClone(workflow);
  const paramReplacements: Partial<Record<keyof WorkflowParamValues, number>> =
    {};
  const customReplacements: Record<string, number> = {};

  const [withPositive, positiveReplacements] = replaceTokenInValue(
    current,
    tokens.positive,
    input.positive,
  );
  current = withPositive as Record<string, unknown>;

  let negativeReplacements = 0;
  if (input.negative?.trim()) {
    const [withNegative, count] = replaceTokenInValue(
      current,
      tokens.negative,
      input.negative.trim(),
    );
    current = withNegative as Record<string, unknown>;
    negativeReplacements = count;
  }

  if (input.params) {
    const paramEntries: Array<[keyof WorkflowParamValues, string, string]> = [
      ["seed", tokens.seed, input.params.seed?.toString() ?? ""],
      ["width", tokens.width, input.params.width?.toString() ?? ""],
      ["height", tokens.height, input.params.height?.toString() ?? ""],
      ["cfg", tokens.cfg, input.params.cfg?.toString() ?? ""],
      ["steps", tokens.steps, input.params.steps?.toString() ?? ""],
      ["samplerName", tokens.sampler, input.params.samplerName?.toString() ?? ""],
      ["scheduler", tokens.scheduler, input.params.scheduler?.toString() ?? ""],
      ["samplingShift", tokens.shift, input.params.samplingShift?.toString() ?? ""],
      ["fluxMaxShift", tokens.fluxMaxShift, input.params.fluxMaxShift?.toString() ?? ""],
      ["fluxBaseShift", tokens.fluxBaseShift, input.params.fluxBaseShift?.toString() ?? ""],
      ["denoise", tokens.denoise, input.params.denoise?.toString() ?? ""],
      ["inputImageFilename", tokens.inputImage, input.params.inputImageFilename?.toString() ?? ""],
      ["maskImageFilename", tokens.maskImage, input.params.maskImageFilename?.toString() ?? ""],
    ];

    for (const [key, token, value] of paramEntries) {
      if (!value) {
        continue;
      }
      const [next, count] = injectParamToken(current, token, value);
      current = next;
      if (count > 0) {
        paramReplacements[key] = count;
      }
    }
  }

  for (const entry of normalizeCustomWorkflowTokens(input.customTokens)) {
    const [next, count] = injectParamToken(current, entry.token, entry.value);
    current = next;
    if (count > 0) {
      customReplacements[entry.token] = count;
    }
  }

  return {
    workflow: current,
    positiveReplacements,
    negativeReplacements,
    paramReplacements,
    customReplacements:
      Object.keys(customReplacements).length > 0 ? customReplacements : undefined,
  };
}

function isSamplerLikeNode(classType: string, inputs: Record<string, unknown>): boolean {
  const lower = classType.toLowerCase();
  if (lower.includes("modelsampling")) {
    return false;
  }
  if (lower.includes("ksampler") || lower.includes("samplercustom")) {
    return true;
  }
  return "seed" in inputs && ("steps" in inputs || "cfg" in inputs);
}

export function patchSamplerParamsInWorkflow(
  workflow: Record<string, unknown>,
  params: WorkflowParamValues,
): {
  workflow: Record<string, unknown>;
  patched: Partial<Record<keyof WorkflowParamValues, number>>;
} {
  const next = structuredClone(workflow);
  const patched: Partial<Record<keyof WorkflowParamValues, number>> = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (!isSamplerLikeNode(record.class_type ?? "", inputs)) {
      continue;
    }

    if (params.seed != null && params.seed.toString().trim() !== "" && "seed" in inputs) {
      inputs.seed = Number(params.seed);
      patched.seed = (patched.seed ?? 0) + 1;
    }
    if (params.steps != null && params.steps.toString().trim() !== "" && "steps" in inputs) {
      inputs.steps = Number(params.steps);
      patched.steps = (patched.steps ?? 0) + 1;
    }
    if (params.cfg != null && params.cfg.toString().trim() !== "" && "cfg" in inputs) {
      inputs.cfg = Number(params.cfg);
      patched.cfg = (patched.cfg ?? 0) + 1;
    }
    if (
      params.samplerName != null &&
      params.samplerName.toString().trim() !== "" &&
      "sampler_name" in inputs
    ) {
      inputs.sampler_name = params.samplerName.toString().trim();
      patched.samplerName = (patched.samplerName ?? 0) + 1;
    }
    if (
      params.scheduler != null &&
      params.scheduler.toString().trim() !== "" &&
      "scheduler" in inputs
    ) {
      inputs.scheduler = params.scheduler.toString().trim();
      patched.scheduler = (patched.scheduler ?? 0) + 1;
    }
    if (
      params.denoise != null &&
      params.denoise.toString().trim() !== "" &&
      "denoise" in inputs
    ) {
      inputs.denoise = Number(params.denoise);
      patched.denoise = (patched.denoise ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

const ALTERNATE_POSITIVE_TOKENS = ["{{PROMPT}}", "{{prompt}}", "{{PROMPT_POS}}"];
const ALTERNATE_NEGATIVE_TOKENS = ["{{NEG_PROMPT}}", "{{neg_prompt}}", "{{NEGATIVE_PROMPT}}"];

function setWorkflowNodeText(
  workflow: Record<string, unknown>,
  nodeId: string,
  text: string,
): boolean {
  const node = workflow[nodeId];
  if (!node || typeof node !== "object") {
    return false;
  }

  const record = node as { inputs?: Record<string, unknown> };
  if (!record.inputs || !("text" in record.inputs)) {
    return false;
  }

  record.inputs = { ...record.inputs, text };
  return true;
}

function classifyClipPromptBinding(
  classType: string,
  title: string,
): "positive" | "negative" | "unknown" {
  const classLower = classType.toLowerCase();
  if (!classLower.includes("cliptextencode") && !classLower.includes("textencode")) {
    return "unknown";
  }

  const titleLower = title.toLowerCase();
  if (titleLower.includes("negative") || titleLower.includes(" neg")) {
    return "negative";
  }
  if (
    titleLower.includes("positive") ||
    titleLower.includes(" pos") ||
    titleLower.includes("prompt")
  ) {
    return "positive";
  }

  return "positive";
}

export function patchClipPromptNodesInWorkflow(
  workflow: Record<string, unknown>,
  input: { positive: string; negative?: string },
): {
  workflow: Record<string, unknown>;
  positivePatched: number;
  negativePatched: number;
} {
  const next = structuredClone(workflow);
  let positivePatched = 0;
  let negativePatched = 0;

  type ClipCandidate = {
    nodeId: string;
    binding: "positive" | "negative" | "unknown";
  };

  const candidates: ClipCandidate[] = [];
  for (const [nodeId, node] of Object.entries(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as {
      class_type?: string;
      _meta?: { title?: string };
      inputs?: Record<string, unknown>;
    };
    if (!record.inputs || !("text" in record.inputs)) {
      continue;
    }
    const binding = classifyClipPromptBinding(
      record.class_type ?? "",
      record._meta?.title ?? "",
    );
    if (binding === "unknown") {
      continue;
    }
    candidates.push({ nodeId, binding });
  }

  for (const candidate of candidates) {
    if (candidate.binding === "positive" && positivePatched === 0) {
      if (setWorkflowNodeText(next, candidate.nodeId, input.positive)) {
        positivePatched += 1;
      }
      continue;
    }
    if (
      candidate.binding === "negative" &&
      negativePatched === 0 &&
      input.negative?.trim()
    ) {
      if (setWorkflowNodeText(next, candidate.nodeId, input.negative.trim())) {
        negativePatched += 1;
      }
    }
  }

  if (positivePatched === 0) {
    for (const candidate of candidates) {
      if (candidate.binding !== "negative") {
        if (setWorkflowNodeText(next, candidate.nodeId, input.positive)) {
          positivePatched += 1;
          break;
        }
      }
    }
  }

  return { workflow: next, positivePatched, negativePatched };
}

function tryAlternatePromptTokens(
  workflow: Record<string, unknown>,
  input: { positive: string; negative?: string },
  tokens: WorkflowPlaceholderTokens,
  current: WorkflowInjectionResult,
): WorkflowInjectionResult {
  let result = current;

  if (result.positiveReplacements === 0) {
    for (const alt of ALTERNATE_POSITIVE_TOKENS) {
      if (alt === tokens.positive) {
        continue;
      }
      const [withAlt, count] = replaceTokenInValue(result.workflow, alt, input.positive);
      if (count > 0) {
        result = { ...result, workflow: withAlt as Record<string, unknown>, positiveReplacements: count };
        break;
      }
    }
  }

  if (result.negativeReplacements === 0 && input.negative?.trim()) {
    for (const alt of ALTERNATE_NEGATIVE_TOKENS) {
      if (alt === tokens.negative) {
        continue;
      }
      const [withAlt, count] = replaceTokenInValue(
        result.workflow,
        alt,
        input.negative.trim(),
      );
      if (count > 0) {
        result = {
          ...result,
          workflow: withAlt as Record<string, unknown>,
          negativeReplacements: count,
        };
        break;
      }
    }
  }

  return result;
}

function mergeLoaderTokensIntoCustomTokens(
  params: WorkflowParamValues | undefined,
  customTokens?: CustomWorkflowToken[],
): CustomWorkflowToken[] | undefined {
  const fromParams = loaderFilenameCustomTokens({
    checkpoint: params?.checkpointFilename?.trim(),
    unet: params?.unetFilename?.trim(),
    vae: params?.vaeFilename?.trim(),
  });
  if (params?.refinerCheckpointFilename?.trim()) {
    fromParams.push({
      token: DEFAULT_REFINER_TOKEN,
      value: params.refinerCheckpointFilename.trim(),
    });
  }
  if (fromParams.length === 0) {
    return customTokens;
  }
  const normalized = normalizeCustomWorkflowTokens(customTokens);
  const byToken = new Map(normalized.map((entry) => [entry.token, entry]));
  for (const entry of fromParams) {
    byToken.set(entry.token, entry);
  }
  return [...byToken.values()];
}

export function injectPromptsWithFallbacks(
  workflow: Record<string, unknown>,
  input: {
    positive: string;
    negative?: string;
    params?: WorkflowParamValues;
    customTokens?: CustomWorkflowToken[];
  },
  tokens: WorkflowPlaceholderTokens,
  options?: {
    legacyPositiveNodeId?: string;
    legacyNegativeNodeId?: string;
    directWorkflowPatching?: boolean;
    loaders?: ModelLoaderFilenames;
  },
): WorkflowInjectionResult {
  const mergedCustomTokens = mergeLoaderTokensIntoCustomTokens(
    input.params,
    input.customTokens,
  );
  let injected = injectWorkflowPlaceholders(
    workflow,
    { ...input, customTokens: mergedCustomTokens },
    tokens,
  );
  injected = tryAlternatePromptTokens(
    injected.workflow,
    { ...input, customTokens: mergedCustomTokens },
    tokens,
    injected,
  );

  const samplerPatch = patchSamplerParamsInWorkflow(
    injected.workflow,
    input.params ?? {},
  );
  const modelSamplingPatch = patchModelSamplingInWorkflow(
    samplerPatch.workflow,
    input.params ?? {},
  );
  let nextWorkflow = modelSamplingPatch.workflow;
  let directPatchCounts: Partial<Record<string, number>> = {};

  const loaders: ModelLoaderFilenames = {
    ...(options?.loaders ?? {}),
  };
  if (input.params?.checkpointFilename?.trim()) {
    loaders.checkpoint = input.params.checkpointFilename.trim();
  }
  if (input.params?.unetFilename?.trim()) {
    loaders.unet = input.params.unetFilename.trim();
  }
  if (input.params?.vaeFilename?.trim()) {
    loaders.vae = input.params.vaeFilename.trim();
  }

  if (options?.directWorkflowPatching !== false) {
    const directPatch = patchWorkflowDirectParams(nextWorkflow, {
      params: input.params,
      loaders,
      upscaleModelFilename: input.params?.upscaleModelFilename,
    });
    nextWorkflow = directPatch.workflow;
    directPatchCounts = directPatch.patched;
  } else if (loaders.checkpoint || loaders.unet || loaders.vae) {
    const loaderPatch = patchLoaderNodesInWorkflow(nextWorkflow, loaders);
    nextWorkflow = loaderPatch.workflow;
    directPatchCounts = {
      ...directPatchCounts,
      ...Object.fromEntries(
        Object.entries(loaderPatch.patched).filter(([, count]) => (count ?? 0) > 0),
      ),
    };
  }

  injected = {
    ...injected,
    workflow: nextWorkflow,
    paramReplacements: {
      ...injected.paramReplacements,
      ...Object.fromEntries(
        Object.entries(samplerPatch.patched).filter(([, count]) => (count ?? 0) > 0),
      ),
      ...Object.fromEntries(
        Object.entries(modelSamplingPatch.patched).filter(([, count]) => (count ?? 0) > 0),
      ),
      ...Object.fromEntries(
        Object.entries(directPatchCounts).filter(([, count]) => (count ?? 0) > 0),
      ),
    },
  };

  if (
    injected.positiveReplacements === 0 &&
    options?.legacyPositiveNodeId &&
    setWorkflowNodeText(injected.workflow, options.legacyPositiveNodeId, input.positive)
  ) {
    injected = { ...injected, positiveReplacements: 1 };
  }

  if (
    injected.negativeReplacements === 0 &&
    input.negative?.trim() &&
    options?.legacyNegativeNodeId &&
    setWorkflowNodeText(
      injected.workflow,
      options.legacyNegativeNodeId,
      input.negative.trim(),
    )
  ) {
    injected = { ...injected, negativeReplacements: 1 };
  }

  if (
    injected.positiveReplacements === 0 ||
    (input.negative?.trim() && injected.negativeReplacements === 0)
  ) {
    const clipPatch = patchClipPromptNodesInWorkflow(injected.workflow, {
      positive: input.positive,
      negative: input.negative,
    });
    injected = {
      ...injected,
      workflow: clipPatch.workflow,
      positiveReplacements:
        injected.positiveReplacements > 0
          ? injected.positiveReplacements
          : clipPatch.positivePatched,
      negativeReplacements:
        injected.negativeReplacements > 0
          ? injected.negativeReplacements
          : clipPatch.negativePatched,
    };
  }

  if (loaders.checkpoint || loaders.unet || loaders.vae) {
    injected = {
      ...injected,
      workflow: forceResolveLoaderPlaceholders(injected.workflow, loaders),
    };
  }

  return injected;
}

export function validateWorkflowJson(
  raw: string,
  tokens: Pick<WorkflowPlaceholderTokens, "positive" | "negative"> = {
    positive: DEFAULT_POSITIVE_TOKEN,
    negative: DEFAULT_NEGATIVE_TOKEN,
  },
): {
  ok: boolean;
  error?: string;
  nodeIds?: string[];
  placeholders?: ReturnType<typeof detectWorkflowPlaceholders>;
} {
  const workflow = parseWorkflowJson(raw);
  if (!workflow) {
    return { ok: false, error: "Workflow must be a JSON object." };
  }

  const nodeIds = listWorkflowNodeIds(workflow);
  if (nodeIds.length === 0) {
    return {
      ok: false,
      error: "No numeric node IDs found (expected ComfyUI API format).",
    };
  }

  const placeholders = detectWorkflowPlaceholders(raw, tokens);
  if (placeholders.positive === 0) {
    return {
      ok: false,
      error: `Workflow must include at least one ${tokens.positive} placeholder.`,
      nodeIds,
      placeholders,
    };
  }

  return { ok: true, nodeIds, placeholders };
}

export function stripEmptyComfyUiRuntime(
  runtime?: ComfyUiRuntimeConfig,
): ComfyUiRuntimeConfig | undefined {
  if (!runtime) {
    return undefined;
  }

  const result: ComfyUiRuntimeConfig = {};

  const apiUrl = runtime.apiUrl?.trim();
  if (apiUrl) {
    result.apiUrl = apiUrl;
  }

  const workflowJson = runtime.workflowJson?.trim();
  if (workflowJson) {
    result.workflowJson = workflowJson;
  }

  const workflowFileId = runtime.workflowFileId?.trim();
  if (workflowFileId) {
    result.workflowFileId = workflowFileId;
  }

  const positiveToken = runtime.positiveToken?.trim();
  if (positiveToken) {
    result.positiveToken = positiveToken;
  }

  const negativeToken = runtime.negativeToken?.trim();
  if (negativeToken) {
    result.negativeToken = negativeToken;
  }

  const queueTargetModel = runtime.queueTargetModel?.trim();
  if (queueTargetModel) {
    result.queueTargetModel = queueTargetModel;
  }

  if (runtime.directWorkflowPatching === false) {
    result.directWorkflowPatching = false;
  }
  if (runtime.workflowQueueOptimize === false) {
    result.workflowQueueOptimize = false;
  }
  if (runtime.workflowGraphEnrich === false) {
    result.workflowGraphEnrich = false;
  }
  if (runtime.workflowSdxlRefinerEnrich === false) {
    result.workflowSdxlRefinerEnrich = false;
  }
  if (runtime.workflowNeuralUpscalePolish === false) {
    result.workflowNeuralUpscalePolish = false;
  }
  if (runtime.workflowSharpenAfterUpscale === false) {
    result.workflowSharpenAfterUpscale = false;
  }

  if (runtime.queueQualityProfile) {
    result.queueQualityProfile = runtime.queueQualityProfile;
  }

  if (runtime.modelCheckpointMap && Object.keys(runtime.modelCheckpointMap).length > 0) {
    result.modelCheckpointMap = runtime.modelCheckpointMap;
  }
  if (runtime.modelVaeMap && Object.keys(runtime.modelVaeMap).length > 0) {
    result.modelVaeMap = runtime.modelVaeMap;
  }
  if (runtime.modelRefinerMap && Object.keys(runtime.modelRefinerMap).length > 0) {
    result.modelRefinerMap = runtime.modelRefinerMap;
  }
  if (runtime.modelUpscaleMap && Object.keys(runtime.modelUpscaleMap).length > 0) {
    result.modelUpscaleMap = runtime.modelUpscaleMap;
  }

  if (runtime.queueParams) {
    const params = { ...runtime.queueParams };
    const hasParams = Object.values(params).some(
      (value) => value != null && value.toString().trim() !== "",
    );
    if (hasParams) {
      result.queueParams = params;
    }
  }

  const customTokens = normalizeCustomWorkflowTokens(runtime.customTokens);
  if (customTokens.length > 0) {
    result.customTokens = customTokens;
  }

  if (Object.keys(result).length === 0) {
    return undefined;
  }

  return result;
}

export const WORKFLOW_PARAM_TOKEN_HELP = [
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_CFG_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  DEFAULT_UPSCALE_MODEL_TOKEN,
  DEFAULT_REFINER_TOKEN,
] as const;

export function resolveWorkflowGraphEnrichOptions(
  runtime?: ComfyUiRuntimeConfig,
): {
  enrichGraph: boolean;
  enrichSdxlRefiner: boolean;
  enrichNeuralPolish: boolean;
  enrichSharpen: boolean;
} {
  const enrichGraph = runtime?.workflowGraphEnrich !== false;
  return {
    enrichGraph,
    enrichSdxlRefiner:
      enrichGraph && runtime?.workflowSdxlRefinerEnrich !== false,
    enrichNeuralPolish:
      enrichGraph && runtime?.workflowNeuralUpscalePolish !== false,
    enrichSharpen:
      enrichGraph && runtime?.workflowSharpenAfterUpscale !== false,
  };
}
