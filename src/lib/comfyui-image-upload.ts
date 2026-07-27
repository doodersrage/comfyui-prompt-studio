"use client";

import { compressImageForEngineUpload } from "./browser-compress-image";
import { fileToDataUrl } from "./browser-file-data-url";
import { resolveRuntimeForModel } from "./comfyui-runtime-for-model";
import type { ComfyImageModel } from "./comfy-models/client";

export type ComfyUploadedImage = {
  name: string;
  subfolder?: string;
  type?: string;
  width?: number;
  height?: number;
};

async function uploadJson(
  file: File,
  comfyUrl: string | undefined,
): Promise<ComfyUploadedImage> {
  const image = await fileToDataUrl(file);
  // ~10MB proxy/Next truncation — refuse before a cryptic JSON parse error.
  if (image.length > 9_000_000) {
    throw new Error(
      "Image is still too large after compression. Try a smaller figure (under ~6MB).",
    );
  }

  const response = await fetch("/api/comfyui/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image,
      mimeType: file.type || "image/png",
      filename: file.name || "prompt-studio-upload.png",
      ...(comfyUrl ? { comfyUrl } : {}),
    }),
  });

  const data = (await response.json()) as ComfyUploadedImage & { error?: string };
  if (!response.ok || !data.name?.trim()) {
    throw new Error(data.error ?? "ComfyUI image upload failed.");
  }

  return {
    name: data.name.trim(),
    subfolder: data.subfolder?.trim() || undefined,
    type: data.type?.trim() || undefined,
  };
}

async function uploadMultipart(
  file: File,
  comfyUrl: string | undefined,
): Promise<ComfyUploadedImage> {
  const formData = new FormData();
  formData.append("image", file, file.name);
  if (comfyUrl) {
    formData.append("comfyUrl", comfyUrl);
  }

  const response = await fetch("/api/comfyui/upload", {
    method: "POST",
    body: formData,
  });

  const data = (await response.json()) as ComfyUploadedImage & { error?: string };
  if (!response.ok || !data.name?.trim()) {
    throw new Error(data.error ?? "ComfyUI image upload failed.");
  }

  return {
    name: data.name.trim(),
    subfolder: data.subfolder?.trim() || undefined,
    type: data.type?.trim() || undefined,
  };
}

export async function uploadComfyInputImage(input: {
  file: File;
  model?: ComfyImageModel | string;
  comfyUrl?: string;
}): Promise<ComfyUploadedImage> {
  const runtime = input.model
    ? resolveRuntimeForModel(input.model as ComfyImageModel)
    : undefined;
  const comfyUrl =
    input.comfyUrl?.trim() || runtime?.apiUrl?.trim() || undefined;

  // Compress first so neither FormData nor JSON hits the ~10MB truncation wall.
  const prepared = await compressImageForEngineUpload(input.file, {
    maxEdge: 2048,
    maxBytes: 7_000_000,
    quality: 0.92,
  });

  let width: number | undefined;
  let height: number | undefined;
  try {
    const { probeImageFileDimensions } = await import("./browser-image-dimensions");
    const size = await probeImageFileDimensions(prepared);
    if (size) {
      width = size.width;
      height = size.height;
    }
  } catch {
    /* optional */
  }

  try {
    const uploaded = await uploadMultipart(prepared, comfyUrl);
    return { ...uploaded, width, height };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Next/undici multipart parse failures — JSON data URL is reliable once compressed.
    if (!/FormData|parse body|multipart/i.test(message)) {
      throw error;
    }
    const uploaded = await uploadJson(prepared, comfyUrl);
    return { ...uploaded, width, height };
  }
}
