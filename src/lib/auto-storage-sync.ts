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
  filterOutDeletedGalleryEntries,
  loadGalleryDeletedIds,
  mergeGalleryDeletedIds,
  saveGalleryDeletedIds,
} from "./gallery-deleted-ids";
import {
  detectStorageConflicts,
  mergeArraysById,
  mergeSettingsCache,
  suggestMergeChoice,
  type MergeChoice,
  type StorageNamespaceConflict,
} from "./storage-merge";

export type AutoSyncResult = {
  synced: StorageNamespace[];
  conflicts: StorageNamespaceConflict[];
  skipped: boolean;
  /** True when browser had no history/gallery and we pulled server snapshots. */
  pulledIntoEmpty?: boolean;
};

const SYNC_NAMESPACES: StorageNamespace[] = [
  "settings-cache",
  "prompt-history",
  "comfy-gallery",
  "gallery-deleted-ids",
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
  const localDeleted = loadGalleryDeletedIds();

  const probes = await Promise.all(
    SYNC_NAMESPACES.map(async (namespace) => {
      if (namespace === "gallery-deleted-ids") {
        const serverDeleted = await pullNamespaceFromServer<
          string[] | { ids?: string[] }
        >(namespace);
        const serverIds = Array.isArray(serverDeleted)
          ? serverDeleted
          : Array.isArray(serverDeleted?.ids)
            ? serverDeleted.ids
            : [];
        return {
          namespace,
          local: { count: localDeleted.length, updatedAt: Date.now() },
          server: { count: serverIds.length },
        };
      }
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
    if (namespace === "gallery-deleted-ids") {
      const serverDeleted = await pullNamespaceFromServer<
        string[] | { ids?: string[] }
      >(namespace);
      const serverIds = Array.isArray(serverDeleted)
        ? serverDeleted
        : Array.isArray(serverDeleted?.ids)
          ? serverDeleted.ids
          : [];
      const localIds = loadGalleryDeletedIds();
      if (choice === "server" && serverIds.length > 0) {
        saveGalleryDeletedIds(serverIds);
        synced.push(namespace);
        continue;
      }
      if (choice === "local") {
        await syncNamespaceToServer(namespace, localIds);
        synced.push(namespace);
        continue;
      }
      const mergedIds = mergeGalleryDeletedIds(localIds, serverIds);
      saveGalleryDeletedIds(mergedIds);
      await syncNamespaceToServer(namespace, mergedIds);
      synced.push(namespace);
      continue;
    }

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
        const cleaned = filterOutDeletedGalleryEntries(
          server as ComfyGalleryEntry[],
        );
        await saveComfyGalleryAsync(cleaned);
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
        const merged = filterOutDeletedGalleryEntries(
          mergeArraysById(
            local as ComfyGalleryEntry[],
            server as ComfyGalleryEntry[],
            (a, b) =>
              (a.completedAt ?? a.queuedAt) >= (b.completedAt ?? b.queuedAt)
                ? a
                : b,
          ),
        );
        await saveComfyGalleryAsync(merged);
        await syncNamespaceToServer(namespace, merged);
      }
      synced.push(namespace);
    }
  }

  return { synced, conflicts, skipped: false };
}

/**
 * Startup sync: pull when local is empty; otherwise silently merge/push.
 * Avoids blocking the UI with the conflict modal on every visit.
 */
export async function autoPullStorageIfEmpty(): Promise<AutoSyncResult> {
  await initAppDb();
  const health = await fetch("/api/health").then((response) => response.json()).catch(() => null);
  if (!(health as { storage?: { enabled?: boolean } } | null)?.storage?.enabled) {
    return { synced: [], conflicts: [], skipped: true };
  }

  const history = loadPromptHistoryStore();
  const gallery = loadComfyGallery();
  if (history.length === 0 && gallery.length === 0) {
    const synced: StorageNamespace[] = [];
    // Pull tombstones first so a full server gallery does not resurrect deletes.
    const serverDeleted = await pullNamespaceFromServer<
      string[] | { ids?: string[] }
    >("gallery-deleted-ids");
    const serverDeletedIds = Array.isArray(serverDeleted)
      ? serverDeleted
      : Array.isArray(serverDeleted?.ids)
        ? serverDeleted.ids
        : [];
    if (serverDeletedIds.length > 0) {
      saveGalleryDeletedIds(
        mergeGalleryDeletedIds(loadGalleryDeletedIds(), serverDeletedIds),
      );
      synced.push("gallery-deleted-ids");
    }
    for (const namespace of SYNC_NAMESPACES) {
      if (namespace === "gallery-deleted-ids") {
        continue;
      }
      const server = await pullNamespaceFromServer<unknown>(namespace);
      if (!server) {
        continue;
      }
      if (namespace === "settings-cache") {
        saveSettingsCache(server as SettingsCache);
      } else if (namespace === "prompt-history") {
        savePromptHistoryStore(server as PromptHistoryEntry[]);
      } else {
        await saveComfyGalleryAsync(
          filterOutDeletedGalleryEntries(server as ComfyGalleryEntry[]),
        );
      }
      synced.push(namespace);
    }
    return { synced, conflicts: [], skipped: false, pulledIntoEmpty: synced.length > 0 };
  }

  const conflicts = await probeStorageConflicts();
  if (conflicts.length === 0) {
    return { synced: [], conflicts: [], skipped: true };
  }

  const choices: Partial<Record<StorageNamespace, MergeChoice>> = {};
  for (const conflict of conflicts) {
    choices[conflict.namespace as StorageNamespace] = suggestMergeChoice(conflict);
  }
  const result = await applyStorageMerge(choices);
  return {
    synced: result.synced,
    // Resolved automatically — do not surface the modal.
    conflicts: [],
    skipped: false,
    pulledIntoEmpty: false,
  };
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
  const deletedIds = loadGalleryDeletedIds();
  // Always push gallery (including []) so deletes clear the server source of truth.
  await syncNamespaceToServer("comfy-gallery", gallery);
  await syncNamespaceToServer("gallery-deleted-ids", deletedIds);
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
