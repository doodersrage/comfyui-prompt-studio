/**
 * Client-safe Comfy model registry helpers (no prompt-profile / shape / compact deps).
 */
import type { DetailLevel } from "../detail-level";
import {
  COMFY_IMAGE_MODELS,
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
} from "./registry";
import type {
  ComfyImageModel,
  ComfyImageModelDefinition,
  PromptLimits,
} from "./types";

export {
  COMFY_IMAGE_MODELS,
  COMFY_MODEL_CATEGORIES,
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_AUDIO_MODEL,
  DEFAULT_MESH_MODEL,
} from "./registry";
export type {
  ComfyImageModel,
  ComfyImageModelDefinition,
  ComfyModelCategory,
  PromptLimits,
  PromptProfileId,
} from "./types";

/** @deprecated Use DEFAULT_COMFY_MODEL */
export const DEFAULT_QWEN_MODEL = DEFAULT_COMFY_MODEL;

/** @deprecated Use COMFY_IMAGE_MODELS */
export const QWEN_MODELS = COMFY_IMAGE_MODELS;

export function normalizeComfyModel(value?: string | null): ComfyImageModel {
  if (value && COMFY_MODEL_IDS.has(value)) {
    return value;
  }
  return DEFAULT_COMFY_MODEL;
}

/** @deprecated Use normalizeComfyModel */
export const normalizeQwenModel = normalizeComfyModel;

export function getComfyModelDefinition(
  model: ComfyImageModel = DEFAULT_COMFY_MODEL,
): ComfyImageModelDefinition {
  return (
    COMFY_IMAGE_MODELS.find((entry) => entry.id === model) ??
    COMFY_IMAGE_MODELS.find((entry) => entry.id === DEFAULT_COMFY_MODEL)!
  );
}

/** @deprecated Use getComfyModelDefinition */
export const getQwenModelDefinition = getComfyModelDefinition;

export function getPromptLimits(
  detail: DetailLevel,
  model: ComfyImageModel = DEFAULT_COMFY_MODEL,
): PromptLimits {
  return getComfyModelDefinition(model).limitsByDetail[detail];
}

export function comfyModelLabel(model: ComfyImageModel): string {
  return getComfyModelDefinition(model).label;
}

/** @deprecated Use comfyModelLabel */
export const qwenModelLabel = comfyModelLabel;

export type QwenImageModel = ComfyImageModel;
export type QwenModelDefinition = ComfyImageModelDefinition;
