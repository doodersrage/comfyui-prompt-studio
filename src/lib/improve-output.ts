"use client";

import {
  buildGalleryHandoff,
  galleryHandoffPath,
  galleryImprovePath,
  galleryPromptEditorPathFromHistory,
  IMPROVE_INTENT_DEFAULT,
  saveGalleryHandoff,
  type GalleryHandoffPayload,
} from "./gallery-handoff";
import { setLineageParent } from "./prompt-lineage-session";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

export function startImproveFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
  parentHistoryId?: string;
}): void {
  const payload: GalleryHandoffPayload = {
    source: "gallery",
    galleryEntryId: "result-panel",
    promptId: "result-panel",
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    model: input.model,
    tool: input.tool,
    imageUrl: input.previewUrl ?? undefined,
    target: "refine",
    improveIntent: IMPROVE_INTENT_DEFAULT,
    savedAt: Date.now(),
  };
  if (input.parentHistoryId) {
    setLineageParent({
      parentHistoryId: input.parentHistoryId,
      sourcePrompt: input.prompt,
      sourceTool: input.tool,
    });
  }
  saveGalleryHandoff(payload);
  window.location.href = galleryImprovePath();
}

export function startRefineFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
}): void {
  saveGalleryHandoff({
    source: "gallery",
    galleryEntryId: "result-panel",
    promptId: "result-panel",
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    model: input.model,
    tool: input.tool,
    imageUrl: input.previewUrl ?? undefined,
    target: "refine",
    savedAt: Date.now(),
  });
  window.location.href = galleryHandoffPath("refine");
}
export function startRefineFromHistoryEntry(entry: {
  id: string;
  prompt: string;
  model?: string;
  tool?: string;
  hints?: string;
}): void {
  saveGalleryHandoff({
    source: "history",
    galleryEntryId: entry.id,
    promptId: entry.id,
    prompt: entry.prompt,
    model: entry.model,
    tool: entry.tool,
    historyId: entry.id,
    target: "refine",
    savedAt: Date.now(),
  });
  setLineageParent({
    parentHistoryId: entry.id,
    sourcePrompt: entry.prompt,
    sourceTool: entry.tool,
  });
  window.location.href = galleryHandoffPath("refine");
}
export function startImproveFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: { intent?: string },
): void {
  saveGalleryHandoff({
    ...buildGalleryHandoff(entry, "refine"),
    improveIntent: options?.intent?.trim() || IMPROVE_INTENT_DEFAULT,
  });
  window.location.href = galleryImprovePath();
}

export function startPromptEditorFromResult(input: {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
  hints?: string;
  previewUrl?: string | null;
}): void {
  saveGalleryHandoff({
    source: "gallery",
    galleryEntryId: "result-panel",
    promptId: "result-panel",
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    hints: input.hints,
    model: input.model,
    tool: input.tool,
    imageUrl: input.previewUrl ?? undefined,
    target: "promptEditor",
    savedAt: Date.now(),
  });
  window.location.href = galleryHandoffPath("promptEditor");
}

export function startPromptEditorFromHistoryEntry(entry: {
  id: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
  hints?: string;
}): void {
  saveGalleryHandoff({
    source: "history",
    galleryEntryId: entry.id,
    promptId: entry.id,
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    hints: entry.hints,
    model: entry.model,
    tool: entry.tool,
    historyId: entry.id,
    target: "promptEditor",
    savedAt: Date.now(),
  });
  window.location.href = galleryPromptEditorPathFromHistory();
}

export function startPromptEditorFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, "promptEditor"));
  window.location.href = galleryHandoffPath("promptEditor");
}
