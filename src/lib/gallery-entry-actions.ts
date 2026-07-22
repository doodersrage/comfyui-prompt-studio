import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { resolveGalleryOutputImageUrl } from "./gallery-output-upscale";
import { isQwenRapidAioModel } from "./model-denoise-defaults";
import { isQwenLightningModel } from "./model-sampling-patch";
import {
  normalizeQueueQualityProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";

/** Gallery Upscale is for models that benefit from Lanczos/neural — not distilled ones. */
export function galleryEntrySupportsUpscale(model?: string): boolean {
  return !isQwenLightningModel(model) && !isQwenRapidAioModel(model);
}

/**
 * True when another Final/Max enhance would be redundant.
 * Max may still bump a Final keeper or Final upscale/moire child.
 */
export function galleryEntryAlreadyEnrichedForUpscale(
  entry: Pick<ComfyGalleryEntry, "derivedKind" | "queueQualityProfile">,
  qualityProfile: Extract<QueueQualityProfile, "final" | "max">,
): boolean {
  const stored = normalizeQueueQualityProfile(entry.queueQualityProfile);
  if (stored === "max") {
    return true;
  }
  if (stored === "final") {
    return qualityProfile === "final";
  }
  // Upscale/moire children without a stored Final/Max profile still count as
  // Final-enriched — allow Max bump, block another Final pass.
  if (
    entry.derivedKind === "upscale" ||
    entry.derivedKind === "moire-clean"
  ) {
    return qualityProfile === "final";
  }
  return false;
}

/** True when requesting Max on a Final (or Final-tier derivative) keeper. */
export function galleryEntryIsFinalToMaxBump(
  entry: Pick<ComfyGalleryEntry, "derivedKind" | "queueQualityProfile">,
  qualityProfile: Extract<QueueQualityProfile, "final" | "max">,
): boolean {
  if (qualityProfile !== "max") {
    return false;
  }
  if (galleryEntryAlreadyEnrichedForUpscale(entry, "max")) {
    return false;
  }
  const stored = normalizeQueueQualityProfile(entry.queueQualityProfile);
  return (
    stored === "final" ||
    entry.derivedKind === "upscale" ||
    entry.derivedKind === "moire-clean"
  );
}

/** Img2img refine: skip Lightning; Rapid AIO T2I uses moiré clean instead. */
export function galleryEntrySupportsRefine(model?: string): boolean {
  if (isQwenLightningModel(model)) {
    return false;
  }
  // Rapid AIO Edit keeps refine; SFW/NSFW polish path is moiré clean.
  if (/^qwen-rapid-aio-(sfw|nsfw)$/i.test(String(model ?? ""))) {
    return false;
  }
  return true;
}

/** Moiré clean is the Rapid AIO polish path (blur / mild Max resample). */
export function galleryEntrySupportsMoireClean(model?: string): boolean {
  return isQwenRapidAioModel(model);
}

/** Face detail is an img2img-style requeue — same constraint as refine (no Lightning pass-through). */
export function galleryEntrySupportsFaceDetail(model?: string): boolean {
  return !isQwenLightningModel(model);
}

export function canUpscaleGalleryEntry(
  entry: Pick<
    ComfyGalleryEntry,
    | "status"
    | "images"
    | "sourceImageUrl"
    | "comfyUrl"
    | "model"
    | "derivedKind"
    | "queueQualityProfile"
  >,
  qualityProfile?: Extract<QueueQualityProfile, "final" | "max">,
): boolean {
  if (entry.status !== "completed") {
    return false;
  }
  if (!galleryEntrySupportsUpscale(entry.model)) {
    return false;
  }
  if (
    qualityProfile &&
    galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)
  ) {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}

export function canRefineGalleryEntry(
  entry: Pick<
    ComfyGalleryEntry,
    "status" | "images" | "sourceImageUrl" | "comfyUrl" | "model"
  >,
): boolean {
  if (!galleryEntrySupportsRefine(entry.model)) {
    return false;
  }
  if (entry.status !== "completed") {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}

export function canFaceDetailGalleryEntry(
  entry: Pick<
    ComfyGalleryEntry,
    "status" | "images" | "sourceImageUrl" | "comfyUrl" | "model"
  >,
): boolean {
  if (!galleryEntrySupportsFaceDetail(entry.model)) {
    return false;
  }
  if (entry.status !== "completed") {
    return false;
  }
  if (!resolveGalleryOutputImageUrl(entry)) {
    return false;
  }
  // Prefer a library FaceDetailer; otherwise allow the action when Impact Pack
  // may be installed (queue path auto-inserts when object_info confirms it).
  return true;
}

export function canMoireCleanGalleryEntry(
  entry: Pick<
    ComfyGalleryEntry,
    | "status"
    | "images"
    | "sourceImageUrl"
    | "comfyUrl"
    | "model"
    | "derivedKind"
    | "queueQualityProfile"
  >,
  qualityProfile?: Extract<QueueQualityProfile, "final" | "max">,
): boolean {
  if (entry.status !== "completed") {
    return false;
  }
  if (!galleryEntrySupportsMoireClean(entry.model)) {
    return false;
  }
  if (
    qualityProfile &&
    galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)
  ) {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}
