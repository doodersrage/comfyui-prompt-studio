"use client";

import { loadComfyGallery, saveComfyGallery } from "./comfyui-gallery";
import {
  loadPromptHistoryStore,
  savePromptHistoryStore,
  type PromptHistoryEntry,
} from "./prompt-history";
import { upsertPromptProject } from "./prompt-projects";
import type { ProjectBundle } from "./project-bundle";

export function importProjectBundle(bundle: ProjectBundle): {
  historyAdded: number;
  galleryAdded: number;
} {
  upsertPromptProject(bundle.project);

  const history = loadPromptHistoryStore();
  const historyIds = new Set(history.map((entry) => entry.id));
  const historyAdded = bundle.history.filter((entry) => !historyIds.has(entry.id));
  const mergedHistory = [...historyAdded, ...history].slice(0, 100);
  savePromptHistoryStore(mergedHistory);

  const gallery = loadComfyGallery();
  const galleryIds = new Set(gallery.map((entry) => entry.id));
  const galleryAdded = bundle.gallery.filter((entry) => !galleryIds.has(entry.id));
  saveComfyGallery([...galleryAdded, ...gallery]);

  return {
    historyAdded: historyAdded.length,
    galleryAdded: galleryAdded.length,
  };
}
