import {
  comfyUiSettingsToRuntime,
  loadComfyUiSettings,
  type ComfyUiSettings,
} from "./comfyui-settings";
import {
  stripEmptyComfyUiRuntime,
  type ComfyUiRuntimeConfig,
} from "./comfyui-config";
import {
  findComfyWorkflowFile,
} from "./comfyui-workflow-files";
import { loadSettingsCache, saveSharedSettings } from "./settings-cache";

const SERVER_WORKFLOW_PREFIX = "server:";

export function getSelectedWorkflowFileId(): string | undefined {
  const shared = loadSettingsCache().shared;
  return shared.selectedWorkflowFileId ?? shared.selectedWorkflowPresetId;
}

export function resolveSelectedWorkflowRuntime(
  fileId?: string | null,
): ComfyUiRuntimeConfig | undefined {
  const settings = loadComfyUiSettings();
  const id = fileId === undefined ? getSelectedWorkflowFileId() : fileId;
  const baseRuntime = comfyUiSettingsToRuntime(settings);

  if (!id) {
    return baseRuntime;
  }

  if (id.startsWith(SERVER_WORKFLOW_PREFIX)) {
    return stripEmptyComfyUiRuntime({
      ...(baseRuntime ?? {}),
      workflowFileId: id.slice(SERVER_WORKFLOW_PREFIX.length),
    });
  }

  const file = findComfyWorkflowFile(id);
  if (!file) {
    return baseRuntime;
  }

  return stripEmptyComfyUiRuntime({
    ...(baseRuntime ?? {}),
    workflowJson: file.workflowJson,
    workflowOptimizedHash: file.lastOptimizedHash,
  });
}

/** @deprecated Use resolveSelectedWorkflowRuntime */
export function resolveComfyUiRuntime(fileId?: string | null) {
  return resolveSelectedWorkflowRuntime(fileId);
}

export function clearSelectedWorkflowFileIfDeleted(deletedId: string): void {
  const cache = loadSettingsCache();
  const selected =
    cache.shared.selectedWorkflowFileId ?? cache.shared.selectedWorkflowPresetId;
  if (selected === deletedId) {
    saveSharedSettings({
      ...cache.shared,
      selectedWorkflowFileId: undefined,
      selectedWorkflowPresetId: undefined,
    });
  }
}

export function setSelectedWorkflowFileId(fileId: string | undefined): void {
  const cache = loadSettingsCache();
  saveSharedSettings({
    ...cache.shared,
    selectedWorkflowFileId: fileId,
    selectedWorkflowPresetId: undefined,
  });
}

/** @deprecated Use clearSelectedWorkflowFileIfDeleted */
export function clearSelectedWorkflowPresetIfDeleted(deletedId: string): void {
  clearSelectedWorkflowFileIfDeleted(deletedId);
}

/** @deprecated Use setSelectedWorkflowFileId */
export function setSelectedWorkflowPresetId(fileId: string | undefined): void {
  setSelectedWorkflowFileId(fileId);
}

/** @deprecated Use getSelectedWorkflowFileId */
export function getSelectedWorkflowPresetId(): string | undefined {
  return getSelectedWorkflowFileId();
}

/** @deprecated Presets are now workflow files; kept for backup import compatibility. */
export function effectiveComfyUiSettings(
  _presetId?: string | null,
): ComfyUiSettings {
  return loadComfyUiSettings();
}

/** @deprecated Presets are now workflow files. */
export function mergeWorkflowPreset(
  settings: ComfyUiSettings,
  _preset: unknown,
): ComfyUiSettings {
  return settings;
}

export { SERVER_WORKFLOW_PREFIX };
