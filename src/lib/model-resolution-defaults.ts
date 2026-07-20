import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models";
import type { WorkflowParamValues } from "./comfyui-config";

export type ResolutionOrientation = "portrait" | "landscape" | "square";
export type ResolutionSizeTier = "small" | "medium" | "max";

export const DEFAULT_RESOLUTION_ORIENTATION: ResolutionOrientation = "square";
export const DEFAULT_RESOLUTION_SIZE_TIER: ResolutionSizeTier = "medium";

export const RESOLUTION_ORIENTATION_OPTIONS: {
  id: ResolutionOrientation;
  label: string;
  description: string;
}[] = [
  {
    id: "square",
    label: "Square",
    description: "Balanced framing for subjects and scenes.",
  },
  {
    id: "portrait",
    label: "Portrait",
    description: "Taller canvas — people, fashion, posters.",
  },
  {
    id: "landscape",
    label: "Landscape",
    description: "Wider canvas — environments and cinematic shots.",
  },
];

export const RESOLUTION_SIZE_TIER_OPTIONS: {
  id: ResolutionSizeTier;
  label: string;
  description: string;
}[] = [
  {
    id: "small",
    label: "Small",
    description: "Fast drafts and lower VRAM.",
  },
  {
    id: "medium",
    label: "Medium",
    description: "Native/optimal size — best detail without artifacts.",
  },
  {
    id: "max",
    label: "Max",
    description: "Largest safe size for this model (more VRAM).",
  },
];

export type ModelResolutionPreset = {
  width: number;
  height: number;
};

type OrientationPresets = Record<ResolutionSizeTier, ModelResolutionPreset>;
type CategoryResolutionPresets = Record<ResolutionOrientation, OrientationPresets>;

const CATEGORY_RESOLUTION_PRESETS: Record<ComfyModelCategory, CategoryResolutionPresets> = {
  "stable-diffusion": {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 512, height: 512 },
      max: { width: 640, height: 640 },
    },
    portrait: {
      small: { width: 448, height: 576 },
      medium: { width: 512, height: 704 },
      max: { width: 576, height: 768 },
    },
    landscape: {
      small: { width: 576, height: 448 },
      medium: { width: 704, height: 512 },
      max: { width: 768, height: 576 },
    },
  },
  sdxl: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 832, height: 1216 },
      max: { width: 896, height: 1344 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1216, height: 832 },
      max: { width: 1344, height: 896 },
    },
  },
  sd3: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  flux: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1536 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1152, height: 896 },
      max: { width: 1536, height: 1024 },
    },
  },
  qwen: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 928, height: 1664 },
      max: { width: 1024, height: 1536 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1664, height: 928 },
      max: { width: 1536, height: 1024 },
    },
  },
  hunyuan: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1280, height: 1280 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  "other-dit": {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  "instruct-edit": {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 768, height: 768 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      small: { width: 512, height: 704 },
      medium: { width: 768, height: 1024 },
      max: { width: 832, height: 1152 },
    },
    landscape: {
      small: { width: 704, height: 512 },
      medium: { width: 1024, height: 768 },
      max: { width: 1152, height: 832 },
    },
  },
  video: {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 768, height: 768 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      small: { width: 512, height: 768 },
      medium: { width: 768, height: 1024 },
      max: { width: 832, height: 1152 },
    },
    landscape: {
      small: { width: 768, height: 512 },
      medium: { width: 1024, height: 768 },
      max: { width: 1152, height: 832 },
    },
  },
};

type ModelResolutionPresetMap = Partial<
  Record<
    ComfyImageModel,
    Partial<Record<ResolutionOrientation, Partial<Record<ResolutionSizeTier, ModelResolutionPreset>>>>
  >
>;

const MODEL_RESOLUTION_PRESETS: ModelResolutionPresetMap = {
  "flux-schnell": {
    square: {
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      max: { width: 896, height: 1152 },
    },
    landscape: {
      max: { width: 1152, height: 896 },
    },
  },
  "flux-2-klein": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  "flux-2-klein-4b-distilled": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 1152, height: 1536 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1536, height: 1152 },
    },
  },
  "flux-2-klein-9b": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  "flux-2-klein-9b-distilled": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  "qwen-image-2512": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
    portrait: {
      medium: { width: 928, height: 1664 },
      max: { width: 1024, height: 1536 },
    },
    landscape: {
      medium: { width: 1664, height: 928 },
      max: { width: 1536, height: 1024 },
    },
  },
  "qwen-image-2512-lightning-4": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
    portrait: {
      medium: { width: 928, height: 1664 },
      max: { width: 1024, height: 1536 },
    },
    landscape: {
      medium: { width: 1664, height: 928 },
      max: { width: 1536, height: 1024 },
    },
  },
  "qwen-image-2512-lightning-8": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
    portrait: {
      medium: { width: 928, height: 1664 },
      max: { width: 1024, height: 1536 },
    },
    landscape: {
      medium: { width: 1664, height: 928 },
      max: { width: 1536, height: 1024 },
    },
  },
  "qwen-image-edit-2511-lightning-4": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
  },
  "qwen-image-edit-2511-lightning-8": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
  },
  "qwen-rapid-aio-edit": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
    portrait: {
      medium: { width: 928, height: 1664 },
      max: { width: 1024, height: 1536 },
    },
    landscape: {
      medium: { width: 1664, height: 928 },
      max: { width: 1536, height: 1024 },
    },
  },
  "qwen-rapid-aio-sfw": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
  },
  "qwen-rapid-aio-nsfw": {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1328, height: 1328 },
    },
  },
  "qwen-image-2.0": {
    square: {
      max: { width: 1328, height: 1328 },
    },
  },
  "sd15-instruct-pix2pix": {
    square: {
      max: { width: 512, height: 512 },
    },
  },
  "sdxl-instruct-pix2pix": {
    square: {
      max: { width: 1024, height: 1024 },
    },
  },
};

export function normalizeResolutionOrientation(value: unknown): ResolutionOrientation {
  if (value === "portrait" || value === "landscape" || value === "square") {
    return value;
  }
  return DEFAULT_RESOLUTION_ORIENTATION;
}

export function normalizeResolutionSizeTier(value: unknown): ResolutionSizeTier {
  if (value === "small" || value === "medium" || value === "max") {
    return value;
  }
  return DEFAULT_RESOLUTION_SIZE_TIER;
}

export function getModelResolutionPreset(
  model: ComfyImageModel | string = DEFAULT_COMFY_MODEL,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER,
): ModelResolutionPreset {
  const normalized = COMFY_MODEL_IDS.has(model) ? model : DEFAULT_COMFY_MODEL;
  const normalizedOrientation = normalizeResolutionOrientation(orientation);
  const normalizedTier = normalizeResolutionSizeTier(tier);

  const modelOverride =
    MODEL_RESOLUTION_PRESETS[normalized as ComfyImageModel]?.[normalizedOrientation]?.[
      normalizedTier
    ];
  if (modelOverride) {
    return modelOverride;
  }

  const definition = getComfyModelDefinition(normalized);
  return CATEGORY_RESOLUTION_PRESETS[definition.category][normalizedOrientation][normalizedTier];
}

export function modelResolutionPresetToParams(
  preset: ModelResolutionPreset,
): WorkflowParamValues {
  return {
    width: preset.width,
    height: preset.height,
  };
}

export function resolveModelResolutionParams(
  model?: ComfyImageModel | string,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER,
): WorkflowParamValues {
  if (!model) {
    return {};
  }
  return modelResolutionPresetToParams(
    getModelResolutionPreset(model, orientation, tier),
  );
}

export function formatModelResolutionHint(
  model: ComfyImageModel | string,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER,
): string {
  const preset = getModelResolutionPreset(model, orientation, tier);
  const orientationLabel =
    RESOLUTION_ORIENTATION_OPTIONS.find((option) => option.id === orientation)?.label ??
    orientation;
  const tierLabel =
    RESOLUTION_SIZE_TIER_OPTIONS.find((option) => option.id === tier)?.label ?? tier;
  return `${orientationLabel} · ${tierLabel} · ${preset.width}×${preset.height}`;
}
