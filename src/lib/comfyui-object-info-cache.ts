"use client";

import type { ComfyUiModelLists } from "./comfyui-object-info";
import { resolveComfyUiRuntime } from "./comfyui-runtime";
import type { WebpSaveAdapter } from "./workflow-save-format";

const CACHE_TTL_MS = 5 * 60 * 1000;

export type ComfyObjectInfoCachePayload = {
  models: ComfyUiModelLists;
  nodeTypes: Set<string>;
  supportsNeuralUpscaleTileSize: boolean;
  webpSaveAdapters: WebpSaveAdapter[];
};

type CacheEntry = {
  fetchedAt: number;
  comfyUrl: string;
} & ComfyObjectInfoCachePayload;

let memoryCache: CacheEntry | null = null;

function resolveCacheUrl(comfyUrl?: string): string {
  return (
    comfyUrl?.trim().replace(/\/+$/, "") ||
    resolveComfyUiRuntime()?.apiUrl?.trim().replace(/\/+$/, "") ||
    ""
  );
}

export function readCachedComfyObjectInfoModels(
  comfyUrl?: string,
): ComfyUiModelLists | null {
  return readCachedComfyObjectInfo(comfyUrl)?.models ?? null;
}

export function readCachedComfyObjectInfo(
  comfyUrl?: string,
): ComfyObjectInfoCachePayload | null {
  const resolved = resolveCacheUrl(comfyUrl);
  if (!resolved || !memoryCache) {
    return null;
  }
  if (memoryCache.comfyUrl !== resolved) {
    return null;
  }
  if (Date.now() - memoryCache.fetchedAt > CACHE_TTL_MS) {
    return null;
  }
  return {
    models: memoryCache.models,
    nodeTypes: memoryCache.nodeTypes,
    supportsNeuralUpscaleTileSize: memoryCache.supportsNeuralUpscaleTileSize,
    webpSaveAdapters: memoryCache.webpSaveAdapters,
  };
}

export async function fetchComfyObjectInfoCached(input?: {
  comfyUrl?: string;
  forceRefresh?: boolean;
}): Promise<ComfyObjectInfoCachePayload | null> {
  const runtime = resolveComfyUiRuntime();
  const comfyUrl = input?.comfyUrl?.trim() || runtime?.apiUrl?.trim() || "";
  if (!input?.forceRefresh) {
    const cached = readCachedComfyObjectInfo(comfyUrl);
    if (cached) {
      return cached;
    }
  } else {
    clearComfyObjectInfoCache();
  }

  const params = new URLSearchParams();
  if (comfyUrl) {
    params.set("comfyUrl", comfyUrl);
  }
  if (input?.forceRefresh) {
    params.set("forceRefresh", "1");
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/comfyui/object-info${query}`);
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as {
    models?: ComfyUiModelLists;
    nodeTypes?: string[];
    supportsNeuralUpscaleTileSize?: boolean;
    webpSaveAdapters?: WebpSaveAdapter[];
  };
  if (!data.models) {
    return null;
  }

  memoryCache = {
    fetchedAt: Date.now(),
    comfyUrl: comfyUrl.replace(/\/+$/, "") || "default",
    models: data.models,
    nodeTypes: new Set(data.nodeTypes ?? []),
    supportsNeuralUpscaleTileSize: data.supportsNeuralUpscaleTileSize === true,
    webpSaveAdapters: Array.isArray(data.webpSaveAdapters) ? data.webpSaveAdapters : [],
  };
  return {
    models: memoryCache.models,
    nodeTypes: memoryCache.nodeTypes,
    supportsNeuralUpscaleTileSize: memoryCache.supportsNeuralUpscaleTileSize,
    webpSaveAdapters: memoryCache.webpSaveAdapters,
  };
}

export async function fetchComfyObjectInfoModelsCached(input?: {
  comfyUrl?: string;
  forceRefresh?: boolean;
}): Promise<ComfyUiModelLists | null> {
  const payload = await fetchComfyObjectInfoCached(input);
  return payload?.models ?? null;
}

export async function fetchComfyObjectInfoNodeTypesCached(input?: {
  comfyUrl?: string;
}): Promise<Set<string> | null> {
  const comfyUrl = input?.comfyUrl?.trim() || resolveComfyUiRuntime()?.apiUrl?.trim() || "";
  const cached = readCachedComfyObjectInfo(comfyUrl);
  if (cached && cached.nodeTypes.size) {
    return cached.nodeTypes;
  }

  const payload = await fetchComfyObjectInfoCached({ comfyUrl });
  return payload?.nodeTypes ?? null;
}

export function clearComfyObjectInfoCache(): void {
  memoryCache = null;
}
