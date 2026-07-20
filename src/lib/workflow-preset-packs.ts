import type { ComfyWorkflowPreset } from "./comfyui-workflow-presets";

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
