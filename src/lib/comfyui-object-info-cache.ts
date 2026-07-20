"use client";

import type { ComfyUiModelLists } from "./comfyui-object-info";
import { resolveComfyUiRuntime } from "./comfyui-runtime";

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  fetchedAt: number;
  comfyUrl: string;
  models: ComfyUiModelLists;
};

let memoryCache: CacheEntry | null = null;

export function readCachedComfyObjectInfoModels(
  comfyUrl?: string,
): ComfyUiModelLists | null {
  const resolved =
    comfyUrl?.trim().replace(/\/+$/, "") ||
    resolveComfyUiRuntime()?.apiUrl?.trim().replace(/\/+$/, "") ||
    "";
  if (!resolved || !memoryCache) {
    return null;
  }
  if (memoryCache.comfyUrl !== resolved) {
    return null;
  }
  if (Date.now() - memoryCache.fetchedAt > CACHE_TTL_MS) {
    return null;
  }
  return memoryCache.models;
}

export async function fetchComfyObjectInfoModelsCached(input?: {
  comfyUrl?: string;
}): Promise<ComfyUiModelLists | null> {
  const runtime = resolveComfyUiRuntime();
  const comfyUrl = input?.comfyUrl?.trim() || runtime?.apiUrl?.trim() || "";
  const cached = readCachedComfyObjectInfoModels(comfyUrl);
  if (cached) {
    return cached;
  }

  const params = comfyUrl ? `?comfyUrl=${encodeURIComponent(comfyUrl)}` : "";
  const response = await fetch(`/api/comfyui/object-info${params}`);
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { models?: ComfyUiModelLists };
  if (!data.models) {
    return null;
  }

  memoryCache = {
    fetchedAt: Date.now(),
    comfyUrl: comfyUrl.replace(/\/+$/, "") || "default",
    models: data.models,
  };
  return data.models;
}

export function clearComfyObjectInfoCache(): void {
  memoryCache = null;
}
