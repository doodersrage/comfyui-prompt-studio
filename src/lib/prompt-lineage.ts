import { loadPromptHistoryStore, savePromptHistoryStore, type PromptHistoryEntry } from "./prompt-history";
import {
  loadComfyGallery,
  updateComfyGalleryByPromptId,
  updateComfyGalleryEntryById,
  type ComfyGalleryEntry,
} from "./comfyui-gallery";

export function linkGalleryToHistory(
  promptId: string,
  historyId: string,
): ComfyGalleryEntry | null {
  return updateComfyGalleryByPromptId(promptId, { historyId });
}

export function linkGalleryEntryToHistory(
  galleryEntryId: string,
  historyId: string,
): ComfyGalleryEntry | null {
  return updateComfyGalleryEntryById(galleryEntryId, { historyId });
}

export function attachGalleryPromptIdToHistory(
  historyId: string,
  promptId: string,
  galleryEntryId?: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const entries = loadPromptHistoryStore();
    if (entries.length === 0) {
      return;
    }
    const next = entries.map((entry) =>
      entry.id === historyId
        ? {
            ...entry,
            metadata: {
              ...(entry.metadata ?? {}),
              comfyPromptId: promptId,
              galleryEntryId,
            },
          }
        : entry,
    );
    savePromptHistoryStore(next.slice(0, 100));
  } catch {
    // ignore
  }
}

export function findGalleryEntriesForHistory(
  historyId: string,
): ComfyGalleryEntry[] {
  return loadComfyGallery().filter((entry) => entry.historyId === historyId);
}

/** Best gallery entry to recover queue params and source/mask URLs for a history re-queue. */
export function findGalleryEntryForHistory(
  input: {
    id: string;
    metadata?: Record<string, unknown>;
  },
  gallery: ComfyGalleryEntry[] = loadComfyGallery(),
): ComfyGalleryEntry | undefined {
  const galleryEntryId =
    typeof input.metadata?.galleryEntryId === "string"
      ? input.metadata.galleryEntryId.trim()
      : "";
  if (galleryEntryId) {
    const byId = gallery.find((entry) => entry.id === galleryEntryId);
    if (byId) {
      return byId;
    }
  }

  const comfyPromptId =
    typeof input.metadata?.comfyPromptId === "string"
      ? input.metadata.comfyPromptId.trim()
      : "";
  if (comfyPromptId) {
    const byPromptId = gallery.find((entry) => entry.promptId === comfyPromptId);
    if (byPromptId) {
      return byPromptId;
    }
  }

  return gallery.find((entry) => entry.historyId === input.id);
}

export function findHistoryIdForGalleryEntry(
  entry: ComfyGalleryEntry,
): string | undefined {
  return entry.historyId;
}

export function studioHistoryUrl(historyId: string): string {
  return `/studio?history=${encodeURIComponent(historyId)}`;
}
