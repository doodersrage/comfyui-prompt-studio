import { buildPromptSidecar, readSidecarOutputImage, type PromptSidecar } from "./prompt-sidecar";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { buildComfyViewPath } from "./comfyui-outputs";

export { readSidecarOutputImage, sidecarOutputViewUrl } from "./prompt-sidecar";

export function buildGallerySidecar(entry: ComfyGalleryEntry) {
  const outputImage = entry.images[0];
  return buildPromptSidecar({
    positive: entry.prompt,
    negative: entry.negativePrompt,
    model: entry.model ?? "unknown",
    tool: entry.tool,
    hints: entry.prompt.slice(0, 200),
    metadata: {
      promptId: entry.promptId,
      galleryEntryId: entry.id,
      comfyUrl: entry.comfyUrl,
      status: entry.status,
      queuedAt: entry.queuedAt,
      completedAt: entry.completedAt,
      outputImage,
      images: entry.images,
      queueParams: entry.queueParams,
      sourceImageUrl: entry.sourceImageUrl ?? (outputImage ? buildComfyViewPath(entry.comfyUrl, outputImage) : undefined),
      maskImageUrl: entry.maskImageUrl,
      queueQualityProfile: entry.queueQualityProfile,
      parentGalleryEntryId: entry.parentGalleryEntryId,
      derivedKind: entry.derivedKind,
    },
  });
}

export function downloadGallerySidecar(entry: ComfyGalleryEntry): void {
  const sidecar = buildGallerySidecar(entry);
  const payload = JSON.stringify(sidecar, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gallery-${entry.promptId.slice(0, 8)}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadGalleryImage(
  entry: ComfyGalleryEntry,
  imageIndex = 0,
): Promise<void> {
  const image = entry.images[imageIndex];
  if (!image) {
    return;
  }

  const viewUrl = buildComfyViewPath(entry.comfyUrl, image);
  const response = await fetch(viewUrl);
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status})`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = image.filename || `comfyui-${entry.promptId.slice(0, 8)}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadGallerySidecarBundle(entries: ComfyGalleryEntry[]): void {
  if (entries.length === 0) {
    return;
  }

  const payload = JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries: entries.map((entry) => buildGallerySidecar(entry)),
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gallery-sidecars-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadGalleryImagesSequential(
  entries: ComfyGalleryEntry[],
): Promise<number> {
  let downloaded = 0;

  for (const entry of entries) {
    if (entry.status !== "completed" || entry.images.length === 0) {
      continue;
    }
    try {
      await downloadGalleryImage(entry, 0);
      downloaded += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    } catch {
      // continue with remaining entries
    }
  }

  return downloaded;
}
