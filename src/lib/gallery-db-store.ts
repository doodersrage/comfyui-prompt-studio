import { appDb } from "./app-db";
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from "./browser-storage";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
import {
  COMFYUI_GALLERY_KEY,
  COMFYUI_GALLERY_UPDATED_EVENT,
  MAX_GALLERY_ENTRIES,
} from "./comfyui-gallery-storage-meta";
import { getActiveUserId, isUserScoped } from "./user-scope";

let allEntries: ComfyGalleryEntry[] = [];
let cache: ComfyGalleryEntry[] = [];
let cacheDirty = false;
let ready = false;
let readyPromise: Promise<void> | null = null;

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
  cacheDirty = true;
  await persistGalleryCache();
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

  const existingCount = await appDb.galleryEntries.count();
  if (existingCount > 0) {
    return;
  }

  const legacy = readLegacyLocalStorageGallery();
  if (legacy.length === 0) {
    return;
  }

  await appDb.galleryEntries.bulkPut(legacy.slice(0, MAX_GALLERY_ENTRIES));
  removeBrowserKey(COMFYUI_GALLERY_KEY);
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
        allEntries = await appDb.galleryEntries.orderBy("queuedAt").reverse().toArray();
        assignLegacyGalleryEntriesToActiveUser();
        refreshCacheFromAll();
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
    return;
  }

  try {
    await db.transaction("rw", db.galleryEntries, async () => {
      await db.galleryEntries.clear();
      if (allEntries.length > 0) {
        await db.galleryEntries.bulkPut(allEntries);
      }
    });
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
  removeBrowserKey(COMFYUI_GALLERY_KEY);

  if (appDb) {
    try {
      await appDb.galleryEntries.clear();
    } catch {
      /* ignore */
    }
  }
}
