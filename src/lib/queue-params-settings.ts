import type { WorkflowParamValues } from "./comfyui-config";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";
import {
  DEFAULT_MODEL_SAMPLER_PRESET_TIER,
  normalizeModelSamplerPresetTier,
  resolveModelSamplerParams,
  type ModelSamplerPresetTier,
} from "./model-sampler-defaults";
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveModelResolutionParams,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from "./model-resolution-defaults";
import type { ComfyImageModel } from "./comfy-models";
import { loadSettingsCache } from "./settings-cache";

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
  if ("model" in input || "base" in input || "samplerPreset" in input || "resolutionOrientation" in input || "resolutionSizeTier" in input) {
    return input as ResolveQueueParamsOptions;
  }
  return { base: input as WorkflowParamValues };
}

export function resolveQueueParams(
  input?: WorkflowParamValues | ResolveQueueParamsOptions,
): WorkflowParamValues {
  const { model, base, samplerPreset, resolutionOrientation, resolutionSizeTier } =
    normalizeResolveQueueParamsInput(input);
  const settings = loadQueueParamsSettings();
  const presetTier = samplerPreset ?? loadModelSamplerPresetTier();
  const orientation = resolutionOrientation ?? loadModelResolutionOrientation();
  const sizeTier = resolutionSizeTier ?? loadModelResolutionSizeTier();
  const modelDefaults = model
    ? {
        ...resolveModelSamplerParams(model, presetTier),
        ...resolveModelResolutionParams(model, orientation, sizeTier),
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

  return merged;
}
