import {
  loadComfyWorkflowPresets,
  type ComfyWorkflowPreset,
} from "./comfyui-workflow-presets";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";

export const COMFY_WORKFLOW_FILES_KEY = "comfyui-workflow-files-v1";

export type ComfyWorkflowFile = {
  id: string;
  name: string;
  filename?: string;
  workflowJson: string;
  createdAt: number;
};

function migratePresetsToFilesIfEmpty(): void {
  const existing = loadComfyWorkflowFilesRaw();
  if (existing.length > 0) {
    return;
  }

  const presets = loadComfyWorkflowPresets();
  if (presets.length === 0) {
    return;
  }

  saveComfyWorkflowFilesRaw(
    presets.map((preset) => presetToWorkflowFile(preset)),
  );
}

function loadComfyWorkflowFilesRaw(): ComfyWorkflowFile[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return readBrowserValue<ComfyWorkflowFile[]>(COMFY_WORKFLOW_FILES_KEY) ?? [];
  } catch {
    return [];
  }
}

function saveComfyWorkflowFilesRaw(files: ComfyWorkflowFile[]): void {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserValue(COMFY_WORKFLOW_FILES_KEY, files.slice(0, 32));
}

function presetToWorkflowFile(preset: ComfyWorkflowPreset): ComfyWorkflowFile {
  return {
    id: preset.id,
    name: preset.name,
    workflowJson: preset.workflowJson,
    createdAt: preset.createdAt,
  };
}

export function loadComfyWorkflowFiles(): ComfyWorkflowFile[] {
  migratePresetsToFilesIfEmpty();
  return loadComfyWorkflowFilesRaw();
}

export function saveComfyWorkflowFiles(files: ComfyWorkflowFile[]): void {
  saveComfyWorkflowFilesRaw(files);
}

export function findComfyWorkflowFile(id: string): ComfyWorkflowFile | undefined {
  return loadComfyWorkflowFiles().find((entry) => entry.id === id);
}

export function upsertComfyWorkflowFile(
  file: Omit<ComfyWorkflowFile, "id" | "createdAt"> & {
    id?: string;
    createdAt?: number;
  },
): ComfyWorkflowFile {
  const next: ComfyWorkflowFile = {
    id: file.id ?? crypto.randomUUID(),
    createdAt: file.createdAt ?? Date.now(),
    name: file.name.trim(),
    filename: file.filename?.trim() || undefined,
    workflowJson: file.workflowJson.trim(),
  };

  const files = loadComfyWorkflowFiles();
  const index = files.findIndex((entry) => entry.id === next.id);
  if (index >= 0) {
    files[index] = next;
  } else {
    files.unshift(next);
  }

  saveComfyWorkflowFiles(files.slice(0, 32));
  return next;
}

export function deleteComfyWorkflowFile(id: string): void {
  saveComfyWorkflowFiles(
    loadComfyWorkflowFiles().filter((entry) => entry.id !== id),
  );
}

export function workflowFileNameFromPath(filename: string): string {
  return filename.replace(/\.api\.json$/i, "").replace(/\.json$/i, "") || filename;
}

/** User-facing label — prefers the saved display name over the import filename. */
export function workflowFileDisplayName(
  file: Pick<ComfyWorkflowFile, "name" | "filename">,
): string {
  const name = file.name.trim();
  if (name) {
    return name;
  }
  return file.filename?.trim() || "Workflow";
}

/** Original import filename when it differs from the display name. */
export function workflowFileSourceFilename(
  file: Pick<ComfyWorkflowFile, "name" | "filename">,
): string | undefined {
  const filename = file.filename?.trim();
  const name = file.name.trim();
  if (!filename || filename === name) {
    return undefined;
  }
  return filename;
}
