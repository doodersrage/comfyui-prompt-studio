import { appDb } from "./app-db";
import { COMFYUI_GALLERY_KEY } from "./comfyui-gallery-storage-meta";

const cache = new Map<string, unknown>();
const dirtyKeys = new Set<string>();
let ready = false;
let readyPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let flushListenersAttached = false;
const PERSIST_DEBOUNCE_MS = 350;
/** Keys that FOUC / pre-paint scripts read from localStorage — keep sync. */
const SYNC_LOCALSTORAGE_KEYS = new Set([
  "comfy-app-theme-v1",
  "comfy-ambient-intensity-v1",
]);

function readLegacyLocalStorageValue(key: string): unknown | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function writeLegacyLocalStorageValue(key: string, value: unknown): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  } catch {
    // ignore quota / privacy mode
  }
}

function removeLegacyLocalStorageValue(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(key);
}

export function isBrowserStorageReady(): boolean {
  return ready;
}

export function resetBrowserStorageCache(): void {
  cache.clear();
  dirtyKeys.clear();
  ready = false;
  readyPromise = null;
}

export function readBrowserValue<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (cache.has(key)) {
    return cache.get(key) as T;
  }

  const legacy = readLegacyLocalStorageValue(key);
  if (legacy !== undefined) {
    cache.set(key, legacy);
    return legacy as T;
  }

  return null;
}

export function readBrowserString(key: string): string | null {
  const value = readBrowserValue<unknown>(key);
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return null;
  }
  return String(value);
}

export function writeBrowserValue(key: string, value: unknown): void {
  if (typeof window === "undefined") {
    return;
  }

  cache.set(key, value);
  dirtyKeys.add(key);
  // Theme/ambient must hit localStorage immediately for the pre-paint script.
  if (SYNC_LOCALSTORAGE_KEYS.has(key)) {
    writeLegacyLocalStorageValue(key, value);
  }
  schedulePersistDirtyKeys();
}

export function writeBrowserString(key: string, value: string): void {
  writeBrowserValue(key, value);
}

export function removeBrowserKey(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  cache.delete(key);
  dirtyKeys.add(key);
  removeLegacyLocalStorageValue(key);
  schedulePersistDirtyKeys();
}

function schedulePersistDirtyKeys(): void {
  attachBrowserStorageFlushListeners();
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void initBrowserStorage().then(() => persistDirtyBrowserKeys());
  }, PERSIST_DEBOUNCE_MS);
}

export function flushBrowserStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  void initBrowserStorage().then(() => persistDirtyBrowserKeys());
}

function attachBrowserStorageFlushListeners(): void {
  if (typeof window === "undefined" || flushListenersAttached) {
    return;
  }
  if (typeof window.addEventListener !== "function") {
    return;
  }
  flushListenersAttached = true;
  const flush = () => {
    flushBrowserStorage();
  };
  window.addEventListener("pagehide", flush);
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    });
  }
}

async function persistBrowserKey(key: string): Promise<void> {
  const db = appDb;
  if (!db) {
    const value = cache.get(key);
    if (value === undefined) {
      removeLegacyLocalStorageValue(key);
      return;
    }
    writeLegacyLocalStorageValue(key, value);
    return;
  }

  try {
    if (!cache.has(key)) {
      await db.kv.delete(key);
      removeLegacyLocalStorageValue(key);
      return;
    }

    await db.kv.put({ key, value: cache.get(key) });
    // Mirror to localStorage after debounced persist (theme/ambient already synced).
    const value = cache.get(key);
    if (value !== undefined) {
      writeLegacyLocalStorageValue(key, value);
    }
  } catch {
    const value = cache.get(key);
    if (value !== undefined) {
      writeLegacyLocalStorageValue(key, value);
    }
  }
}

async function persistDirtyBrowserKeys(): Promise<void> {
  const keys = [...dirtyKeys];
  dirtyKeys.clear();
  await Promise.all(keys.map((key) => persistBrowserKey(key)));
}

async function migrateLocalStorageToBrowserDb(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const keysToMigrate: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || key === COMFYUI_GALLERY_KEY || cache.has(key)) {
      continue;
    }
    keysToMigrate.push(key);
  }

  for (const key of keysToMigrate) {
    const legacy = readLegacyLocalStorageValue(key);
    if (legacy === undefined) {
      continue;
    }
    cache.set(key, legacy);
    dirtyKeys.add(key);
    removeLegacyLocalStorageValue(key);
  }

  await persistDirtyBrowserKeys();
}

export async function initBrowserStorage(): Promise<void> {
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
    const db = appDb;
    if (!db) {
      ready = true;
      return;
    }

    try {
      const records = await db.kv.toArray();
      for (const record of records) {
        cache.set(record.key, record.value);
      }
      await migrateLocalStorageToBrowserDb();
    } catch {
      // IndexedDB unavailable — cache continues to use legacy localStorage reads.
    }

    ready = true;
  })();

  return readyPromise;
}

export async function clearBrowserKvStore(): Promise<void> {
  cache.clear();
  dirtyKeys.clear();

  if (typeof window === "undefined") {
    return;
  }

  if (appDb) {
    try {
      await appDb.kv.clear();
    } catch {
      /* ignore */
    }
  }
}
