import type { ScenePreset } from './scene-presets';

export type PresetPack = {
  version: 1;
  exportedAt: string;
  name: string;
  description?: string;
  presets: ScenePreset[];
};

export function buildPresetPack(input: {
  name: string;
  description?: string;
  presets: ScenePreset[];
}): PresetPack {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    presets: input.presets,
  };
}

export function parsePresetPack(raw: string): PresetPack {
  const parsed = JSON.parse(raw) as PresetPack;
  if (!parsed || parsed.version !== 1 || !parsed.name?.trim() || !Array.isArray(parsed.presets)) {
    throw new Error('Invalid preset pack file.');
  }
  return parsed;
}

export function downloadPresetPack(pack: PresetPack): void {
  const payload = JSON.stringify(pack, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `preset-pack-${pack.name.replace(/\s+/g, '-').slice(0, 40)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
