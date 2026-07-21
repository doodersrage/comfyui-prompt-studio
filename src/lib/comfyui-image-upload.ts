"use client";

import { resolveRuntimeForModel } from "./comfyui-runtime-for-model";
import type { ComfyImageModel } from "./comfy-models/client";

export type ComfyUploadedImage = {
  name: string;
  subfolder?: string;
  type?: string;
};

export async function uploadComfyInputImage(input: {
  file: File;
  model?: ComfyImageModel | string;
  comfyUrl?: string;
}): Promise<ComfyUploadedImage> {
  const runtime = input.model ? resolveRuntimeForModel(input.model as ComfyImageModel) : undefined;
  const formData = new FormData();
  formData.append("image", input.file, input.file.name);
  if (input.comfyUrl?.trim()) {
    formData.append("comfyUrl", input.comfyUrl.trim());
  } else if (runtime?.apiUrl?.trim()) {
    formData.append("comfyUrl", runtime.apiUrl.trim());
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
