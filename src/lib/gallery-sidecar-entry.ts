import type { ComfyOutputImage } from "./comfyui-outputs";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import {
  readSidecarOutputImage,
  sidecarNegativePrompt,
  sidecarRequeueContext,
  sidecarOutputViewUrl,
  type PromptSidecar,
} from "./prompt-sidecar";

/** Build a pseudo gallery entry from an imported sidecar for upscale/refine actions. */
export function galleryEntryFromSidecar(
  sidecar: PromptSidecar,
): ComfyGalleryEntry | null {
  const context = sidecarRequeueContext(sidecar);
  const outputImage = readSidecarOutputImage(sidecar);
  const sourceImageUrl = context.sourceImageUrl?.trim() ?? sidecarOutputViewUrl(sidecar);
  if (!outputImage && !sourceImageUrl) {
    return null;
  }

  const comfyUrl =
    typeof sidecar.metadata?.comfyUrl === "string"
      ? sidecar.metadata.comfyUrl.trim().replace(/\/+$/, "")
      : "http://127.0.0.1:8188";

  const galleryEntryId =
    typeof sidecar.metadata?.galleryEntryId === "string"
      ? sidecar.metadata.galleryEntryId.trim()
      : undefined;

  return {
    id: galleryEntryId ?? `sidecar-${Date.now()}`,
    promptId:
      typeof sidecar.metadata?.promptId === "string"
        ? sidecar.metadata.promptId.trim()
        : "sidecar-import",
    prompt: sidecar.positive,
    negativePrompt: sidecarNegativePrompt(sidecar),
    tool: sidecar.tool,
    model: sidecar.model,
    queueParams: context.queueParams,
    sourceImageUrl,
    maskImageUrl: context.maskImageUrl,
    queueQualityProfile: context.queueQualityProfile,
    parentGalleryEntryId:
      typeof sidecar.metadata?.parentGalleryEntryId === "string"
        ? sidecar.metadata.parentGalleryEntryId.trim()
        : undefined,
    derivedKind:
      sidecar.metadata?.derivedKind === "upscale" ||
      sidecar.metadata?.derivedKind === "refine" ||
      sidecar.metadata?.derivedKind === "variation"
        ? sidecar.metadata.derivedKind
        : undefined,
    comfyUrl,
    status: "completed",
    queuedAt: Date.now(),
    images: outputImage ? [outputImage] : [],
  };
}
