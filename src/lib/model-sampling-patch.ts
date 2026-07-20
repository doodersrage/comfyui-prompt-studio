import type { WorkflowParamValues } from "./comfyui-config";
import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models";
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from "./model-sampler-defaults";

export const MODEL_SAMPLING_SHIFT_NODE_TYPES = [
  "ModelSamplingAuraFlow",
  "ModelSamplingSD3",
  "ModelSamplingStableCascade",
] as const;

export const MODEL_SAMPLING_FLUX_NODE_TYPE = "ModelSamplingFlux";

export type ModelSamplingShiftNodeType = (typeof MODEL_SAMPLING_SHIFT_NODE_TYPES)[number];

export type ModelSamplingPatchValues = {
  samplingShift?: number;
  fluxMaxShift?: number;
  fluxBaseShift?: number;
};

const SHIFT_NODE_SET = new Set<string>(MODEL_SAMPLING_SHIFT_NODE_TYPES);

const CATEGORY_SHIFT_DEFAULTS: Partial<Record<ComfyModelCategory, number>> = {
  sd3: 3,
};

const MODEL_SHIFT_OVERRIDES: Partial<Record<ComfyImageModel, number>> = {
  auraflow: 1.73,
  "stable-cascade-b": 2,
};

const FLUX_SAMPLING_DEFAULTS: Pick<ModelSamplingPatchValues, "fluxMaxShift" | "fluxBaseShift"> =
  {
    fluxMaxShift: 1.15,
    fluxBaseShift: 0.5,
  };

const NODE_SHIFT_DEFAULTS: Partial<Record<ModelSamplingShiftNodeType, number>> = {
  ModelSamplingAuraFlow: 1.73,
  ModelSamplingSD3: 3,
  ModelSamplingStableCascade: 2,
};

function isUnresolvedWorkflowPlaceholder(value: unknown): boolean {
  return typeof value === "string" && /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
}

function resolveShiftForNode(
  classType: ModelSamplingShiftNodeType,
  params: WorkflowParamValues,
): number | undefined {
  if (params.samplingShift != null && params.samplingShift.toString().trim() !== "") {
    const parsed = Number(params.samplingShift);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return NODE_SHIFT_DEFAULTS[classType];
}

function resolveFluxShiftForNode(
  field: "max_shift" | "base_shift",
  params: WorkflowParamValues,
): number | undefined {
  const paramValue = field === "max_shift" ? params.fluxMaxShift : params.fluxBaseShift;
  if (paramValue != null && paramValue.toString().trim() !== "") {
    const parsed = Number(paramValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return field === "max_shift"
    ? FLUX_SAMPLING_DEFAULTS.fluxMaxShift
    : FLUX_SAMPLING_DEFAULTS.fluxBaseShift;
}

function shouldPatchNumericInput(current: unknown, params: WorkflowParamValues, paramKey: keyof WorkflowParamValues): boolean {
  if (paramKey in params && params[paramKey] != null && params[paramKey]?.toString().trim() !== "") {
    return true;
  }
  return isUnresolvedWorkflowPlaceholder(current);
}

function patchNumericInput(
  inputs: Record<string, unknown>,
  field: string,
  value: number | undefined,
): boolean {
  if (value == null || !Number.isFinite(value) || !(field in inputs)) {
    return false;
  }
  inputs[field] = value;
  return true;
}

export function isModelSamplingPatchNode(classType: string): boolean {
  return SHIFT_NODE_SET.has(classType) || classType === MODEL_SAMPLING_FLUX_NODE_TYPE;
}

export function isModelSamplingShiftNode(classType: string): boolean {
  return SHIFT_NODE_SET.has(classType);
}

export function isModelSamplingFluxNode(classType: string): boolean {
  return classType === MODEL_SAMPLING_FLUX_NODE_TYPE;
}

export function modelUsesFluxSamplingPatch(model: ComfyImageModel | string): boolean {
  if (!COMFY_MODEL_IDS.has(model)) {
    return false;
  }
  return getComfyModelDefinition(model).category === "flux";
}

export function modelUsesShiftSamplingPatch(model: ComfyImageModel | string): boolean {
  if (!COMFY_MODEL_IDS.has(model)) {
    return false;
  }
  const normalized = model as ComfyImageModel;
  if (MODEL_SHIFT_OVERRIDES[normalized] != null) {
    return true;
  }
  return getComfyModelDefinition(normalized).category === "sd3";
}

export function getModelSamplingPatchDefaults(
  model: ComfyImageModel | string = DEFAULT_COMFY_MODEL,
  tier: ModelSamplerPresetTier = "base",
): ModelSamplingPatchValues {
  normalizeModelSamplerPresetTier(tier);
  const normalized = COMFY_MODEL_IDS.has(model) ? model : DEFAULT_COMFY_MODEL;
  const patch: ModelSamplingPatchValues = {};

  const shiftOverride = MODEL_SHIFT_OVERRIDES[normalized as ComfyImageModel];
  if (shiftOverride != null) {
    patch.samplingShift = shiftOverride;
    return patch;
  }

  const definition = getComfyModelDefinition(normalized);
  const categoryShift = CATEGORY_SHIFT_DEFAULTS[definition.category];
  if (categoryShift != null) {
    patch.samplingShift = categoryShift;
    return patch;
  }

  if (definition.category === "flux") {
    return { ...FLUX_SAMPLING_DEFAULTS };
  }

  return patch;
}

export function modelSamplingPatchToParams(
  patch: ModelSamplingPatchValues,
): WorkflowParamValues {
  const params: WorkflowParamValues = {};
  if (patch.samplingShift != null) {
    params.samplingShift = patch.samplingShift;
  }
  if (patch.fluxMaxShift != null) {
    params.fluxMaxShift = patch.fluxMaxShift;
  }
  if (patch.fluxBaseShift != null) {
    params.fluxBaseShift = patch.fluxBaseShift;
  }
  return params;
}

export function resolveModelSamplingParams(
  model?: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = "base",
): WorkflowParamValues {
  if (!model) {
    return {};
  }
  return modelSamplingPatchToParams(getModelSamplingPatchDefaults(model, tier));
}

export function formatModelSamplingHint(
  model: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = "base",
): string | null {
  const patch = getModelSamplingPatchDefaults(model, tier);
  if (patch.samplingShift != null) {
    return `Model sampling · shift ${patch.samplingShift}`;
  }
  if (patch.fluxMaxShift != null && patch.fluxBaseShift != null) {
    return `Model sampling · Flux max ${patch.fluxMaxShift} · base ${patch.fluxBaseShift} · syncs width/height on queue`;
  }
  return null;
}

export function patchModelSamplingInWorkflow(
  workflow: Record<string, unknown>,
  params: WorkflowParamValues,
): {
  workflow: Record<string, unknown>;
  patched: Partial<
    Record<"samplingShift" | "fluxMaxShift" | "fluxBaseShift" | "width" | "height", number>
  >;
} {
  const next = structuredClone(workflow);
  const patched: Partial<
    Record<"samplingShift" | "fluxMaxShift" | "fluxBaseShift" | "width" | "height", number>
  > = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? "";
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (isModelSamplingShiftNode(classType)) {
      if (
        shouldPatchNumericInput(inputs.shift, params, "samplingShift") &&
        "shift" in inputs
      ) {
        const resolved = resolveShiftForNode(classType as ModelSamplingShiftNodeType, params);
        if (patchNumericInput(inputs, "shift", resolved)) {
          patched.samplingShift = (patched.samplingShift ?? 0) + 1;
        }
      }
      continue;
    }

    if (!isModelSamplingFluxNode(classType)) {
      continue;
    }

    if (shouldPatchNumericInput(inputs.width, params, "width")) {
      const width = Number(params.width);
      if (patchNumericInput(inputs, "width", Number.isFinite(width) ? width : undefined)) {
        patched.width = (patched.width ?? 0) + 1;
      }
    }
    if (shouldPatchNumericInput(inputs.height, params, "height")) {
      const height = Number(params.height);
      if (patchNumericInput(inputs, "height", Number.isFinite(height) ? height : undefined)) {
        patched.height = (patched.height ?? 0) + 1;
      }
    }
    if (shouldPatchNumericInput(inputs.max_shift, params, "fluxMaxShift")) {
      if (patchNumericInput(inputs, "max_shift", resolveFluxShiftForNode("max_shift", params))) {
        patched.fluxMaxShift = (patched.fluxMaxShift ?? 0) + 1;
      }
    }
    if (shouldPatchNumericInput(inputs.base_shift, params, "fluxBaseShift")) {
      if (
        patchNumericInput(inputs, "base_shift", resolveFluxShiftForNode("base_shift", params))
      ) {
        patched.fluxBaseShift = (patched.fluxBaseShift ?? 0) + 1;
      }
    }
  }

  return { workflow: next, patched };
}
