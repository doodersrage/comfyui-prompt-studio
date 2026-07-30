import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models/client';
import { isQwenLightningModel, isWanLightningModel } from './model-sampling-patch';

export const DEFAULT_EDIT_DENOISE = 0.65;

export const DEFAULT_INPAINT_DENOISE = 0.75;

/**
 * FLUX.2 Klein instruction edit uses ReferenceLatent + EmptyFlux2Latent at
 * denoise 1 (official Comfy path). Soft img2img denoise is the wrong mechanism.
 */
export const DEFAULT_KLEIN_EDIT_DENOISE = 1;

const EDIT_TOOLS = new Set([
  'refine',
  'image-prompt',
  'controlnet',
  'inpaint',
  'outpaint',
  'compose',
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
  if (def?.category === 'video') {
    return true;
  }
  return /-(video)$/i.test(String(model));
}

export function isEditCapableModel(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  if (!def) {
    return /edit|inpaint|ip2p|pix2pix/i.test(model);
  }
  if (def.category === 'instruct-edit') {
    return true;
  }
  if (def.profile === 'qwen_edit' || def.profile === 'qwen_edit_instruction') {
    return true;
  }
  if (model === 'flux-inpaint' || model === 'qwen-rapid-aio-edit') {
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
  return /^qwen-rapid-aio-/i.test(String(model ?? '').trim());
}

/** Phr00t WAN Rapid All-In-One — CFG-1 distilled video checkpoint (no Lightning LoRA). */
export function isWanRapidAioModel(model?: string): boolean {
  const id = String(model ?? '').trim();
  if (!id) {
    return false;
  }
  if (id === 'wan-video-rapid-aio') {
    return true;
  }
  return /wan.*rapid[\s_-]*aio/i.test(id);
}

/** Any Phr00t Rapid AIO stack (Qwen stills or WAN video). */
export function isRapidAioModel(model?: string): boolean {
  return isQwenRapidAioModel(model) || isWanRapidAioModel(model);
}

export function isQwenEditModel(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  if (def?.profile === 'qwen_edit' || def?.profile === 'qwen_edit_instruction') {
    return true;
  }
  return /qwen.*edit|qwen-rapid-aio-edit/i.test(String(model));
}

/** FLUX.2 Klein family (4B/9B base + distilled) — Compose uses img2img + IP-Adapter. */
export function isFluxKleinModel(model: ComfyImageModel | string | null | undefined): boolean {
  return /flux-2-klein/i.test(String(model ?? ''));
}

/**
 * FLUX.1 Dev / Schnell / fine-tunes (UltraReal, etc.) — DualCLIP type flux + ae.safetensors.
 * Excludes FLUX.2 Klein and flux2.
 */
export function isFlux1FamilyModel(model: ComfyImageModel | string | null | undefined): boolean {
  const id = String(model ?? '').trim();
  if (!id || isFluxKleinModel(id) || id === 'flux2') {
    return false;
  }
  const def = getComfyModelDefinition(id);
  return def?.category === 'flux';
}

/**
 * Multi-ref Compose / Transfer — Qwen Edit (image1–4 encode) or FLUX.2 Klein
 * (Figure 1 img2img + Figures 2–4 via IP-Adapter). Excludes FLUX inpaint and
 * other single-mask edit models. Rapid AIO Edit is included; Rapid AIO SFW/NSFW
 * are T2I-first — use Edit for Compose.
 */
export function isComposeCapableModel(model: ComfyImageModel | string | null | undefined): boolean {
  if (!model?.toString().trim()) {
    return false;
  }
  return isQwenEditModel(model) || isFluxKleinModel(model);
}

export function isInpaintModel(model: ComfyImageModel | string): boolean {
  if (model === 'flux-inpaint') {
    return true;
  }
  return /inpaint/i.test(model);
}

export function isEditQueueTool(tool?: string): boolean {
  return Boolean(tool && EDIT_TOOLS.has(tool));
}

/** True when Klein Compose/Refine should use ReferenceLatent edit (denoise 1). */
export function isKleinReferenceLatentEditContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  if (!isFluxKleinModel(model) || options?.hasMaskImage || isInpaintModel(model)) {
    return false;
  }
  return (
    options?.tool === 'compose' ||
    options?.tool === 'refine' ||
    options?.tool === 'image-prompt' ||
    (Boolean(options?.hasInputImage) && options?.tool != null && EDIT_TOOLS.has(options.tool))
  );
}

/** @deprecated Soft img2img is not used for Klein — kept for call-site compat. */
export function isKleinImg2imgEditContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  return isKleinReferenceLatentEditContext(model, options);
}

/** Distilled Klein stays CFG 1 on the ReferenceLatent edit path. */
export function resolveKleinEditCfg(
  _model: ComfyImageModel | string,
  _options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
    currentCfg?: number;
  }
): number | undefined {
  return undefined;
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
  }
): number | undefined {
  // Lightning must ignore Settings editDenoiseStrength / soft overrides.
  if (isQwenLightningModel(model) || isWanLightningModel(model) || isWanRapidAioModel(model)) {
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
  if (options?.tool === 'video' || isVideoCategoryModel(model)) {
    return 1;
  }

  // Generate is T2I-first — leftover init-image session state must not soft-denoise
  // the whole latent (0.65 mush). Soft denoise only for true edit tools / masks.
  if (options?.tool === 'generate' && !options?.hasMaskImage && !isInpaintModel(model)) {
    return 1;
  }

  // Klein Compose/Refine — ReferenceLatent + EmptyFlux2Latent (ignore soft edit denoise).
  if (isKleinReferenceLatentEditContext(model, options)) {
    return DEFAULT_KLEIN_EDIT_DENOISE;
  }

  if (options?.override != null && options.override.toString().trim() !== '') {
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

  if (isInpaintModel(model) || options?.hasMaskImage || options?.tool === 'outpaint') {
    return options?.tool === 'outpaint' ? DEFAULT_OUTPAINT_DENOISE : DEFAULT_INPAINT_DENOISE;
  }

  return DEFAULT_EDIT_DENOISE;
}
