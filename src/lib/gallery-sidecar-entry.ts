import type { ComfyOutputImage } from "./comfyui-outputs";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import {
  sidecarNegativePrompt,
  sidecarRequeueContext,
  type PromptSidecar,
} from "./prompt-sidecar";

function readOutputImage(sidecar: PromptSidecar): ComfyOutputImage | undefined {
  const raw = sidecar.metadata?.outputImage;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const candidate = raw as Partial<ComfyOutputImage>;
  if (typeof candidate.filename !== "string" || !candidate.filename.trim()) {
    return undefined;
  }
  return {
    filename: candidate.filename.trim(),
    subfolder: typeof candidate.subfolder === "string" ? candidate.subfolder : "",
    type:
      candidate.type === "input" || candidate.type === "temp"
        ? candidate.type
        : "output",
  };
}

/** Build a pseudo gallery entry from an imported sidecar for upscale/refine actions. */
export function galleryEntryFromSidecar(
  sidecar: PromptSidecar,
): ComfyGalleryEntry | null {
  const context = sidecarRequeueContext(sidecar);
  const outputImage = readOutputImage(sidecar);
  const sourceImageUrl = context.sourceImageUrl?.trim();
  if (!outputImage && !sourceImageUrl) {
    return null;
  }

  const comfyUrl =
    typeof sidecar.metadata?.comfyUrl === "string"
      ? sidecar.metadata.comfyUrl.trim().replace(/\/+$/, "")
      : "http://127.0.0.1:8188";

  return {
    id: `sidecar-${Date.now()}`,
    promptId: "sidecar-import",
    prompt: sidecar.positive,
    negativePrompt: sidecarNegativePrompt(sidecar),
    tool: sidecar.tool,
    model: sidecar.model,
    queueParams: context.queueParams,
    sourceImageUrl,
    maskImageUrl: context.maskImageUrl,
    queueQualityProfile: context.queueQualityProfile,
    comfyUrl,
    status: "completed",
    queuedAt: Date.now(),
    images: outputImage ? [outputImage] : [],
  };
}
