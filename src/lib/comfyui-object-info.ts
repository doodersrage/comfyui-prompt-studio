import { getComfyUiBaseUrl, type ComfyUiRuntimeConfig } from "./comfyui-client";

export type ComfyUiModelLists = {
  checkpoints: string[];
  unets: string[];
  vaes: string[];
  upscaleModels: string[];
  clips: string[];
  dualClipTypes: string[];
};

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readNodeInputOptions(
  objectInfo: Record<string, unknown>,
  classType: string,
  inputName: string,
): string[] {
  const node = objectInfo[classType];
  if (!node || typeof node !== "object") {
    return [];
  }
  const input = (node as { input?: Record<string, unknown> }).input?.[inputName];
  if (!Array.isArray(input) || !Array.isArray(input[0])) {
    return [];
  }
  return readStringList(input[0]);
}

export function parseComfyObjectInfoModelLists(
  objectInfo: Record<string, unknown>,
): ComfyUiModelLists {
  return {
    checkpoints: readNodeInputOptions(objectInfo, "CheckpointLoaderSimple", "ckpt_name"),
    unets: readNodeInputOptions(objectInfo, "UNETLoader", "unet_name"),
    vaes: readNodeInputOptions(objectInfo, "VAELoader", "vae_name"),
    upscaleModels: readNodeInputOptions(objectInfo, "UpscaleModelLoader", "model_name"),
    clips: readNodeInputOptions(objectInfo, "DualCLIPLoader", "clip_name1"),
    dualClipTypes: readNodeInputOptions(objectInfo, "DualCLIPLoader", "type"),
  };
}

export async function fetchComfyObjectInfoModelLists(
  runtime?: ComfyUiRuntimeConfig,
): Promise<ComfyUiModelLists | null> {
  const baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/object_info`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  const objectInfo = (await response.json()) as Record<string, unknown>;
  return parseComfyObjectInfoModelLists(objectInfo);
}
