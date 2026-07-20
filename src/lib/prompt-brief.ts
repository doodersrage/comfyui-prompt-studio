import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from "./settings-cache";
import { saveComfyUiSettings, loadComfyUiSettings } from "./comfyui-settings";
import { setActiveProjectId, loadActiveProjectId } from "./prompt-projects";
import { downloadTextFile } from "./history-export-formats";

export type PromptBrief = {
  version: 1;
  label: string;
  createdAt: number;
  hints: string;
  model: string;
  detailLevel: string;
  negativePrompt?: string;
  projectId?: string;
  characterDescriptor?: string;
  workflowFileId?: string;
  comfyUiUrl?: string;
  tool?: string;
  notes?: string;
};

export function buildPromptBriefFromCurrent(input: {
  label: string;
  hints: string;
  model?: string;
  detailLevel?: string;
  negativePrompt?: string;
  tool?: string;
  notes?: string;
}): PromptBrief {
  const cache = loadSettingsCache();
  const comfy = loadComfyUiSettings();
  return {
    version: 1,
    label: input.label.trim(),
    createdAt: Date.now(),
    hints: input.hints.trim(),
    model: input.model ?? cache.shared.model ?? "sdxl",
    detailLevel: input.detailLevel ?? cache.shared.detail ?? "balanced",
    negativePrompt: input.negativePrompt?.trim() || undefined,
    projectId: loadActiveProjectId(),
    characterDescriptor: cache.shared.activeCharacterDescriptor?.trim() || undefined,
    workflowFileId:
      cache.shared.selectedWorkflowFileId ?? cache.shared.selectedWorkflowPresetId,
    comfyUiUrl: comfy.apiUrl?.trim() || undefined,
    tool: input.tool,
    notes: input.notes?.trim() || undefined,
  };
}

export function applyPromptBrief(brief: PromptBrief): void {
  if (typeof window === "undefined") {
    return;
  }

  const cache = loadSettingsCache();
  saveSharedSettings({
    ...cache.shared,
    model: brief.model as SharedToolSettings["model"],
    detail: brief.detailLevel as SharedToolSettings["detail"],
    activeCharacterDescriptor: brief.characterDescriptor,
    selectedWorkflowFileId: brief.workflowFileId,
    selectedWorkflowPresetId: undefined,
  });

  if (brief.comfyUiUrl) {
    const comfy = loadComfyUiSettings();
    saveComfyUiSettings({ ...comfy, apiUrl: brief.comfyUiUrl });
  }

  if (brief.projectId) {
    setActiveProjectId(brief.projectId);
  }
}

export function downloadPromptBrief(brief: PromptBrief): void {
  const filename = `${brief.label.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 48) || "prompt-brief"}.json`;
  downloadTextFile(JSON.stringify(brief, null, 2), filename, "application/json");
}

export function parsePromptBriefFile(raw: string): PromptBrief {
  const parsed = JSON.parse(raw) as PromptBrief;
  if (!parsed || parsed.version !== 1 || !parsed.hints?.trim()) {
    throw new Error("Invalid prompt brief file.");
  }
  return parsed;
}
