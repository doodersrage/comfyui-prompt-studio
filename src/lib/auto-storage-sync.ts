import type { StorageNamespace } from "./storage-namespaces";
import { pullNamespaceFromServer, syncNamespaceToServer } from "./storage-sync";
import { initAppDb } from "./app-db-init";
import { loadSettingsCache, saveSettingsCache, type SettingsCache } from "./settings-cache";
import {
  loadPromptHistoryStore,
  savePromptHistoryStore,
  type PromptHistoryEntry,
} from "./prompt-history";
import {
  loadComfyGallery,
  saveComfyGalleryAsync,
  type ComfyGalleryEntry,
} from "./comfyui-gallery";
import {
  detectStorageConflicts,
  mergeArraysById,
  mergeSettingsCache,
  type MergeChoice,
  type StorageNamespaceConflict,
} from "./storage-merge";

export type AutoSyncResult = {
  synced: StorageNamespace[];
  conflicts: StorageNamespaceConflict[];
  skipped: boolean;
};

const SYNC_NAMESPACES: StorageNamespace[] = [
  "settings-cache",
  "prompt-history",
  "comfy-gallery",
];

function namespaceMeta(data: unknown): { updatedAt?: number; count?: number } {
  if (!data) {
    return {};
  }
  if (Array.isArray(data)) {
    const times = data
      .map((entry) => (entry as { updatedAt?: number; queuedAt?: number }).updatedAt ??
        (entry as { queuedAt?: number }).queuedAt ??
        0)
      .filter(Boolean);
    return {
      count: data.length,
      updatedAt: times.length ? Math.max(...times) : undefined,
    };
  }
  const record = data as { updatedAt?: number };
  return { updatedAt: record.updatedAt, count: 1 };
}

export async function probeStorageConflicts(): Promise<StorageNamespaceConflict[]> {
  await initAppDb();
  const localSettings = loadSettingsCache();
  const localHistory = loadPromptHistoryStore();
  const localGallery = loadComfyGallery();

  const probes = await Promise.all(
    SYNC_NAMESPACES.map(async (namespace) => {
      const server =
        namespace === "settings-cache"
          ? await pullNamespaceFromServer<SettingsCache>(namespace)
          : namespace === "prompt-history"
            ? await pullNamespaceFromServer<PromptHistoryEntry[]>(namespace)
            : await pullNamespaceFromServer<ComfyGalleryEntry[]>(namespace);
      const local =
        namespace === "settings-cache"
          ? localSettings
          : namespace === "prompt-history"
            ? localHistory
            : localGallery;
      return {
        namespace,
        local: namespaceMeta(local),
        server: namespaceMeta(server),
      };
    }),
  );

  return detectStorageConflicts({ namespaces: probes });
}

export async function applyStorageMerge(
  choices: Partial<Record<StorageNamespace, MergeChoice>>,
): Promise<AutoSyncResult> {
  await initAppDb();
  const conflicts = await probeStorageConflicts();
  const synced: StorageNamespace[] = [];

  for (const namespace of SYNC_NAMESPACES) {
    const choice = choices[namespace];
    const server =
      namespace === "settings-cache"
        ? await pullNamespaceFromServer<SettingsCache>(namespace)
        : namespace === "prompt-history"
          ? await pullNamespaceFromServer<PromptHistoryEntry[]>(namespace)
          : await pullNamespaceFromServer<ComfyGalleryEntry[]>(namespace);

    const local =
      namespace === "settings-cache"
        ? loadSettingsCache()
        : namespace === "prompt-history"
          ? loadPromptHistoryStore()
          : loadComfyGallery();

    if (choice === "server" && server) {
      if (namespace === "settings-cache") {
        saveSettingsCache(server as SettingsCache);
      } else if (namespace === "prompt-history") {
        savePromptHistoryStore(server as PromptHistoryEntry[]);
      } else if (server) {
        await saveComfyGalleryAsync(server as ComfyGalleryEntry[]);
      }
      synced.push(namespace);
      continue;
    }

    if (choice === "local" && local) {
      await syncNamespaceToServer(namespace, local);
      synced.push(namespace);
      continue;
    }

    if (choice === "merge" && local && server) {
      if (namespace === "settings-cache") {
        const merged = mergeSettingsCache(
          local as SettingsCache,
          server as SettingsCache,
        );
        saveSettingsCache(merged);
        await syncNamespaceToServer(namespace, merged);
      } else if (namespace === "prompt-history") {
        const merged = mergeArraysById(
          local as PromptHistoryEntry[],
          server as PromptHistoryEntry[],
          (a, b) => ((a.timestamp ?? 0) >= (b.timestamp ?? 0) ? a : b),
        );
        savePromptHistoryStore(merged);
        await syncNamespaceToServer(namespace, merged);
      } else {
        const merged = mergeArraysById(
          local as ComfyGalleryEntry[],
          server as ComfyGalleryEntry[],
          (a, b) => ((a.completedAt ?? a.queuedAt) >= (b.completedAt ?? b.queuedAt) ? a : b),
        );
        await saveComfyGalleryAsync(merged);
        await syncNamespaceToServer(namespace, merged);
      }
      synced.push(namespace);
    }
  }

  return { synced, conflicts, skipped: false };
}

export async function autoPullStorageIfEmpty(): Promise<AutoSyncResult> {
  await initAppDb();
  const health = await fetch("/api/health").then((response) => response.json()).catch(() => null);
  if (!(health as { storage?: { enabled?: boolean } } | null)?.storage?.enabled) {
    return { synced: [], conflicts: [], skipped: true };
  }

  const history = loadPromptHistoryStore();
  const gallery = loadComfyGallery();
  if (history.length > 0 || gallery.length > 0) {
    const conflicts = await probeStorageConflicts();
    return { synced: [], conflicts, skipped: true };
  }

  const synced: StorageNamespace[] = [];
  for (const namespace of SYNC_NAMESPACES) {
    const server = await pullNamespaceFromServer<unknown>(namespace);
    if (!server) {
      continue;
    }
    if (namespace === "settings-cache") {
      saveSettingsCache(server as SettingsCache);
    } else if (namespace === "prompt-history") {
      savePromptHistoryStore(server as PromptHistoryEntry[]);
    } else {
      await saveComfyGalleryAsync(server as ComfyGalleryEntry[]);
    }
    synced.push(namespace);
  }
  return { synced, conflicts: [], skipped: false };
}

export async function autoPushStorageDebounced(): Promise<void> {
  const health = await fetch("/api/health").then((response) => response.json()).catch(() => null);
  if (!(health as { storage?: { enabled?: boolean } } | null)?.storage?.enabled) {
    return;
  }
  await initAppDb();
  await syncNamespaceToServer("settings-cache", loadSettingsCache());
  await syncNamespaceToServer("prompt-history", loadPromptHistoryStore());
  const gallery = loadComfyGallery();
  if (gallery.length > 0) {
    await syncNamespaceToServer("comfy-gallery", gallery);
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutoPushStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(() => {
    void autoPushStorageDebounced();
  }, 5000);
}
