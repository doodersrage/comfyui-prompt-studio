import type { SharedToolSettings } from "./settings-cache";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";

export const SCENE_PRESETS_KEY = "comfy-prompt-scene-presets-v1";

export type ScenePreset = {
  id: string;
  name: string;
  createdAt: number;
  hints?: string;
  sportPresetId?: string;
  tool?: string;
  sharedLocks?: Pick<
    SharedToolSettings,
    "lockedWardrobeId" | "lockedLocation" | "lockedVariationSeed"
  >;
};

export function loadScenePresets(): ScenePreset[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return readBrowserValue<ScenePreset[]>(SCENE_PRESETS_KEY) ?? [];
  } catch {
    return [];
  }
}

export function saveScenePresets(presets: ScenePreset[]): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserValue(SCENE_PRESETS_KEY, presets.slice(0, 40));
}

export function createScenePreset(input: Omit<ScenePreset, "id" | "createdAt">): ScenePreset {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
}

export function upsertScenePreset(preset: ScenePreset): void {
  const presets = loadScenePresets();
  const index = presets.findIndex((entry) => entry.id === preset.id);
  if (index >= 0) {
    presets[index] = preset;
  } else {
    presets.unshift(preset);
  }
  saveScenePresets(presets);
}

export function deleteScenePreset(id: string): void {
  saveScenePresets(loadScenePresets().filter((entry) => entry.id !== id));
}

export function applyScenePresetLocks(
  preset: ScenePreset,
): Partial<SharedToolSettings> {
  return {
    lockedWardrobeId: preset.sharedLocks?.lockedWardrobeId,
    lockedLocation: preset.sharedLocks?.lockedLocation,
    lockedVariationSeed: preset.sharedLocks?.lockedVariationSeed,
  };
}

export function buildScenePresetFromCurrent(input: {
  name: string;
  hints?: string;
  sportPresetId?: string;
  tool?: string;
  shared: SharedToolSettings;
}): ScenePreset {
  return createScenePreset({
    name: input.name.trim(),
    hints: input.hints?.trim() || undefined,
    sportPresetId: input.sportPresetId || undefined,
    tool: input.tool,
    sharedLocks: {
      lockedWardrobeId: input.shared.lockedWardrobeId,
      lockedLocation: input.shared.lockedLocation,
      lockedVariationSeed: input.shared.lockedVariationSeed,
    },
  });
}
