"use client";

import { PROMPT_HISTORY_KEY, type PromptHistoryEntry } from "@/hooks/usePromptHistory";
import { loadComfyGallery, saveComfyGallery } from "./comfyui-gallery";
import { upsertPromptProject } from "./prompt-projects";
import type { ProjectBundle } from "./project-bundle";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";

export function importProjectBundle(bundle: ProjectBundle): {
  historyAdded: number;
  galleryAdded: number;
} {
  upsertPromptProject(bundle.project);

  let history = readBrowserValue<PromptHistoryEntry[]>(PROMPT_HISTORY_KEY) ?? [];
  const historyIds = new Set(history.map((entry) => entry.id));
  const historyAdded = bundle.history.filter((entry) => !historyIds.has(entry.id));
  const mergedHistory = [...historyAdded, ...history].slice(0, 100);
  writeBrowserValue(PROMPT_HISTORY_KEY, mergedHistory);

  const gallery = loadComfyGallery();
  const galleryIds = new Set(gallery.map((entry) => entry.id));
  const galleryAdded = bundle.gallery.filter((entry) => !galleryIds.has(entry.id));
  saveComfyGallery([...galleryAdded, ...gallery]);

  return {
    historyAdded: historyAdded.length,
    galleryAdded: galleryAdded.length,
  };
}
