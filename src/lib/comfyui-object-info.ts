import { getComfyUiBaseUrl } from "./comfyui-client";
import type { ComfyUiRuntimeConfig } from "./comfyui-config";

export type ComfyUiModelLists = {
  checkpoints: string[];
  unets: string[];
  vaes: string[];
  upscaleModels: string[];
  clips: string[];
  dualClipTypes: string[];
  clipLoaderTypes: string[];
  loras: string[];
  controlNets: string[];
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

/** True when ComfyUI object_info declares an input on the node (required or optional). */
export function nodeDefinesInput(
  objectInfo: Record<string, unknown>,
  classType: string,
  inputName: string,
): boolean {
  const node = objectInfo[classType];
  if (!node || typeof node !== "object") {
    return false;
  }
  const input = (node as { input?: Record<string, unknown> }).input;
  if (!input || typeof input !== "object") {
    return false;
  }
  if (inputName in input) {
    return true;
  }
  for (const group of ["required", "optional"] as const) {
    const section = input[group];
    if (section && typeof section === "object" && inputName in section) {
      return true;
    }
  }
  return false;
}

export function parseComfyObjectInfoModelLists(
  objectInfo: Record<string, unknown>,
): ComfyUiModelLists {
  return {
    checkpoints: readNodeInputOptions(objectInfo, "CheckpointLoaderSimple", "ckpt_name"),
    unets: readNodeInputOptions(objectInfo, "UNETLoader", "unet_name"),
    vaes: readNodeInputOptions(objectInfo, "VAELoader", "vae_name"),
    upscaleModels: readNodeInputOptions(objectInfo, "UpscaleModelLoader", "model_name"),
    clips: [
      ...new Set([
        ...readNodeInputOptions(objectInfo, "DualCLIPLoader", "clip_name1"),
        ...readNodeInputOptions(objectInfo, "CLIPLoader", "clip_name"),
      ]),
    ],
    dualClipTypes: readNodeInputOptions(objectInfo, "DualCLIPLoader", "type"),
    clipLoaderTypes: readNodeInputOptions(objectInfo, "CLIPLoader", "type"),
    loras: readNodeInputOptions(objectInfo, "LoraLoader", "lora_name"),
    controlNets: readNodeInputOptions(objectInfo, "ControlNetLoader", "control_net_name"),
  };
}

export async function fetchComfyObjectInfoModelLists(
  runtime?: ComfyUiRuntimeConfig,
): Promise<ComfyUiModelLists | null> {
  const payload = await fetchComfyObjectInfoPayload(runtime);
  return payload?.models ?? null;
}

export type ComfyObjectInfoPayload = {
  models: ComfyUiModelLists;
  nodeTypes: Set<string>;
  supportsNeuralUpscaleTileSize: boolean;
};

export async function fetchComfyObjectInfoPayload(
  runtime?: ComfyUiRuntimeConfig,
): Promise<ComfyObjectInfoPayload | null> {
  const baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/object_info`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  const objectInfo = (await response.json()) as Record<string, unknown>;
  return {
    models: parseComfyObjectInfoModelLists(objectInfo),
    nodeTypes: new Set(Object.keys(objectInfo)),
    supportsNeuralUpscaleTileSize: nodeDefinesInput(
      objectInfo,
      "ImageUpscaleWithModel",
      "tile_size",
    ),
  };
}

export async function fetchComfyObjectInfoNodeTypes(
  runtime?: ComfyUiRuntimeConfig,
): Promise<Set<string> | null> {
  const payload = await fetchComfyObjectInfoPayload(runtime);
  return payload?.nodeTypes ?? null;
}
