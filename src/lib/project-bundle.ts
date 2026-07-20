import type { ComfyGalleryEntry } from "./comfyui-gallery";
import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";
import type { PromptProject } from "./prompt-projects";
import type { ScenePreset } from "./scene-presets";

export type ProjectBundle = {
  version: 1;
  exportedAt: string;
  project: PromptProject;
  history: PromptHistoryEntry[];
  gallery: ComfyGalleryEntry[];
  scenePresets: ScenePreset[];
};

export function buildProjectBundle(input: {
  project: PromptProject;
  history: PromptHistoryEntry[];
  gallery: ComfyGalleryEntry[];
  scenePresets: ScenePreset[];
}): ProjectBundle {
  const projectId = input.project.id;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    project: input.project,
    history: input.history.filter((entry) => entry.metadata?.projectId === projectId),
    gallery: input.gallery.filter((entry) => entry.projectId === projectId),
    scenePresets: [],
  };
}

export function exportProjectBundleJson(bundle: ProjectBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseProjectBundle(raw: string): ProjectBundle {
  const parsed = JSON.parse(raw) as ProjectBundle;
  if (parsed.version !== 1 || !parsed.project?.id) {
    throw new Error("Invalid project bundle JSON.");
  }
  return parsed;
}
