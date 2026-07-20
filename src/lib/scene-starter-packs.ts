import type { UserSceneStarterPreset } from "./user-scene-starter-presets";

export type SceneStarterPack = {
  version: 1;
  exportedAt: string;
  name: string;
  description?: string;
  presets: UserSceneStarterPreset[];
};

export function buildSceneStarterPack(input: {
  name: string;
  description?: string;
  presets: UserSceneStarterPreset[];
}): SceneStarterPack {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    presets: input.presets,
  };
}

export function parseSceneStarterPack(raw: string): SceneStarterPack {
  const parsed = JSON.parse(raw) as SceneStarterPack;
  if (
    !parsed ||
    parsed.version !== 1 ||
    !parsed.name?.trim() ||
    !Array.isArray(parsed.presets)
  ) {
    throw new Error("Invalid scene starter pack file.");
  }
  return parsed;
}

export function downloadSceneStarterPack(pack: SceneStarterPack): void {
  const payload = JSON.stringify(pack, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `scene-starter-pack-${pack.name.replace(/\s+/g, "-").slice(0, 40)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
