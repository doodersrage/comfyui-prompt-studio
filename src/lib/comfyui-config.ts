import { isQwenLightningModel, patchModelSamplingInWorkflow } from "./model-sampling-patch";
import { isPromptStudioProtectedSampler, shouldSkipGlobalSamplerPatch } from "./workflow-enrich-markers";
import { prepareLightningWorkflowForQueue, prepareQwenEditReferenceImagesForQueue, resolveLightningBf16Loaders } from "./workflow-lightning-queue";
import { isEditCapableModel, isQwenRapidAioModel } from "./model-denoise-defaults";
import {
  buildLightningLoraFilenameMap,
  loraFilenameImpliesLightning,
} from "./workflow-lora-patch";
import { normalizeLoraLibrary, applyLoraStackToWorkflow, type LoraLibraryEntry } from "./lora-stack";
import {
  classifyPromptEncodeBinding,
  isPromptEncodeNode,
  resolvePromptEncodeTextField,
} from "./workflow-prompt-encode";
import {
  forceResolveLoaderPlaceholders,
  patchLoadImageMaskNodesInWorkflow,
  patchLoadImageNodesInWorkflow,
  patchLoaderNodesInWorkflow,
  patchWorkflowDirectParams,
} from "./workflow-direct-patch";
import { normalizeInputImageFilenames } from "./workflow-load-image-bindings";
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
export const DEFAULT_INPUT_IMAGE_2_TOKEN = "{{INPUT_IMAGE_2}}";
export const DEFAULT_INPUT_IMAGE_3_TOKEN = "{{INPUT_IMAGE_3}}";
export const DEFAULT_INPUT_IMAGE_4_TOKEN = "{{INPUT_IMAGE_4}}";
export const DEFAULT_MASK_IMAGE_TOKEN = "{{MASK_IMAGE}}";
/** Video (WAN / Hunyuan Video) init-image placeholder — mirrors {{INPUT_IMAGE}} for I2V graphs. */
export const DEFAULT_INIT_IMAGE_TOKEN = "{{INIT_IMAGE}}";
/** Video frame count / length placeholder (e.g. EmptyHunyuanLatentVideo `length`). */
export const DEFAULT_VIDEO_FRAMES_TOKEN = "{{VIDEO_FRAMES}}";
/** Video output frame rate placeholder (e.g. SaveAnimatedWEBP `fps`). */
export const DEFAULT_VIDEO_FPS_TOKEN = "{{VIDEO_FPS}}";

import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  DEFAULT_REFINER_TOKEN,
  loaderFilenameCustomTokens,
  realignLoaderFilenamesToWorkflowPrecision,
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
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  ensureLightningNativeResolutionParams,
  resolveModelResolutionParams,
} from "./model-resolution-defaults";
import {
  resolveModelSamplerParams,
  ensureDistilledSamplerParams,
  type ModelSamplerPresetTier,
} from "./model-sampler-defaults";
import {
  normalizeQueueQualityProfile,
  resolveEffectiveSamplerPreset,
  type QueueQualityProfile,
} from "./queue-quality-profile";
import {
  DEFAULT_UPSCALE_MODEL_TOKEN,
  resolveUpscaleModelFilename,
  type ModelUpscaleMap,
} from "./model-upscale-map";
import {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
} from "./ipadapter-workflow-patch";

export { DEFAULT_CHECKPOINT_TOKEN, DEFAULT_UNET_TOKEN, DEFAULT_VAE_TOKEN, DEFAULT_UPSCALE_MODEL_TOKEN, DEFAULT_REFINER_TOKEN };
export {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
};

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
  /** Additional reference images for multi-image edit (Figure 1–4). Index 0 mirrors `inputImageFilename`. */
  inputImageFilenames?: string[];
  maskImageFilename?: string;
  controlNetModelFilename?: string;
  controlImageFilename?: string;
  /** Extra control images for stacked ControlNetApply (index 0 mirrors controlImageFilename). */
  controlImageFilenames?: string[];
  /** ControlNet preprocessor mode (canny/pose/depth/…) when auto-inserting a chain. */
  controlNetMode?: string;
  /** {{IPADAPTER_IMAGE}} — filename of the identity/style reference image on a LoadImage node. */
  ipAdapterImageFilename?: string;
  /** Extra IP-Adapter refs for stacked apply chains (index 0 mirrors ipAdapterImageFilename). */
  ipAdapterImageFilenames?: string[];
  /** {{IPADAPTER_STRENGTH}} — 0–1 weight patched onto IPAdapter-family nodes. */
  ipAdapterStrength?: string | number;
  /** {{IPADAPTER_MODEL}} — optional ipadapter_file filename override. */
  ipAdapterModelFilename?: string;
  /**
   * Compose identity lock backend: IP-Adapter (default) or InstantID / PuLID / auto.
   * When instantid|pulid|auto, queue prefers insertIdentityChainIfMissing.
   */
  identityKind?: "ipadapter" | "instantid" | "pulid" | "auto";
  /** Video (WAN / Hunyuan Video) frame count / length — feeds {{VIDEO_FRAMES}}. */
  videoFrames?: string | number;
  /** Video output frame rate — feeds {{VIDEO_FPS}}. */
  videoFps?: string | number;
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
  /**
   * Tokens from the selected workflow library file only. Beat Settings tokens for
   * the same key, and beat modelCheckpointMap for CHECKPOINT/UNET/VAE.
   */
  workflowCustomTokens?: CustomWorkflowToken[];
  /** When false, skip direct EmptyLatentImage / loader patching (placeholder injection still runs). */
  directWorkflowPatching?: boolean;
  /** When true, overwrite hardcoded loader filenames with the target model at queue time. */
  syncWorkflowLoadersToModel?: boolean;
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
  /**
   * When true (default), Draft queues rewrite SaveImage to a WebP-capable custom
   * node when ComfyUI has one installed; Final/Max stay PNG.
   */
  compactDraftSaves?: boolean;
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
  /** Hash from last library optimize — skips redundant queue-time optimize when unchanged. */
  workflowOptimizedHash?: string;
  /** Model id from last library optimize — required with hash for full early-exit. */
  workflowOptimizedModel?: string;
  /** Quality profile from last library optimize — required with hash for full early-exit. */
  workflowOptimizedProfile?: import("./queue-quality-profile").QueueQualityProfile;
  /** When Use system workflows is on: whether queue used a library pack or built-in scaffold. */
  systemWorkflowSource?: "pack" | "scaffold";
  /** Display label for the pack filename or "Built-in scaffold". */
  systemWorkflowLabel?: string;
  /**
   * LoRA library forwarded from Settings — carries strengths/enabled/order that
   * {{LORA_*}} custom tokens alone cannot express for queue-time stacking.
   */
  loraLibrary?: LoraLibraryEntry[];
  /** Multi-slot regional edit — bound at inject / direct-patch time. */
  regionalSlots?: import("./regional-prompt-slots").RegionalPromptSlot[];
  /**
   * Preferred ComfyUI pool host from SharedToolSettings. When set and the host
   * is in COMFYUI_POOL and healthy-ish, pool routing prefers it.
   */
  preferredComfyHost?: string;
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
  /** Video init-image placeholder — same resolved value as inputImage, distinct token. Optional so pre-existing token sets built elsewhere don't need updating. */
  initImage?: string;
  videoFrames?: string;
  videoFps?: string;
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
    initImage:
      process.env.COMFYUI_INIT_IMAGE_TOKEN?.trim() || DEFAULT_INIT_IMAGE_TOKEN,
    videoFrames:
      process.env.COMFYUI_VIDEO_FRAMES_TOKEN?.trim() || DEFAULT_VIDEO_FRAMES_TOKEN,
    videoFps:
      process.env.COMFYUI_VIDEO_FPS_TOKEN?.trim() || DEFAULT_VIDEO_FPS_TOKEN,
  };
}

export function resolveQueueParams(
  runtime?: ComfyUiRuntimeConfig,
  override?: WorkflowParamValues,
  options?: { model?: string },
): WorkflowParamValues {
  const merged = {
    ...(runtime?.queueParams ?? {}),
    ...(override ?? {}),
  };

  const model = options?.model?.trim() || runtime?.queueTargetModel?.trim();
  const orientation = DEFAULT_RESOLUTION_ORIENTATION;
  const sizeTier = DEFAULT_RESOLUTION_SIZE_TIER;
  const presetTier = resolveEffectiveSamplerPreset(
    "base",
    runtime?.queueQualityProfile,
  );
  const modelSampler = model ? resolveModelSamplerParams(model, presetTier) : undefined;
  const modelResolution = model
    ? resolveModelResolutionParams(model, orientation, sizeTier)
    : undefined;

  const result: WorkflowParamValues = {
    seed:
      merged.seed?.toString().trim() ||
      modelSampler?.seed?.toString().trim() ||
      String(Math.floor(Math.random() * 2 ** 32)),
    width:
      merged.width?.toString().trim() ||
      modelResolution?.width?.toString() ||
      "1024",
    height:
      merged.height?.toString().trim() ||
      modelResolution?.height?.toString() ||
      "1024",
    cfg:
      merged.cfg?.toString().trim() ||
      (modelSampler?.cfg != null ? String(modelSampler.cfg) : "7"),
    steps:
      merged.steps?.toString().trim() ||
      (modelSampler?.steps != null ? String(modelSampler.steps) : "20"),
    samplerName:
      merged.samplerName?.toString().trim() ||
      modelSampler?.samplerName?.toString() ||
      "euler",
    scheduler:
      merged.scheduler?.toString().trim() ||
      modelSampler?.scheduler?.toString() ||
      "normal",
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
  if (Array.isArray(merged.inputImageFilenames) && merged.inputImageFilenames.length > 0) {
    const filenames = merged.inputImageFilenames
      .map((entry) => entry?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 4);
    if (filenames.length > 0) {
      result.inputImageFilenames = filenames;
      if (!result.inputImageFilename) {
        result.inputImageFilename = filenames[0];
      }
    }
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
  if (merged.videoFrames != null && merged.videoFrames.toString().trim() !== "") {
    result.videoFrames = merged.videoFrames;
  }
  if (merged.videoFps != null && merged.videoFps.toString().trim() !== "") {
    result.videoFps = merged.videoFps;
  }

  if (model) {
    const aligned = ensureLightningNativeResolutionParams(
      result,
      model,
      orientation,
      sizeTier,
    );
    if (aligned.width != null) {
      result.width = aligned.width.toString();
    }
    if (aligned.height != null) {
      result.height = aligned.height.toString();
    }
    const samplerAligned = ensureDistilledSamplerParams(result, model, presetTier);
    if (samplerAligned.steps != null) {
      result.steps = samplerAligned.steps.toString();
    }
    if (samplerAligned.cfg != null) {
      result.cfg = samplerAligned.cfg.toString();
    }
    if (samplerAligned.samplerName != null) {
      result.samplerName = samplerAligned.samplerName.toString();
    }
    if (samplerAligned.scheduler != null) {
      result.scheduler = samplerAligned.scheduler.toString();
    }
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
    workflowCustomTokens?: CustomWorkflowToken[];
    precisionTier?: LoaderPrecisionTier;
    workflow?: Record<string, unknown>;
  },
): WorkflowParamValues {
  if (!model?.trim()) {
    return params;
  }

  const loaders = resolveLoaderFilenamesForModel(model, options);
  const next = { ...params };
  const workflowTokens = options?.workflowCustomTokens ?? [];
  const hasWorkflowCheckpoint = workflowTokens.some(
    (entry) => entry.token.trim() === DEFAULT_CHECKPOINT_TOKEN && entry.value.trim(),
  );
  const hasWorkflowUnet = workflowTokens.some(
    (entry) => entry.token.trim() === DEFAULT_UNET_TOKEN && entry.value.trim(),
  );
  const hasWorkflowVae = workflowTokens.some(
    (entry) => entry.token.trim() === DEFAULT_VAE_TOKEN && entry.value.trim(),
  );

  if ((hasWorkflowCheckpoint || !next.checkpointFilename?.trim()) && loaders.checkpoint) {
    next.checkpointFilename = loaders.checkpoint;
  }
  if ((hasWorkflowUnet || !next.unetFilename?.trim()) && loaders.unet) {
    next.unetFilename = loaders.unet;
  }
  if ((hasWorkflowVae || !next.vaeFilename?.trim()) && loaders.vae) {
    next.vaeFilename = loaders.vae;
  }

  if (isQwenLightningModel(model)) {
    const bf16 = resolveLightningBf16Loaders(model, {
      checkpoint: next.checkpointFilename?.toString(),
      unet: next.unetFilename?.toString(),
      vae: next.vaeFilename?.toString(),
      dualClip: loaders.dualClip,
    });
    if (bf16.unet) {
      next.unetFilename = bf16.unet;
    }
    if (bf16.checkpoint) {
      next.checkpointFilename = bf16.checkpoint;
    }
    if (bf16.vae) {
      next.vaeFilename = bf16.vae;
    }
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
  const workflowCustomTokens = normalizeCustomWorkflowTokens(
    input.runtime?.workflowCustomTokens,
  );
  const model = input.model?.trim() || input.runtime?.queueTargetModel?.trim();
  const precisionTier = resolveLoaderPrecisionTier({
    workflow: input.workflow,
    explicit: input.precisionTier,
    model,
  });
  const loaderMapOptions = {
    customTokens: baseCustomTokens,
    workflowCustomTokens,
    checkpointMap: input.runtime?.modelCheckpointMap,
    vaeMap: input.runtime?.modelVaeMap,
    precisionTier,
    workflow: input.workflow,
  };
  const mergedParams = realignLoaderFilenamesToWorkflowPrecision(
    resolveQueueParams(input.runtime, input.override, { model }),
    model ?? "",
    input.workflow,
    loaderMapOptions,
  );
  let params = ensureQueueLoaderParams(mergedParams, model, loaderMapOptions);

  const inferred = model
    ? resolveLoaderFilenamesForModel(model, loaderMapOptions)
    : ({} as ModelLoaderFilenames);

  const loaders: ModelLoaderFilenames = {
    checkpoint: params.checkpointFilename?.trim() || inferred.checkpoint,
    unet: params.unetFilename?.trim() || inferred.unet,
    vae: params.vaeFilename?.trim() || inferred.vae,
    dualClip: inferred.dualClip,
  };

  if (isQwenLightningModel(model)) {
    Object.assign(loaders, resolveLightningBf16Loaders(model, loaders));
    if (loaders.unet) {
      params.unetFilename = loaders.unet;
    }
    if (loaders.checkpoint) {
      params.checkpointFilename = loaders.checkpoint;
    }
    if (loaders.vae) {
      params.vaeFilename = loaders.vae;
    }
  }

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

  const loaderMerged =
    mergeLoaderTokensIntoCustomTokens(params, baseCustomTokens) ?? baseCustomTokens;
  // Per-workflow token overrides always win (e.g. {{LORA_LIGHTNING}} on the library file).
  const customTokenByKey = new Map<string, CustomWorkflowToken>();
  for (const entry of [...loaderMerged, ...workflowCustomTokens]) {
    customTokenByKey.set(entry.token, entry);
  }
  const customTokens = [...customTokenByKey.values()];

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
  const loraTokenPattern = /^\{\{LORA_[A-Z0-9_]+\}\}$/;

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
      const trimmed = value.trim();
      for (const token of loaderTokens) {
        if (trimmed.includes(token)) {
          unresolved.add(token);
        }
      }
      if (loraTokenPattern.test(trimmed)) {
        unresolved.add(trimmed);
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
  initImage: number;
  videoFrames: number;
  videoFps: number;
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
    initImage: countPlaceholders(raw, DEFAULT_INIT_IMAGE_TOKEN),
    videoFrames: countPlaceholders(raw, DEFAULT_VIDEO_FRAMES_TOKEN),
    videoFps: countPlaceholders(raw, DEFAULT_VIDEO_FPS_TOKEN),
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
  // replaceTokenInValue builds a new tree — no defensive clone needed here.
  let current = workflow;
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
      // {{INIT_IMAGE}} mirrors the same resolved input image for video I2V graphs.
      [
        "inputImageFilename",
        tokens.initImage ?? DEFAULT_INIT_IMAGE_TOKEN,
        input.params.inputImageFilename?.toString() ?? "",
      ],
      [
        "videoFrames",
        tokens.videoFrames ?? DEFAULT_VIDEO_FRAMES_TOKEN,
        input.params.videoFrames?.toString() ?? "",
      ],
      [
        "videoFps",
        tokens.videoFps ?? DEFAULT_VIDEO_FPS_TOKEN,
        input.params.videoFps?.toString() ?? "",
      ],
    ];

    for (const [key, token, value] of paramEntries) {
      if (!value) {
        continue;
      }
      const [next, count] = injectParamToken(current, token, value);
      current = next;
      if (count > 0) {
        paramReplacements[key] = (paramReplacements[key] ?? 0) + count;
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
  if (
    lower.includes("ksampler") ||
    lower.includes("samplercustom") ||
    lower.includes("guider") ||
    lower.includes("basicscheduler")
  ) {
    return true;
  }
  return "seed" in inputs && ("steps" in inputs || "cfg" in inputs);
}

export function patchSamplerParamsInWorkflow(
  workflow: Record<string, unknown>,
  params: WorkflowParamValues,
  model?: string,
  options?: { force?: boolean; mutateInPlace?: boolean },
): {
  workflow: Record<string, unknown>;
  patched: Partial<Record<keyof WorkflowParamValues, number>>;
} {
  const next = options?.mutateInPlace
    ? workflow
    : structuredClone(workflow);
  const patched: Partial<Record<keyof WorkflowParamValues, number>> = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      _meta?: { title?: string };
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (!isSamplerLikeNode(record.class_type ?? "", inputs)) {
      continue;
    }

    if (isPromptStudioProtectedSampler(record)) {
      continue;
    }

    if (!options?.force && shouldSkipGlobalSamplerPatch(record)) {
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
    if ("denoise" in inputs) {
      const current = inputs.denoise;
      const isPlaceholder =
        typeof current === "string" &&
        (current.trim() === DEFAULT_DENOISE_TOKEN ||
          /^\{\{DENOISE\}\}$/.test(current.trim()));
      const resolvedDenoise =
        params.denoise != null && params.denoise.toString().trim() !== ""
          ? Number(params.denoise)
          : isPlaceholder
            ? 1
            : null;
      if (resolvedDenoise != null && (isPlaceholder || params.denoise != null)) {
        inputs.denoise = resolvedDenoise;
        patched.denoise = (patched.denoise ?? 0) + 1;
      }
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

  const record = node as { class_type?: string; inputs?: Record<string, unknown> };
  if (!record.inputs) {
    return false;
  }

  const field = resolvePromptEncodeTextField(record.inputs);
  if (!field) {
    return false;
  }

  record.inputs = { ...record.inputs, [field]: text };
  return true;
}

function classifyClipPromptBinding(
  classType: string,
  title: string,
): "positive" | "negative" | "unknown" {
  if (isPromptEncodeNode(classType)) {
    return classifyPromptEncodeBinding(classType, title);
  }

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
    if (!record.inputs) {
      continue;
    }
    const promptField = resolvePromptEncodeTextField(record.inputs);
    if (!promptField) {
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

  const multiImageTokens = [
    DEFAULT_INPUT_IMAGE_TOKEN,
    DEFAULT_INPUT_IMAGE_2_TOKEN,
    DEFAULT_INPUT_IMAGE_3_TOKEN,
    DEFAULT_INPUT_IMAGE_4_TOKEN,
  ] as const;
  const filenames = normalizeInputImageFilenames(
    params?.inputImageFilename,
    params?.inputImageFilenames,
  );
  for (let i = 0; i < multiImageTokens.length; i += 1) {
    const value = filenames[i]?.trim();
    if (value) {
      fromParams.push({ token: multiImageTokens[i], value });
    }
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
    syncWorkflowLoadersToModel?: boolean;
    loaders?: ModelLoaderFilenames;
    model?: string;
    availableLoras?: string[] | null;
    qualityProfile?: QueueQualityProfile;
    samplerPresetTier?: ModelSamplerPresetTier;
    /** Active LoRA stack (strengths/enabled/order) — patched at queue time (incl. Lightning). */
    loraLibrary?: LoraLibraryEntry[];
    /** ComfyUI object_info node class names — gates the optional CLIPVisionLoader on IP-Adapter insert. */
    availableNodeTypes?: Iterable<string> | null;
    /** Multi-slot regional edit prompts/masks. */
    regionalSlots?: import("./regional-prompt-slots").RegionalPromptSlot[];
  },
): WorkflowInjectionResult {
  const loaderMerged = mergeLoaderTokensIntoCustomTokens(
    input.params,
    input.customTokens,
  );
  // Fill {{LORA_LIGHTNING}} from workflow tokens / LoRA library / ComfyUI inventory
  // before string injection so unresolved placeholders cannot survive into preflight.
  const lightningMap = buildLightningLoraFilenameMap(
    loaderMerged ?? [],
    options?.model,
    options?.availableLoras ?? undefined,
  );
  const customTokenByKey = new Map<string, CustomWorkflowToken>();
  for (const entry of loaderMerged ?? []) {
    customTokenByKey.set(entry.token, entry);
  }
  for (const [token, value] of Object.entries(lightningMap)) {
    if (token.trim() && value.trim()) {
      customTokenByKey.set(token, { token, value });
    }
  }
  // Lightning graphs must not resolve style/catalog {{LORA_*}} tokens — they cause
  // banding / melt even when neutralize later zeros strengths. Keep only Lightning.
  const isLightningModel = isQwenLightningModel(options?.model);
  const mergedCustomTokens = [...customTokenByKey.values()].filter((entry) => {
    if (!isLightningModel) {
      return true;
    }
    const token = entry.token.trim();
    if (!/^\{\{LORA_/i.test(token)) {
      return true;
    }
    if (/LIGHTNING|LIGHTX2V/i.test(token)) {
      return true;
    }
    return loraFilenameImpliesLightning(entry.value ?? "");
  });
  let injected = injectWorkflowPlaceholders(
    workflow,
    { ...input, customTokens: mergedCustomTokens },
    tokens,
  );
  injected = tryAlternatePromptTokens(
    injected.workflow,
    { positive: input.positive, negative: input.negative },
    tokens,
    injected,
  );

  // Placeholder inject returns a private tree — mutate sampler/sampling in place.
  const samplerPatch = patchSamplerParamsInWorkflow(
    injected.workflow,
    input.params ?? {},
    options?.model,
    { mutateInPlace: true },
  );
  const modelSamplingPatch = patchModelSamplingInWorkflow(
    samplerPatch.workflow,
    input.params ?? {},
    options?.model,
    { mutateInPlace: true },
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
  if (!loaders.dualClip && options?.loaders?.dualClip) {
    loaders.dualClip = options.loaders.dualClip;
  }

  const isLightning = isQwenLightningModel(options?.model);

  if (isLightning) {
    // Native Lightning graphs: do not rewrite concrete loaders / latent sizes.
    // Only fill unresolved placeholders and attach queue input images.
    nextWorkflow = forceResolveLoaderPlaceholders(nextWorkflow, loaders);
    const figureFilenames = normalizeInputImageFilenames(
      input.params?.inputImageFilename,
      input.params?.inputImageFilenames,
    );
    // Single figure: patch LoadImage early. Multi-figure Compose refs are owned
    // by prepareLightning → ensure (LoadImage create/title + encode wiring).
    if (figureFilenames.length <= 1) {
      nextWorkflow = patchLoadImageNodesInWorkflow(
        nextWorkflow,
        figureFilenames[0],
      ).workflow;
    }
    nextWorkflow = patchLoadImageMaskNodesInWorkflow(
      nextWorkflow,
      input.params?.maskImageFilename,
    ).workflow;
  } else if (options?.directWorkflowPatching !== false) {
    const directPatch = patchWorkflowDirectParams(nextWorkflow, {
      params: input.params,
      loaders,
      upscaleModelFilename: input.params?.upscaleModelFilename,
      controlNetModelFilename: input.params?.controlNetModelFilename,
      controlImageFilename: input.params?.controlImageFilename,
      controlImageFilenames: input.params?.controlImageFilenames,
      ipAdapterImageFilename: input.params?.ipAdapterImageFilename,
      ipAdapterImageFilenames: input.params?.ipAdapterImageFilenames,
      ipAdapterStrength: input.params?.ipAdapterStrength,
      ipAdapterModelFilename: input.params?.ipAdapterModelFilename,
      availableNodeTypes: options?.availableNodeTypes,
      identityKind: input.params?.identityKind,
      customTokens: mergedCustomTokens,
      syncWorkflowLoadersToModel: options?.syncWorkflowLoadersToModel,
      model: options?.model,
      loraLibrary: options?.loraLibrary,
      prompt: input.positive,
      regionalSlots: options?.regionalSlots,
    });
    if (directPatch.error) {
      throw new Error(directPatch.error);
    }
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

  nextWorkflow = prepareLightningWorkflowForQueue(
    nextWorkflow,
    options?.model,
    buildLightningLoraFilenameMap(
      mergedCustomTokens ?? [],
      options?.model,
      options?.availableLoras ?? undefined,
    ),
    {
      params: input.params,
      loaders,
      syncLoadersToModel: isLightning ? false : options?.syncWorkflowLoadersToModel,
    },
  );

  // Lightning prep zeros baked-in pack style LoRAs. Re-apply the session/Settings
  // stack afterward so sidebar picks still load (on neutralized anchors or after
  // the Lightning node when the graph has no style loaders).
  if (isLightning) {
    const loraStackPatch = applyLoraStackToWorkflow(
      nextWorkflow,
      options?.loraLibrary,
      { prompt: input.positive },
    );
    nextWorkflow = loraStackPatch.workflow;
    directPatchCounts = {
      ...directPatchCounts,
      ...Object.fromEntries(
        Object.entries(loraStackPatch.patched).filter(
          ([, count]) => (count ?? 0) > 0,
        ),
      ),
    };
  }

  // Non-Lightning edit packs/scaffolds still need Figure→encode wiring.
  if (
    options?.model &&
    !isQwenLightningModel(options.model) &&
    (isEditCapableModel(options.model) || /edit/i.test(options.model))
  ) {
    nextWorkflow = prepareQwenEditReferenceImagesForQueue(
      nextWorkflow,
      options.model,
      input.params,
    );
  }

  const distilledModelId = options?.model;
  if (
    distilledModelId &&
    (isQwenLightningModel(distilledModelId) || isQwenRapidAioModel(distilledModelId))
  ) {
    const distilledTier = resolveEffectiveSamplerPreset(
      options?.samplerPresetTier,
      options?.qualityProfile != null
        ? normalizeQueueQualityProfile(options.qualityProfile)
        : undefined,
    );
    const distilledSampler = ensureDistilledSamplerParams(
      input.params ?? {},
      distilledModelId,
      distilledTier,
    );
    nextWorkflow = patchSamplerParamsInWorkflow(
      nextWorkflow,
      distilledSampler,
      distilledModelId,
      { force: true, mutateInPlace: true },
    ).workflow;
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

  const preferredComfyHost = runtime.preferredComfyHost?.trim();
  if (preferredComfyHost) {
    result.preferredComfyHost = preferredComfyHost;
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
  if (runtime.syncWorkflowLoadersToModel === true) {
    result.syncWorkflowLoadersToModel = true;
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
  // Sharpen is opt-in — persist both true and false so server enrich matches Settings.
  if (runtime.workflowSharpenAfterUpscale === true) {
    result.workflowSharpenAfterUpscale = true;
  } else if (runtime.workflowSharpenAfterUpscale === false) {
    result.workflowSharpenAfterUpscale = false;
  }
  if (runtime.compactDraftSaves === false) {
    result.compactDraftSaves = false;
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

  const workflowOptimizedHash = runtime.workflowOptimizedHash?.trim();
  if (workflowOptimizedHash) {
    result.workflowOptimizedHash = workflowOptimizedHash;
  }
  const workflowOptimizedModel = runtime.workflowOptimizedModel?.trim();
  if (workflowOptimizedModel) {
    result.workflowOptimizedModel = workflowOptimizedModel;
  }
  if (runtime.workflowOptimizedProfile) {
    result.workflowOptimizedProfile = runtime.workflowOptimizedProfile;
  }
  if (runtime.systemWorkflowSource === "pack" || runtime.systemWorkflowSource === "scaffold") {
    result.systemWorkflowSource = runtime.systemWorkflowSource;
  }
  const systemWorkflowLabel = runtime.systemWorkflowLabel?.trim();
  if (systemWorkflowLabel) {
    result.systemWorkflowLabel = systemWorkflowLabel;
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

  const workflowCustomTokens = normalizeCustomWorkflowTokens(
    runtime.workflowCustomTokens,
  );
  if (workflowCustomTokens.length > 0) {
    result.workflowCustomTokens = workflowCustomTokens;
  }

  const loraLibrary = normalizeLoraLibrary(runtime.loraLibrary).filter((entry) =>
    entry.tokenValue?.trim(),
  );
  if (loraLibrary.length > 0) {
    result.loraLibrary = loraLibrary;
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
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  DEFAULT_UPSCALE_MODEL_TOKEN,
  DEFAULT_REFINER_TOKEN,
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
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
  const isMax =
    normalizeQueueQualityProfile(runtime?.queueQualityProfile) === "max";
  return {
    enrichGraph,
    enrichSdxlRefiner:
      enrichGraph && runtime?.workflowSdxlRefinerEnrich !== false,
    enrichNeuralPolish:
      enrichGraph &&
      (isMax || runtime?.workflowNeuralUpscalePolish !== false),
    // Max quality enables sharpen unless the user explicitly turned it off.
    enrichSharpen:
      enrichGraph &&
      (isMax
        ? runtime?.workflowSharpenAfterUpscale !== false
        : runtime?.workflowSharpenAfterUpscale === true),
  };
}
