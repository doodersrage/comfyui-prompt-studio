import {
  getComfyModelDefinition,
  type ComfyImageModel,
} from "./comfy-models/client";
import { isQwenLightningModel, isWanLightningModel } from "./model-sampling-patch";

export const DEFAULT_EDIT_DENOISE = 0.65;

export const DEFAULT_INPAINT_DENOISE = 0.75;

const EDIT_TOOLS = new Set([
  "refine",
  "image-prompt",
  "controlnet",
  "inpaint",
  "outpaint",
  "compose",
]);

export const DEFAULT_OUTPAINT_DENOISE = 0.85;

function clampDenoise(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EDIT_DENOISE;
  }
  return Math.min(1, Math.max(0.05, value));
}

function isVideoCategoryModel(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  if (def?.category === "video") {
    return true;
  }
  return /-(video)$/i.test(String(model));
}

export function isEditCapableModel(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  if (!def) {
    return /edit|inpaint|ip2p|pix2pix/i.test(model);
  }
  if (def.category === "instruct-edit") {
    return true;
  }
  if (def.profile === "qwen_edit" || def.profile === "qwen_edit_instruction") {
    return true;
  }
  if (model === "flux-inpaint" || model === "qwen-rapid-aio-edit") {
    return true;
  }
  // Rapid AIO SFW/NSFW are T2I-first dual-purpose checkpoints — not edit-primary.
  if (/^qwen-rapid-aio-(sfw|nsfw)$/i.test(String(model))) {
    return false;
  }
  return /edit|inpaint/i.test(model);
}

/** Phr00t Rapid AIO single-file checkpoints (SFW / NSFW / Edit). */
export function isQwenRapidAioModel(model?: string): boolean {
  return /^qwen-rapid-aio-/i.test(String(model ?? "").trim());
}

export function isQwenEditModel(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  if (def?.profile === "qwen_edit" || def?.profile === "qwen_edit_instruction") {
    return true;
  }
  return /qwen.*edit|qwen-rapid-aio-edit/i.test(String(model));
}

/**
 * Multi-ref Compose / Transfer — Qwen Edit only (image1–4 encode path).
 * Excludes FLUX inpaint and other single-mask edit models.
 * Rapid AIO Edit is included; Rapid AIO SFW/NSFW are T2I-first — use Edit for Compose.
 */
export function isComposeCapableModel(model: ComfyImageModel | string | null | undefined): boolean {
  if (!model?.toString().trim()) {
    return false;
  }
  return isQwenEditModel(model);
}

export function isInpaintModel(model: ComfyImageModel | string): boolean {
  if (model === "flux-inpaint") {
    return true;
  }
  return /inpaint/i.test(model);
}

export function isEditQueueTool(tool?: string): boolean {
  return Boolean(tool && EDIT_TOOLS.has(tool));
}

/**
 * Lightning distilled recipes (including edit-2511 Lightning) expect denoise 1
 * with TextEncodeQwenImageEditPlus + EmptyLatent. Soft img2img denoise (0.65)
 * fights the LoRA and causes soft/garbled artifacts vs native ComfyUI — even
 * when a reference image is attached (refs go through the encode node, not VAEEncode).
 *
 * Rapid AIO is the same class of CFG-1 distilled checkpoint: T2I / TextEncode
 * paths need denoise 1. Soft denoise only for masked inpaint (true latent paint).
 */
export function resolveDenoiseForModel(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
    override?: number;
  },
): number | undefined {
  // Lightning must ignore Settings editDenoiseStrength / soft overrides.
  if (isQwenLightningModel(model) || isWanLightningModel(model)) {
    return 1;
  }

  if (isQwenRapidAioModel(model)) {
    if (options?.hasMaskImage || isInpaintModel(model)) {
      return DEFAULT_INPAINT_DENOISE;
    }
    return 1;
  }

  // Video T2V/I2V should not reuse still-image soft edit denoise (0.65) —
  // that morphs limbs/objects across frames. Keep denoise 1 for video graphs.
  if (options?.tool === "video" || isVideoCategoryModel(model)) {
    return 1;
  }

  if (options?.override != null && options.override.toString().trim() !== "") {
    return clampDenoise(Number(options.override));
  }

  const editContext =
    options?.hasInputImage ||
    options?.hasMaskImage ||
    (options?.tool ? EDIT_TOOLS.has(options.tool) : false) ||
    isEditCapableModel(model);

  if (!editContext) {
    return 1;
  }

  if (isInpaintModel(model) || options?.hasMaskImage || options?.tool === "outpaint") {
    return options?.tool === "outpaint"
      ? DEFAULT_OUTPAINT_DENOISE
      : DEFAULT_INPAINT_DENOISE;
  }

  return DEFAULT_EDIT_DENOISE;
}
