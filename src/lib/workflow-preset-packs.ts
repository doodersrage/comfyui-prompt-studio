import type { ComfyWorkflowPreset } from "./comfyui-workflow-presets";
import { upsertComfyWorkflowFile } from "./comfyui-workflow-files";

export const WORKFLOW_PRESET_PACKS_KEY = "comfyui-workflow-preset-packs-v1";

export type WorkflowPresetPack = {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: number;
  presets: ComfyWorkflowPreset[];
};

export function loadWorkflowPresetPacks(): WorkflowPresetPack[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(WORKFLOW_PRESET_PACKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WorkflowPresetPack[];
  } catch {
    return [];
  }
}

export function saveWorkflowPresetPacks(packs: WorkflowPresetPack[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKFLOW_PRESET_PACKS_KEY, JSON.stringify(packs));
}

export function exportWorkflowPresetPack(pack: WorkflowPresetPack): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      pack,
    },
    null,
    2,
  );
}

export function importWorkflowPresetPack(raw: string): WorkflowPresetPack {
  const parsed = JSON.parse(raw) as { pack?: WorkflowPresetPack } | WorkflowPresetPack;
  const pack = "pack" in parsed && parsed.pack ? parsed.pack : (parsed as WorkflowPresetPack);
  if (!pack?.name || !Array.isArray(pack.presets)) {
    throw new Error("Invalid workflow preset pack JSON.");
  }
  return {
    ...pack,
    id: pack.id || crypto.randomUUID(),
    createdAt: pack.createdAt || Date.now(),
    tags: pack.tags ?? [],
  };
}

export function upsertWorkflowPresetPack(pack: WorkflowPresetPack): void {
  const packs = loadWorkflowPresetPacks();
  const index = packs.findIndex((entry) => entry.id === pack.id);
  if (index >= 0) {
    packs[index] = pack;
  } else {
    packs.unshift(pack);
  }
  saveWorkflowPresetPacks(packs);
}

export function workflowFileToPreset(input: {
  id?: string;
  name: string;
  workflowJson: string;
  createdAt?: number;
}): ComfyWorkflowPreset {
  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    createdAt: input.createdAt ?? Date.now(),
    workflowJson: input.workflowJson,
  };
}

export function addPresetsToPack(packId: string, presets: ComfyWorkflowPreset[]): WorkflowPresetPack | null {
  const packs = loadWorkflowPresetPacks();
  const index = packs.findIndex((entry) => entry.id === packId);
  if (index < 0) {
    return null;
  }
  const existingIds = new Set(packs[index].presets.map((preset) => preset.id));
  const merged = [...packs[index].presets];
  for (const preset of presets) {
    if (!existingIds.has(preset.id)) {
      merged.push(preset);
      existingIds.add(preset.id);
    }
  }
  packs[index] = { ...packs[index], presets: merged };
  saveWorkflowPresetPacks(packs);
  return packs[index];
}

export function applyWorkflowPresetPackToLibrary(pack: WorkflowPresetPack): number {
  if (typeof window === "undefined") {
    return 0;
  }
  let count = 0;
  for (const preset of pack.presets) {
    upsertComfyWorkflowFile({
      id: preset.id,
      name: preset.name,
      workflowJson: preset.workflowJson,
      createdAt: preset.createdAt,
    });
    count += 1;
  }
  return count;
}
