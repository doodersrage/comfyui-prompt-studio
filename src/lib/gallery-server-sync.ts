"use client";

import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
import { pullNamespaceFromServer, syncNamespaceToServer } from "./storage-sync";
import { capGalleryEntriesForLocalStorage } from "./gallery-cap";
import { MAX_GALLERY_ENTRIES } from "./comfyui-gallery-storage-meta";

const GALLERY_NAMESPACE = "comfy-gallery" as const;

type MergeableGalleryEntry = Pick<ComfyGalleryEntry, "id" | "queuedAt" | "completedAt">;

function entryTimestamp(entry: MergeableGalleryEntry): number {
  return entry.completedAt ?? entry.queuedAt ?? 0;
}

export type GalleryMergeResult<T extends MergeableGalleryEntry> = {
  merged: T[];
  addedFromServer: number;
  updatedFromServer: number;
};

/**
 * Merges a server-pulled gallery snapshot into the local list, deduping by
 * id and preferring whichever side is newer by completedAt (falling back to
 * queuedAt) — same rule as the existing prompt-history/gallery conflict
 * merge in auto-storage-sync.ts, but usable outside the manual conflict-modal
 * flow (e.g. an opportunistic merge-on-load).
 */
export function mergeGalleryWithServer<T extends MergeableGalleryEntry>(
  local: T[],
  server: T[],
): GalleryMergeResult<T> {
  const byId = new Map<string, T>(local.map((entry) => [entry.id, entry]));
  let addedFromServer = 0;
  let updatedFromServer = 0;

  for (const serverEntry of server) {
    const localEntry = byId.get(serverEntry.id);
    if (!localEntry) {
      byId.set(serverEntry.id, serverEntry);
      addedFromServer += 1;
      continue;
    }
    if (entryTimestamp(serverEntry) > entryTimestamp(localEntry)) {
      byId.set(serverEntry.id, serverEntry);
      updatedFromServer += 1;
    }
  }

  const merged = [...byId.values()].sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
  return { merged, addedFromServer, updatedFromServer };
}

async function isServerStorageEnabledClient(): Promise<boolean> {
  try {
    const response = await fetch("/api/health");
    const data = (await response.json()) as { storage?: { enabled?: boolean } };
    return Boolean(data.storage?.enabled);
  } catch {
    return false;
  }
}

export type GalleryServerPullResult = {
  ok: boolean;
  changed: boolean;
  addedFromServer: number;
  updatedFromServer: number;
  evictedLocally: number;
  error?: string;
};

/**
 * Pulls the server `comfy-gallery` namespace and merges it into the local
 * gallery (non-destructive — never removes local-only entries). Applies the
 * favorites/rating-aware local cap after merging; if entries are evicted
 * locally as a result, re-pushes the full merged list to the server so
 * server storage keeps the complete history.
 */
export async function pullAndMergeGalleryFromServer(): Promise<GalleryServerPullResult> {
  if (typeof window === "undefined") {
    return { ok: false, changed: false, addedFromServer: 0, updatedFromServer: 0, evictedLocally: 0 };
  }

  if (!(await isServerStorageEnabledClient())) {
    return {
      ok: false,
      changed: false,
      addedFromServer: 0,
      updatedFromServer: 0,
      evictedLocally: 0,
      error: "Server storage disabled. Set PROMPT_DATA_DIR on the server.",
    };
  }

  const server = await pullNamespaceFromServer<ComfyGalleryEntry[]>(GALLERY_NAMESPACE);
  if (!server?.length) {
    return { ok: true, changed: false, addedFromServer: 0, updatedFromServer: 0, evictedLocally: 0 };
  }

  const { loadComfyGallery, saveComfyGalleryAsync } = await import("./comfyui-gallery");
  const local = loadComfyGallery();
  const { merged, addedFromServer, updatedFromServer } = mergeGalleryWithServer(local, server);

  if (addedFromServer === 0 && updatedFromServer === 0) {
    return { ok: true, changed: false, addedFromServer: 0, updatedFromServer: 0, evictedLocally: 0 };
  }

  const capped = capGalleryEntriesForLocalStorage(merged, MAX_GALLERY_ENTRIES);
  await saveComfyGalleryAsync(capped.kept);

  if (capped.evicted.length > 0) {
    // Local dropped low-value entries beyond the cap — keep the server copy complete.
    void syncNamespaceToServer(GALLERY_NAMESPACE, merged);
  }

  return {
    ok: true,
    changed: true,
    addedFromServer,
    updatedFromServer,
    evictedLocally: capped.evicted.length,
  };
}

export type GalleryServerPushResult = {
  ok: boolean;
  count: number;
  error?: string;
};

/** Pushes the full local gallery to server storage (overwrites the server namespace). */
export async function pushGalleryToServer(): Promise<GalleryServerPushResult> {
  if (typeof window === "undefined") {
    return { ok: false, count: 0 };
  }
  if (!(await isServerStorageEnabledClient())) {
    return { ok: false, count: 0, error: "Server storage disabled. Set PROMPT_DATA_DIR on the server." };
  }
  const { loadComfyGallery } = await import("./comfyui-gallery");
  const gallery = loadComfyGallery();
  const ok = await syncNamespaceToServer(GALLERY_NAMESPACE, gallery);
  return { ok, count: gallery.length };
}

/** Server gallery entry count for display in Settings → Data — null when unavailable. */
export async function fetchServerGalleryCount(): Promise<number | null> {
  const server = await pullNamespaceFromServer<ComfyGalleryEntry[]>(GALLERY_NAMESPACE);
  return Array.isArray(server) ? server.length : null;
}
