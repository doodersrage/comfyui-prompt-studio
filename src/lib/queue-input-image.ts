"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import { uploadComfyInputImage } from "./comfyui-image-upload";

export type ResolveQueueInputImageOptions = {
  file?: File | null;
  filename?: string;
  imageUrl?: string;
  model?: ComfyImageModel | string;
};

export async function resolveQueueInputImageFilename(
  options: ResolveQueueInputImageOptions,
): Promise<string | undefined> {
  if (options.file) {
    const uploaded = await uploadComfyInputImage({
      file: options.file,
      model: options.model,
    });
    return uploaded.name;
  }

  if (options.imageUrl?.trim()) {
    const response = await fetch(options.imageUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch image for ComfyUI upload (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    const filename =
      options.filename?.trim() || `prompt-studio-${Date.now()}.png`;
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    const uploaded = await uploadComfyInputImage({ file, model: options.model });
    return uploaded.name;
  }

  return options.filename?.trim() || undefined;
}
