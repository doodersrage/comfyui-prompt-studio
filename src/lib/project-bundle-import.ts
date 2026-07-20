"use client";

import { PROMPT_HISTORY_KEY, type PromptHistoryEntry } from "@/hooks/usePromptHistory";
import { loadComfyGallery, saveComfyGallery } from "./comfyui-gallery";
import { upsertPromptProject } from "./prompt-projects";
import type { ProjectBundle } from "./project-bundle";

export function importProjectBundle(bundle: ProjectBundle): {
  historyAdded: number;
  galleryAdded: number;
} {
  upsertPromptProject(bundle.project);

  let history: PromptHistoryEntry[] = [];
  try {
    const raw = window.localStorage.getItem(PROMPT_HISTORY_KEY);
    history = raw ? (JSON.parse(raw) as PromptHistoryEntry[]) : [];
  } catch {
    history = [];
  }
  const historyIds = new Set(history.map((entry) => entry.id));
  const historyAdded = bundle.history.filter((entry) => !historyIds.has(entry.id));
  const mergedHistory = [...historyAdded, ...history].slice(0, 100);
  window.localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(mergedHistory));

  const gallery = loadComfyGallery();
  const galleryIds = new Set(gallery.map((entry) => entry.id));
  const galleryAdded = bundle.gallery.filter((entry) => !galleryIds.has(entry.id));
  saveComfyGallery([...galleryAdded, ...gallery]);

  return {
    historyAdded: historyAdded.length,
    galleryAdded: galleryAdded.length,
  };
}
