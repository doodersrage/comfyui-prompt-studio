import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models/client";
import type { WorkflowParamValues } from "./comfyui-config";
import { isQwenLightningModel } from "./model-sampling-patch";

export type ResolutionOrientation =
  | "portrait"
  | "landscape"
  | "square"
  | "portrait-34"
  | "landscape-43"
  | "portrait-23"
  | "landscape-32";
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
    label: "1:1",
    description: "Official Qwen 1328² / balanced framing.",
  },
  {
    id: "portrait",
    label: "9:16",
    description: "Tall poster framing (928×1664 on Qwen).",
  },
  {
    id: "landscape",
    label: "16:9",
    description: "Wide cinematic framing (1664×928 on Qwen).",
  },
  {
    id: "portrait-34",
    label: "3:4",
    description: "Classic portrait (1104×1472 on Qwen).",
  },
  {
    id: "landscape-43",
    label: "4:3",
    description: "Classic landscape (1472×1104 on Qwen).",
  },
  {
    id: "portrait-23",
    label: "2:3",
    description: "Photo portrait (1056×1584 on Qwen).",
  },
  {
    id: "landscape-32",
    label: "3:2",
    description: "Photo landscape (1584×1056 on Qwen).",
  },
];

/** Core chips always shown; extra official Qwen ARs shown for Qwen models. */
export const RESOLUTION_ORIENTATION_CORE: ResolutionOrientation[] = [
  "square",
  "portrait",
  "landscape",
];

export const RESOLUTION_ORIENTATION_QWEN_EXTRA: ResolutionOrientation[] = [
  "portrait-34",
  "landscape-43",
  "portrait-23",
  "landscape-32",
];

export function resolutionOrientationsForModel(
  model: ComfyImageModel | string,
): ResolutionOrientation[] {
  const category = COMFY_MODEL_IDS.has(model)
    ? getComfyModelDefinition(model).category
    : "other-dit";
  if (category === "qwen" || /qwen/i.test(model)) {
    return [
      ...RESOLUTION_ORIENTATION_CORE,
      ...RESOLUTION_ORIENTATION_QWEN_EXTRA,
    ];
  }
  return RESOLUTION_ORIENTATION_CORE;
}

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
type CategoryResolutionPresets = {
  square: OrientationPresets;
  portrait: OrientationPresets;
  landscape: OrientationPresets;
} & Partial<
  Record<
    "portrait-34" | "landscape-43" | "portrait-23" | "landscape-32",
    OrientationPresets
  >
>;

/** Official Qwen-Image-2512 aspect sizes (ComfyUI native template). */
const QWEN_OFFICIAL_ARS = {
  square: {
    small: { width: 1024, height: 1024 },
    medium: { width: 1328, height: 1328 },
    max: { width: 1328, height: 1328 },
  },
  portrait: {
    small: { width: 768, height: 1344 },
    medium: { width: 928, height: 1664 },
    max: { width: 928, height: 1664 },
  },
  landscape: {
    small: { width: 1344, height: 768 },
    medium: { width: 1664, height: 928 },
    max: { width: 1664, height: 928 },
  },
  "portrait-34": {
    small: { width: 896, height: 1152 },
    medium: { width: 1104, height: 1472 },
    max: { width: 1104, height: 1472 },
  },
  "landscape-43": {
    small: { width: 1152, height: 896 },
    medium: { width: 1472, height: 1104 },
    max: { width: 1472, height: 1104 },
  },
  "portrait-23": {
    small: { width: 832, height: 1216 },
    medium: { width: 1056, height: 1584 },
    max: { width: 1056, height: 1584 },
  },
  "landscape-32": {
    small: { width: 1216, height: 832 },
    medium: { width: 1584, height: 1056 },
    max: { width: 1584, height: 1056 },
  },
} as const satisfies CategoryResolutionPresets;

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
  qwen: QWEN_OFFICIAL_ARS,
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
  "qwen-image-2512": QWEN_OFFICIAL_ARS,
  "qwen-image-2512-lightning-4": QWEN_OFFICIAL_ARS,
  "qwen-image-2512-lightning-8": QWEN_OFFICIAL_ARS,
  "qwen-image-edit-2511-lightning-4": {
    square: QWEN_OFFICIAL_ARS.square,
  },
  "qwen-image-edit-2511-lightning-8": {
    square: QWEN_OFFICIAL_ARS.square,
  },
  "qwen-rapid-aio-edit": QWEN_OFFICIAL_ARS,
  "qwen-rapid-aio-sfw": {
    square: QWEN_OFFICIAL_ARS.square,
  },
  "qwen-rapid-aio-nsfw": {
    square: QWEN_OFFICIAL_ARS.square,
  },
  "qwen-image-2.0": {
    square: QWEN_OFFICIAL_ARS.square,
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
  if (
    value === "portrait" ||
    value === "landscape" ||
    value === "square" ||
    value === "portrait-34" ||
    value === "landscape-43" ||
    value === "portrait-23" ||
    value === "landscape-32"
  ) {
    return value;
  }
  return DEFAULT_RESOLUTION_ORIENTATION;
}

function fallbackResolutionOrientation(
  orientation: ResolutionOrientation,
): "square" | "portrait" | "landscape" {
  if (orientation === "portrait-34" || orientation === "portrait-23") {
    return "portrait";
  }
  if (orientation === "landscape-43" || orientation === "landscape-32") {
    return "landscape";
  }
  if (orientation === "portrait" || orientation === "landscape" || orientation === "square") {
    return orientation;
  }
  return "square";
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
  const fallbackOrientation = fallbackResolutionOrientation(normalizedOrientation);

  const modelPresets = MODEL_RESOLUTION_PRESETS[normalized as ComfyImageModel];
  const modelOverride =
    modelPresets?.[normalizedOrientation]?.[normalizedTier] ??
    modelPresets?.[fallbackOrientation]?.[normalizedTier];
  if (modelOverride) {
    return modelOverride;
  }

  const definition = getComfyModelDefinition(normalized);
  const categoryPresets = CATEGORY_RESOLUTION_PRESETS[definition.category];
  return (
    categoryPresets[normalizedOrientation]?.[normalizedTier] ??
    categoryPresets[fallbackOrientation][normalizedTier]
  );
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

/** Official Qwen medium sizes for param experiments (width+height pairs). */
export function qwenOfficialMediumSizeLadder(): Array<{ width: number; height: number }> {
  return [
    QWEN_OFFICIAL_ARS.square.medium,
    QWEN_OFFICIAL_ARS.portrait.medium,
    QWEN_OFFICIAL_ARS.landscape.medium,
    QWEN_OFFICIAL_ARS["portrait-34"].medium,
    QWEN_OFFICIAL_ARS["landscape-43"].medium,
    QWEN_OFFICIAL_ARS["portrait-23"].medium,
    QWEN_OFFICIAL_ARS["landscape-32"].medium,
  ];
}

/** Bump undersized Lightning queues to the orientation’s native preset — keep portrait/landscape. */
export function ensureLightningNativeResolutionParams(
  params: WorkflowParamValues,
  model: string,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER,
): WorkflowParamValues {
  if (!isQwenLightningModel(model)) {
    return params;
  }

  const native = getModelResolutionPreset(model, orientation, tier);
  const width = Number(params.width);
  const height = Number(params.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ...params, width: native.width, height: native.height };
  }

  if (tier === "small") {
    return params;
  }

  const currentPixels = width * height;
  const nativePixels = native.width * native.height;
  if (currentPixels < nativePixels * 0.85) {
    return { ...params, width: native.width, height: native.height };
  }

  return params;
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
