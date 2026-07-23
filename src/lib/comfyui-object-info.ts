import { getComfyUiBaseUrl } from "./comfyui-client";
import type { ComfyUiRuntimeConfig } from "./comfyui-config";
import {
  discoverWebpSaveAdapters,
  type WebpSaveAdapter,
} from "./workflow-save-format";

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
  /** CLIPVisionLoader clip_name inventory (IP-Adapter packs). Optional for older caches. */
  clipVisions?: string[];
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
  const input = (node as { input?: Record<string, unknown> }).input;
  if (!input || typeof input !== "object") {
    return [];
  }

  const candidates: unknown[] = [input[inputName]];
  for (const group of ["required", "optional"] as const) {
    const section = input[group];
    if (section && typeof section === "object") {
      candidates.push((section as Record<string, unknown>)[inputName]);
    }
  }

  for (const candidate of candidates) {
    // Classic combo: [["a.safetensors", "b.safetensors"], { … }]
    if (Array.isArray(candidate) && Array.isArray(candidate[0])) {
      const list = readStringList(candidate[0]);
      if (list.length > 0) {
        return list;
      }
    }
    // Newer combo object: { options: [...], default: "…" }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const options = (candidate as { options?: unknown }).options;
      const list = readStringList(options);
      if (list.length > 0) {
        return list;
      }
    }
  }

  return [];
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
    unets: [
      ...new Set([
        ...readNodeInputOptions(objectInfo, "UNETLoader", "unet_name"),
        // GGUF custom node uses a separate loader with its own filename list.
        ...readNodeInputOptions(objectInfo, "UnetLoaderGGUF", "unet_name"),
      ]),
    ],
    vaes: readNodeInputOptions(objectInfo, "VAELoader", "vae_name"),
    upscaleModels: readNodeInputOptions(objectInfo, "UpscaleModelLoader", "model_name"),
    clips: [
      ...new Set([
        ...readNodeInputOptions(objectInfo, "DualCLIPLoader", "clip_name1"),
        ...readNodeInputOptions(objectInfo, "DualCLIPLoader", "clip_name2"),
        ...readNodeInputOptions(objectInfo, "CLIPLoader", "clip_name"),
      ]),
    ],
    dualClipTypes: readNodeInputOptions(objectInfo, "DualCLIPLoader", "type"),
    clipLoaderTypes: readNodeInputOptions(objectInfo, "CLIPLoader", "type"),
    loras: [
      ...new Set([
        ...readNodeInputOptions(objectInfo, "LoraLoader", "lora_name"),
        ...readNodeInputOptions(objectInfo, "LoraLoaderModelOnly", "lora_name"),
      ]),
    ],
    controlNets: readNodeInputOptions(objectInfo, "ControlNetLoader", "control_net_name"),
    clipVisions: readNodeInputOptions(objectInfo, "CLIPVisionLoader", "clip_name"),
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
  webpSaveAdapters: WebpSaveAdapter[];
};

const SERVER_OBJECT_INFO_TTL_MS = 5 * 60 * 1000;

type ServerObjectInfoCacheEntry = {
  fetchedAt: number;
  baseUrl: string;
  payload: ComfyObjectInfoPayload;
};

/** Process-local cache for server queue / API routes (client has its own cache). */
const serverObjectInfoCache = new Map<string, ServerObjectInfoCacheEntry>();

export function clearServerComfyObjectInfoCache(): void {
  serverObjectInfoCache.clear();
}

function cloneObjectInfoPayload(payload: ComfyObjectInfoPayload): ComfyObjectInfoPayload {
  return {
    models: {
      checkpoints: [...payload.models.checkpoints],
      unets: [...payload.models.unets],
      vaes: [...payload.models.vaes],
      upscaleModels: [...payload.models.upscaleModels],
      clips: [...payload.models.clips],
      dualClipTypes: [...payload.models.dualClipTypes],
      clipLoaderTypes: [...payload.models.clipLoaderTypes],
      loras: [...payload.models.loras],
      controlNets: [...payload.models.controlNets],
      clipVisions: [...(payload.models.clipVisions ?? [])],
    },
    nodeTypes: new Set(payload.nodeTypes),
    supportsNeuralUpscaleTileSize: payload.supportsNeuralUpscaleTileSize,
    webpSaveAdapters: payload.webpSaveAdapters.map((adapter) => ({ ...adapter })),
  };
}

export async function fetchComfyObjectInfoPayload(
  runtime?: ComfyUiRuntimeConfig,
  options?: { forceRefresh?: boolean },
): Promise<ComfyObjectInfoPayload | null> {
  const baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, "");
  if (!options?.forceRefresh) {
    const cached = serverObjectInfoCache.get(baseUrl);
    if (cached && Date.now() - cached.fetchedAt <= SERVER_OBJECT_INFO_TTL_MS) {
      return cloneObjectInfoPayload(cached.payload);
    }
  }

  const response = await fetch(`${baseUrl}/object_info`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  const objectInfo = (await response.json()) as Record<string, unknown>;
  const payload: ComfyObjectInfoPayload = {
    models: parseComfyObjectInfoModelLists(objectInfo),
    nodeTypes: new Set(Object.keys(objectInfo)),
    supportsNeuralUpscaleTileSize: nodeDefinesInput(
      objectInfo,
      "ImageUpscaleWithModel",
      "tile_size",
    ),
    webpSaveAdapters: discoverWebpSaveAdapters(objectInfo),
  };
  serverObjectInfoCache.set(baseUrl, {
    fetchedAt: Date.now(),
    baseUrl,
    payload,
  });
  return cloneObjectInfoPayload(payload);
}

export async function fetchComfyObjectInfoNodeTypes(
  runtime?: ComfyUiRuntimeConfig,
): Promise<Set<string> | null> {
  const payload = await fetchComfyObjectInfoPayload(runtime);
  return payload?.nodeTypes ?? null;
}
