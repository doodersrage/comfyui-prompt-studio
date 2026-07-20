import type { QueueQualityProfile } from "./queue-quality-profile";

export const GALLERY_REFINE_DENOISE: Record<"final" | "max", number> = {
  final: 0.28,
  max: 0.32,
};

export function galleryRefineDenoiseForProfile(
  profile: Extract<QueueQualityProfile, "final" | "max"> | undefined,
): number {
  return profile === "max" ? GALLERY_REFINE_DENOISE.max : GALLERY_REFINE_DENOISE.final;
}
