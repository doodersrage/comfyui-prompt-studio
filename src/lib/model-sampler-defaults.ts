import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models";
import type { WorkflowParamValues } from "./comfyui-config";

export type ModelSamplerPresetTier = "base" | "optimized";

export const DEFAULT_MODEL_SAMPLER_PRESET_TIER: ModelSamplerPresetTier = "base";

export const MODEL_SAMPLER_PRESET_OPTIONS: {
  id: ModelSamplerPresetTier;
  label: string;
  description: string;
}[] = [
  {
    id: "base",
    label: "Base",
    description: "Balanced speed and quality — good for drafts and iteration.",
  },
  {
    id: "optimized",
    label: "Optimized",
    description: "Higher step count and tuned CFG for final renders.",
  },
];

export type ModelSamplerDefaults = {
  steps: number;
  cfg: number;
  fixedSeed?: number;
};

type CategorySamplerPresets = Record<
  ModelSamplerPresetTier,
  Pick<ModelSamplerDefaults, "steps" | "cfg">
>;

const CATEGORY_SAMPLER_PRESETS: Record<ComfyModelCategory, CategorySamplerPresets> = {
  "stable-diffusion": {
    base: { steps: 25, cfg: 7 },
    optimized: { steps: 32, cfg: 7.5 },
  },
  sdxl: {
    base: { steps: 30, cfg: 6.5 },
    optimized: { steps: 36, cfg: 6 },
  },
  sd3: {
    base: { steps: 28, cfg: 4.5 },
    optimized: { steps: 36, cfg: 4 },
  },
  flux: {
    base: { steps: 20, cfg: 3.5 },
    optimized: { steps: 28, cfg: 3.5 },
  },
  qwen: {
    base: { steps: 30, cfg: 4 },
    optimized: { steps: 40, cfg: 3.5 },
  },
  hunyuan: {
    base: { steps: 30, cfg: 6 },
    optimized: { steps: 40, cfg: 5.5 },
  },
  "other-dit": {
    base: { steps: 28, cfg: 5 },
    optimized: { steps: 36, cfg: 4.5 },
  },
  "instruct-edit": {
    base: { steps: 20, cfg: 7.5 },
    optimized: { steps: 28, cfg: 8 },
  },
  video: {
    base: { steps: 30, cfg: 6 },
    optimized: { steps: 40, cfg: 5.5 },
  },
};

type ModelSamplerPresetMap = Partial<
  Record<ComfyImageModel, Record<ModelSamplerPresetTier, ModelSamplerDefaults>>
>;

const MODEL_SAMPLER_PRESETS: ModelSamplerPresetMap = {
  "flux-schnell": {
    base: { steps: 4, cfg: 1 },
    optimized: { steps: 4, cfg: 1 },
  },
  "flux-2-klein": {
    base: { steps: 8, cfg: 3.5 },
    optimized: { steps: 12, cfg: 3.5 },
  },
  "flux-2-klein-9b": {
    base: { steps: 8, cfg: 3.5 },
    optimized: { steps: 16, cfg: 3.5 },
  },
  "flux-dev": {
    base: { steps: 20, cfg: 3.5 },
    optimized: { steps: 28, cfg: 3.5 },
  },
  flux2: {
    base: { steps: 20, cfg: 3.5 },
    optimized: { steps: 28, cfg: 3.5 },
  },
  "qwen-image-2512": {
    base: { steps: 30, cfg: 4 },
    optimized: { steps: 40, cfg: 3.5 },
  },
  "qwen-image-2.0": {
    base: { steps: 35, cfg: 4 },
    optimized: { steps: 45, cfg: 3.5 },
  },
  "sd3-medium": {
    base: { steps: 28, cfg: 4.5 },
    optimized: { steps: 34, cfg: 4 },
  },
  "sd3.5-large": {
    base: { steps: 30, cfg: 4.5 },
    optimized: { steps: 38, cfg: 4 },
  },
  "stable-cascade-b": {
    base: { steps: 20, cfg: 4 },
    optimized: { steps: 26, cfg: 3.8 },
  },
  "sd15-instruct-pix2pix": {
    base: { steps: 20, cfg: 7.5 },
    optimized: { steps: 28, cfg: 8 },
  },
  "sdxl-instruct-pix2pix": {
    base: { steps: 20, cfg: 7.5 },
    optimized: { steps: 28, cfg: 8 },
  },
};

export function normalizeModelSamplerPresetTier(
  value: unknown,
): ModelSamplerPresetTier {
  return value === "optimized" ? "optimized" : "base";
}

export function getModelSamplerDefaults(
  model: ComfyImageModel | string = DEFAULT_COMFY_MODEL,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER,
): ModelSamplerDefaults {
  const normalized = COMFY_MODEL_IDS.has(model) ? model : DEFAULT_COMFY_MODEL;
  const presetTier = normalizeModelSamplerPresetTier(tier);
  const modelPresets = MODEL_SAMPLER_PRESETS[normalized as ComfyImageModel];
  if (modelPresets?.[presetTier]) {
    return modelPresets[presetTier];
  }

  const definition = getComfyModelDefinition(normalized);
  const category = CATEGORY_SAMPLER_PRESETS[definition.category][presetTier];
  return {
    steps: category.steps,
    cfg: category.cfg,
  };
}

export function modelSamplerDefaultsToParams(
  defaults: ModelSamplerDefaults,
): WorkflowParamValues {
  return {
    steps: defaults.steps,
    cfg: defaults.cfg,
    ...(defaults.fixedSeed != null ? { seed: defaults.fixedSeed } : {}),
  };
}

export function resolveModelSamplerParams(
  model?: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER,
): WorkflowParamValues {
  if (!model) {
    return {};
  }
  return modelSamplerDefaultsToParams(getModelSamplerDefaults(model, tier));
}

export function formatModelSamplerHint(
  model: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER,
): string {
  const defaults = getModelSamplerDefaults(model, tier);
  const presetLabel =
    MODEL_SAMPLER_PRESET_OPTIONS.find((option) => option.id === tier)?.label ?? tier;
  const seedLabel =
    defaults.fixedSeed != null ? `seed ${defaults.fixedSeed}` : "random seed";
  return `${presetLabel} · steps ${defaults.steps} · cfg ${defaults.cfg} · ${seedLabel}`;
}
