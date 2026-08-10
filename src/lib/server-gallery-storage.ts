import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

const GALLERY_NAMESPACE = 'comfy-gallery' as const;

/**
 * Appends server-queued gallery entries to `PROMPT_DATA_DIR` storage so the
 * headless scheduled batch shows up once the browser gallery next pulls/merges
 * server storage. No-ops when server storage is disabled.
 */
export async function appendServerGalleryEntries(entries: ComfyGalleryEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  const { isServerStorageEnabled, readServerStorage, writeServerStorage } =
    await import('./server-storage');
  if (!isServerStorageEnabled()) {
    return;
  }
  const existing = readServerStorage<ComfyGalleryEntry[]>(GALLERY_NAMESPACE) ?? [];
  writeServerStorage(GALLERY_NAMESPACE, [...entries, ...existing]);
}

/** Removes server-stored gallery rows whose promptId is in the given set. */
export async function removeServerGalleryEntriesByPromptIds(promptIds: string[]): Promise<number> {
  if (promptIds.length === 0) {
    return 0;
  }
  const { isServerStorageEnabled, readServerStorage, writeServerStorage } =
    await import('./server-storage');
  if (!isServerStorageEnabled()) {
    return 0;
  }
  const idSet = new Set(promptIds.map(id => id.trim()).filter(Boolean));
  const existing = readServerStorage<ComfyGalleryEntry[]>(GALLERY_NAMESPACE) ?? [];
  const next = existing.filter(entry => !idSet.has(entry.promptId));
  writeServerStorage(GALLERY_NAMESPACE, next);
  return existing.length - next.length;
}
