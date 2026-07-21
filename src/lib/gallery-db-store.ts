import { appDb } from "./app-db";
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from "./browser-storage";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
import {
  COMFYUI_GALLERY_KEY,
  COMFYUI_GALLERY_UPDATED_EVENT,
  MAX_GALLERY_ENTRIES,
} from "./comfyui-gallery-storage-meta";
import { getActiveUserId, isUserScoped } from "./user-scope";

/** First paint loads one page of recent entries; the rest hydrate in the background. */
export const INITIAL_GALLERY_LOAD_LIMIT = 48;

let allEntries: ComfyGalleryEntry[] = [];
let cache: ComfyGalleryEntry[] = [];
let cacheDirty = false;
let ready = false;
let readyPromise: Promise<void> | null = null;
let fullLoadPromise: Promise<void> | null = null;
/** Fingerprints of entries last written to IndexedDB (incremental sync). */
let persistedFingerprints = new Map<string, string>();

function galleryEntryFingerprint(entry: ComfyGalleryEntry): string {
  return [
    entry.status,
    entry.completedAt ?? 0,
    entry.favorite ? 1 : 0,
    entry.reviewRating ?? 0,
    entry.images.map((image) => `${image.filename}:${image.subfolder}:${image.type}`).join(","),
    entry.statusMessage ?? "",
    entry.queuePosition ?? "",
    entry.visionTags?.join(",") ?? "",
    entry.projectId ?? "",
    entry.promptId,
    entry.prompt.length,
    entry.negativePrompt?.length ?? 0,
    entry.derivedKind ?? "",
    entry.parentGalleryEntryId ?? "",
  ].join("|");
}

/** Sync legacy localStorage into memory for instant first paint. */
export function primeGalleryCacheSync(): void {
  if (typeof window === "undefined" || cache.length > 0) {
    return;
  }

  const legacy = readLegacyLocalStorageGallery();
  if (legacy.length === 0) {
    return;
  }

  allEntries = legacy.slice(0, MAX_GALLERY_ENTRIES);
  assignLegacyGalleryEntriesToActiveUser();
  refreshCacheFromAll();
}

export function warmGalleryStore(): Promise<void> {
  primeGalleryCacheSync();
  return hydrateGalleryStore();
}

function stampEntryUserId(entry: ComfyGalleryEntry): ComfyGalleryEntry {
  const userId = getActiveUserId();
  if (!userId || entry.userId) {
    return entry;
  }
  return { ...entry, userId };
}

function filterEntriesForActiveUser(entries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  const userId = getActiveUserId();
  if (!userId) {
    return entries;
  }
  return entries.filter((entry) => !entry.userId || entry.userId === userId);
}

function mergeUserEntriesIntoAll(userEntries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  const userId = getActiveUserId();
  const trimmedUser = userEntries.slice(0, MAX_GALLERY_ENTRIES).map(stampEntryUserId);

  if (!userId) {
    return trimmedUser;
  }

  const others = allEntries.filter((entry) => entry.userId && entry.userId !== userId);
  return [...trimmedUser, ...others];
}

function refreshCacheFromAll(): void {
  cache = filterEntriesForActiveUser(allEntries).slice(0, MAX_GALLERY_ENTRIES);
}

function assignLegacyGalleryEntriesToActiveUser(): void {
  if (!isUserScoped()) {
    return;
  }

  const userId = getActiveUserId();
  if (!userId) {
    return;
  }

  const hasUserEntries = allEntries.some((entry) => entry.userId === userId);
  if (hasUserEntries) {
    return;
  }

  const orphans = allEntries.filter((entry) => !entry.userId);
  if (orphans.length === 0) {
    return;
  }

  allEntries = allEntries.map((entry) =>
    entry.userId ? entry : { ...entry, userId },
  );
}

export function isGalleryStoreReady(): boolean {
  return ready;
}

export function getGalleryCache(): ComfyGalleryEntry[] {
  return cache;
}

export function setGalleryCache(entries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  allEntries = mergeUserEntriesIntoAll(entries);
  refreshCacheFromAll();
  cacheDirty = true;
  return cache;
}

export function notifyGalleryUpdated(): void {
  window.dispatchEvent(new CustomEvent(COMFYUI_GALLERY_UPDATED_EVENT));
}

export async function reloadGalleryForActiveUser(): Promise<void> {
  if (!ready) {
    return;
  }

  assignLegacyGalleryEntriesToActiveUser();
  refreshCacheFromAll();
  notifyGalleryUpdated();
}

function readLegacyLocalStorageGallery(): ComfyGalleryEntry[] {
  const parsed = readBrowserValue<unknown>(COMFYUI_GALLERY_KEY);
  return Array.isArray(parsed) ? (parsed as ComfyGalleryEntry[]) : [];
}

function writeLegacyLocalStorageGallery(entries: ComfyGalleryEntry[]): void {
  writeBrowserValue(COMFYUI_GALLERY_KEY, entries.slice(0, MAX_GALLERY_ENTRIES));
}

async function migrateGalleryFromLocalStorage(): Promise<void> {
  if (!appDb) {
    return;
  }

  const existing = await appDb.galleryEntries.orderBy("queuedAt").reverse().limit(1).first();
  if (existing) {
    return;
  }

  const legacy = readLegacyLocalStorageGallery();
  if (legacy.length === 0) {
    return;
  }

  await appDb.galleryEntries.bulkPut(legacy.slice(0, MAX_GALLERY_ENTRIES));
  removeBrowserKey(COMFYUI_GALLERY_KEY);
}

async function loadRemainingGalleryEntries(): Promise<void> {
  if (!appDb || fullLoadPromise) {
    return fullLoadPromise ?? Promise.resolve();
  }

  fullLoadPromise = (async () => {
    try {
      const full = await appDb.galleryEntries.orderBy("queuedAt").reverse().toArray();
      if (full.length <= allEntries.length) {
        return;
      }
      allEntries = full;
      assignLegacyGalleryEntriesToActiveUser();
      refreshCacheFromAll();
      persistedFingerprints = new Map(
        allEntries.map((entry) => [entry.id, galleryEntryFingerprint(entry)]),
      );
      notifyGalleryUpdated();
    } catch {
      /* keep partial cache */
    }
  })();

  return fullLoadPromise;
}

function scheduleLoadRemainingGalleryEntries(): void {
  if (typeof window === "undefined") {
    return;
  }

  const run = () => {
    void loadRemainingGalleryEntries();
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
    return;
  }

  window.setTimeout(run, 250);
}

export async function hydrateGalleryStore(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  if (ready) {
    return;
  }

  if (readyPromise) {
    return readyPromise;
  }

  readyPromise = (async () => {
    if (!appDb) {
      if (allEntries.length === 0) {
        allEntries = readLegacyLocalStorageGallery().slice(0, MAX_GALLERY_ENTRIES);
      }
      assignLegacyGalleryEntriesToActiveUser();
      refreshCacheFromAll();
      ready = true;
      return;
    }

    try {
      await migrateGalleryFromLocalStorage();

      if (!cacheDirty) {
        allEntries = await appDb.galleryEntries
          .orderBy("queuedAt")
          .reverse()
          .limit(INITIAL_GALLERY_LOAD_LIMIT)
          .toArray();
        assignLegacyGalleryEntriesToActiveUser();
        refreshCacheFromAll();
        persistedFingerprints = new Map(
          allEntries.map((entry) => [entry.id, galleryEntryFingerprint(entry)]),
        );
        scheduleLoadRemainingGalleryEntries();
      } else {
        await persistGalleryCache();
      }
    } catch {
      if (allEntries.length === 0) {
        allEntries = readLegacyLocalStorageGallery().slice(0, MAX_GALLERY_ENTRIES);
        assignLegacyGalleryEntriesToActiveUser();
        refreshCacheFromAll();
      }
    }

    ready = true;
    notifyGalleryUpdated();
  })();

  return readyPromise;
}

export async function persistGalleryCache(): Promise<void> {
  const merged = mergeUserEntriesIntoAll(cache);
  allEntries = merged;
  refreshCacheFromAll();

  const db = appDb;
  if (!db) {
    writeLegacyLocalStorageGallery(allEntries);
    persistedFingerprints = new Map(
      allEntries.map((entry) => [entry.id, galleryEntryFingerprint(entry)]),
    );
    return;
  }

  try {
    const nextFingerprints = new Map<string, string>();
    const toPut: ComfyGalleryEntry[] = [];
    for (const entry of allEntries) {
      const fingerprint = galleryEntryFingerprint(entry);
      nextFingerprints.set(entry.id, fingerprint);
      if (persistedFingerprints.get(entry.id) !== fingerprint) {
        toPut.push(entry);
      }
    }

    const toDelete: string[] = [];
    for (const id of persistedFingerprints.keys()) {
      if (!nextFingerprints.has(id)) {
        toDelete.push(id);
      }
    }

    if (toPut.length > 0 || toDelete.length > 0) {
      await db.transaction("rw", db.galleryEntries, async () => {
        if (toDelete.length > 0) {
          await db.galleryEntries.bulkDelete(toDelete);
        }
        if (toPut.length > 0) {
          await db.galleryEntries.bulkPut(toPut);
        }
      });
    }

    persistedFingerprints = nextFingerprints;
    removeBrowserKey(COMFYUI_GALLERY_KEY);
  } catch {
    writeLegacyLocalStorageGallery(allEntries);
  }
}

export async function clearGalleryDb(): Promise<void> {
  if (isUserScoped()) {
    allEntries = allEntries.filter((entry) => entry.userId !== getActiveUserId());
    refreshCacheFromAll();
    cacheDirty = true;
    await persistGalleryCache();
    notifyGalleryUpdated();
    return;
  }

  allEntries = [];
  cache = [];
  cacheDirty = false;
  persistedFingerprints = new Map();
  removeBrowserKey(COMFYUI_GALLERY_KEY);

  if (appDb) {
    try {
      await appDb.galleryEntries.clear();
    } catch {
      /* ignore */
    }
  }
}
