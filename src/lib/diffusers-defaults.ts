/** Preferred local SDXL photoreal checkpoint for Diffusers Studio queues. */
export const DIFFUSERS_DEFAULT_MODEL = "RealVisXL_V5.0_fp16.safetensors";

const NON_SDXL_HINT =
  /flux|qwen|wan|hunyuan|svd|ltx|cogvideo|mochi|hailuo|kling|runway/i;

const CHECKPOINT_FILE = /\.(safetensors|ckpt|pt|bin)$/i;

/**
 * Map a Studio model id onto a Diffusers-friendly SDXL checkpoint.
 * Explicit checkpoint filenames pass through; Flux/Qwen aliases → RealVis.
 */
export function resolveDiffusersModelHint(model?: string | null): string {
  const trimmed = model?.trim();
  if (!trimmed) {
    return DIFFUSERS_DEFAULT_MODEL;
  }
  // Diffusers checkpoint picker already chose a local file/folder name.
  if (CHECKPOINT_FILE.test(trimmed) || trimmed.includes("/")) {
    if (NON_SDXL_HINT.test(trimmed)) {
      return DIFFUSERS_DEFAULT_MODEL;
    }
    return trimmed;
  }
  if (NON_SDXL_HINT.test(trimmed)) {
    return DIFFUSERS_DEFAULT_MODEL;
  }
  return trimmed;
}

export type DiffusersWorkshopCropMode = "auto" | "always" | "never";

/** Studio setting → engine `workshop_crop` body field (`null` = auto-detect). */
export function workshopCropToApi(
  mode: DiffusersWorkshopCropMode | undefined,
): boolean | null {
  if (mode === "always") {
    return true;
  }
  if (mode === "never") {
    return false;
  }
  return null;
}
