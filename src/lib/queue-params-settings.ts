import type { WorkflowParamValues } from "./comfyui-config";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";
import {
  DEFAULT_MODEL_SAMPLER_PRESET_TIER,
  ensureLightningSamplerParams,
  normalizeModelSamplerPresetTier,
  resolveModelSamplerParams,
  type ModelSamplerPresetTier,
} from "./model-sampler-defaults";
import { resolveModelSamplingParams } from "./model-sampling-patch";
import { resolveDenoiseForModel } from "./model-denoise-defaults";
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  ensureLightningNativeResolutionParams,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveModelResolutionParams,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from "./model-resolution-defaults";
import type { ComfyImageModel } from "./comfy-models";
import { loadComfyUiSettings, mergeLoraLibraryIntoCustomTokens } from "./comfyui-settings";
import {
  realignLoaderFilenamesToWorkflowPrecision,
  resolveLoaderFilenamesForModel,
  resolveRefinerFilenameForModel,
} from "./model-checkpoint-map";
import { resolveLoaderPrecisionTier } from "./model-loader-precision";
import { resolveUpscaleModelFilename } from "./model-upscale-map";
import { resolveControlNetModelFilename } from "./model-controlnet-map";
import { loadSettingsCache } from "./settings-cache";
import {
  resolveEffectiveResolutionSizeTier,
  resolveEffectiveSamplerPreset,
  resolveQueueQualityProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";

export const QUEUE_PARAMS_KEY = "comfy-queue-params-v1";

export type QueueParamsSettings = WorkflowParamValues & {
  enabled?: boolean;
};

export type ResolveQueueParamsOptions = {
  model?: ComfyImageModel | string;
  base?: WorkflowParamValues;
  samplerPreset?: ModelSamplerPresetTier;
  resolutionOrientation?: ResolutionOrientation;
  resolutionSizeTier?: ResolutionSizeTier;
  tool?: string;
  inputImageFilename?: string;
  maskImageFilename?: string;
  controlImageFilename?: string;
  qualityProfile?: QueueQualityProfile;
  workflow?: Record<string, unknown>;
};

function loadModelSamplerPresetTier(): ModelSamplerPresetTier {
  if (typeof window === "undefined") {
    return DEFAULT_MODEL_SAMPLER_PRESET_TIER;
  }
  return normalizeModelSamplerPresetTier(
    loadSettingsCache().shared.modelSamplerPreset,
  );
}

function loadModelResolutionOrientation(): ResolutionOrientation {
  if (typeof window === "undefined") {
    return DEFAULT_RESOLUTION_ORIENTATION;
  }
  return normalizeResolutionOrientation(
    loadSettingsCache().shared.modelResolutionOrientation,
  );
}

function loadModelResolutionSizeTier(): ResolutionSizeTier {
  if (typeof window === "undefined") {
    return DEFAULT_RESOLUTION_SIZE_TIER;
  }
  return normalizeResolutionSizeTier(
    loadSettingsCache().shared.modelResolutionSizeTier,
  );
}

export const DEFAULT_QUEUE_PARAMS: QueueParamsSettings = {
  enabled: false,
  seed: "",
  width: "",
  height: "",
  cfg: "",
  steps: "",
};

export function loadQueueParamsSettings(): QueueParamsSettings {
  if (typeof window === "undefined") {
    return DEFAULT_QUEUE_PARAMS;
  }
  try {
    const parsed = readBrowserValue<QueueParamsSettings>(QUEUE_PARAMS_KEY);
    if (!parsed) {
      return DEFAULT_QUEUE_PARAMS;
    }
    return { ...DEFAULT_QUEUE_PARAMS, ...parsed };
  } catch {
    return DEFAULT_QUEUE_PARAMS;
  }
}

export function saveQueueParamsSettings(settings: QueueParamsSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserValue(QUEUE_PARAMS_KEY, settings);
}

function normalizeResolveQueueParamsInput(
  input?: WorkflowParamValues | ResolveQueueParamsOptions,
): ResolveQueueParamsOptions {
  if (!input) {
    return {};
  }
  if ("model" in input || "base" in input || "samplerPreset" in input || "resolutionOrientation" in input || "resolutionSizeTier" in input || "tool" in input || "inputImageFilename" in input || "maskImageFilename" in input || "controlImageFilename" in input || "qualityProfile" in input || "workflow" in input) {
    return input as ResolveQueueParamsOptions;
  }
  return { base: input as WorkflowParamValues };
}

export function resolveQueueParams(
  input?: WorkflowParamValues | ResolveQueueParamsOptions,
): WorkflowParamValues {
  const { model, base, samplerPreset, resolutionOrientation, resolutionSizeTier, tool, inputImageFilename, maskImageFilename, controlImageFilename, qualityProfile, workflow } =
    normalizeResolveQueueParamsInput(input);
  const settings = loadQueueParamsSettings();
  const shared = loadSettingsCache().shared;
  const profile = resolveQueueQualityProfile({
    tool,
    override: qualityProfile,
    global: shared.queueQualityProfile,
    toolProfiles: shared.toolQueueQualityProfiles,
  });
  const presetTier = resolveEffectiveSamplerPreset(
    samplerPreset ?? loadModelSamplerPresetTier(),
    profile,
  );
  const orientation = resolutionOrientation ?? loadModelResolutionOrientation();
  const sizeTier = resolveEffectiveResolutionSizeTier(
    resolutionSizeTier ?? loadModelResolutionSizeTier(),
    profile,
  );
  const modelDefaults = model
    ? {
        ...resolveModelSamplerParams(model, presetTier),
        ...resolveModelResolutionParams(model, orientation, sizeTier),
        ...resolveModelSamplingParams(model, presetTier),
      }
    : {};

  const seed =
    settings.seed?.toString().trim() ||
    base?.seed?.toString().trim() ||
    modelDefaults.seed?.toString().trim() ||
    String(Math.floor(Math.random() * 2 ** 32));

  const merged: WorkflowParamValues = {
    seed,
    ...(settings.enabled
      ? {
          width:
            settings.width?.toString().trim() ||
            base?.width?.toString().trim() ||
            modelDefaults.width?.toString().trim(),
          height:
            settings.height?.toString().trim() ||
            base?.height?.toString().trim() ||
            modelDefaults.height?.toString().trim(),
          cfg:
            settings.cfg?.toString().trim() ||
            base?.cfg?.toString().trim() ||
            modelDefaults.cfg?.toString().trim(),
          steps:
            settings.steps?.toString().trim() ||
            base?.steps?.toString().trim() ||
            modelDefaults.steps?.toString().trim(),
        }
      : {
          ...modelDefaults,
          ...base,
          seed,
        }),
  };

  for (const key of Object.keys(merged) as Array<keyof WorkflowParamValues>) {
    const value = merged[key];
    if (value == null || value.toString().trim() === "") {
      delete merged[key];
    }
  }

  if (model) {
    const comfySettings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings());
    const customTokens = comfySettings.customTokens ?? [];
    const loaderMapOptions = {
      checkpointMap: shared.modelCheckpointMap,
      vaeMap: shared.modelVaeMap,
      customTokens,
      workflow,
      precisionTier: resolveLoaderPrecisionTier({ workflow, model }),
    };
    const aligned = realignLoaderFilenamesToWorkflowPrecision(
      merged,
      model,
      workflow,
      loaderMapOptions,
    );
    const loaders = resolveLoaderFilenamesForModel(model, loaderMapOptions);
    if (loaders.checkpoint) {
      aligned.checkpointFilename = loaders.checkpoint;
    }
    if (loaders.unet) {
      aligned.unetFilename = loaders.unet;
    }
    if (loaders.vae) {
      aligned.vaeFilename = loaders.vae;
    }
    Object.assign(merged, aligned);

    const upscaleModel = resolveUpscaleModelFilename(model, {
      upscaleMap: shared.modelUpscaleMap,
      customTokens,
    });
    if (upscaleModel) {
      merged.upscaleModelFilename = upscaleModel;
    }

    const refinerCheckpoint = resolveRefinerFilenameForModel(model, {
      refinerMap: shared.modelRefinerMap,
      customTokens,
    });
    if (refinerCheckpoint) {
      merged.refinerCheckpointFilename = refinerCheckpoint;
    }

    const controlNetModel = resolveControlNetModelFilename(model, {
      controlNetMap: shared.modelControlNetMap,
      customTokens,
    });
    if (controlNetModel) {
      merged.controlNetModelFilename = controlNetModel;
    }

    const resolvedInputImage =
      inputImageFilename?.trim() ||
      base?.inputImageFilename?.trim();
    if (resolvedInputImage) {
      merged.inputImageFilename = resolvedInputImage;
    }

    const resolvedMaskImage =
      maskImageFilename?.trim() ||
      base?.maskImageFilename?.trim();
    if (resolvedMaskImage) {
      merged.maskImageFilename = resolvedMaskImage;
    }

    const resolvedControlImage =
      controlImageFilename?.trim() ||
      base?.controlImageFilename?.trim();
    if (resolvedControlImage) {
      merged.controlImageFilename = resolvedControlImage;
    }

    const denoise = resolveDenoiseForModel(model, {
      tool,
      hasInputImage: Boolean(merged.inputImageFilename),
      hasMaskImage: Boolean(merged.maskImageFilename),
      override: shared.editDenoiseStrength,
    });
    if (denoise != null) {
      merged.denoise = denoise;
    }

    return ensureLightningSamplerParams(
      ensureLightningNativeResolutionParams(merged, model, orientation, sizeTier),
      model,
      presetTier,
    );
  }

  return merged;
}
