import { appDb } from "./app-db";
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from "./browser-storage";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
import {
  COMFYUI_GALLERY_KEY,
  COMFYUI_GALLERY_UPDATED_EVENT,
  MAX_GALLERY_ENTRIES,
} from "./comfyui-gallery-storage-meta";

let cache: ComfyGalleryEntry[] = [];
let cacheDirty = false;
let ready = false;
let readyPromise: Promise<void> | null = null;

export function isGalleryStoreReady(): boolean {
  return ready;
}

export function getGalleryCache(): ComfyGalleryEntry[] {
  return cache;
}

export function setGalleryCache(entries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  cache = entries.slice(0, MAX_GALLERY_ENTRIES);
  cacheDirty = true;
  return cache;
}

export function notifyGalleryUpdated(): void {
  window.dispatchEvent(new CustomEvent(COMFYUI_GALLERY_UPDATED_EVENT));
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
      if (cache.length === 0) {
        cache = readLegacyLocalStorageGallery().slice(0, MAX_GALLERY_ENTRIES);
      }
      ready = true;
      return;
    }

    try {
      await migrateGalleryFromLocalStorage();

      if (!cacheDirty) {
        cache = await appDb.galleryEntries.orderBy("queuedAt").reverse().toArray();
      } else {
        await persistGalleryCache();
      }
    } catch {
      if (cache.length === 0) {
        cache = readLegacyLocalStorageGallery().slice(0, MAX_GALLERY_ENTRIES);
      }
    }

    ready = true;
    notifyGalleryUpdated();
  })();

  return readyPromise;
}

export async function persistGalleryCache(): Promise<void> {
  const trimmed = cache.slice(0, MAX_GALLERY_ENTRIES);

  const db = appDb;
  if (!db) {
    writeLegacyLocalStorageGallery(trimmed);
    return;
  }

  try {
    await db.transaction("rw", db.galleryEntries, async () => {
      await db.galleryEntries.clear();
      if (trimmed.length > 0) {
        await db.galleryEntries.bulkPut(trimmed);
      }
    });
    removeBrowserKey(COMFYUI_GALLERY_KEY);
  } catch {
    writeLegacyLocalStorageGallery(trimmed);
  }
}

export async function clearGalleryDb(): Promise<void> {
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
