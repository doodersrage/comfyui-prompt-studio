import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";
import { PROMPT_HISTORY_KEY } from "@/hooks/usePromptHistory";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";
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
    const entries = readBrowserValue<PromptHistoryEntry[]>(PROMPT_HISTORY_KEY);
    if (!entries) {
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
    writeBrowserValue(PROMPT_HISTORY_KEY, next.slice(0, 100));
  } catch {
    // ignore
  }
}

export function findGalleryEntriesForHistory(
  historyId: string,
): ComfyGalleryEntry[] {
  return loadComfyGallery().filter((entry) => entry.historyId === historyId);
}

export function findHistoryIdForGalleryEntry(
  entry: ComfyGalleryEntry,
): string | undefined {
  return entry.historyId;
}

export function studioHistoryUrl(historyId: string): string {
  return `/studio?history=${encodeURIComponent(historyId)}`;
}
