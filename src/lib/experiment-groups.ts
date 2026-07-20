import type { ComfyGalleryEntry } from "./comfyui-gallery";

export type ExperimentGroup = {
  id: string;
  label: string;
  parentPrompt: string;
  entries: ComfyGalleryEntry[];
  variants: {
    seeds: string[];
    cfgValues: string[];
    stepValues: string[];
  };
};

function normalizePromptKey(prompt: string): string {
  return prompt.trim().toLowerCase().slice(0, 120);
}

export function groupGalleryExperiments(entries: ComfyGalleryEntry[]): ExperimentGroup[] {
  const map = new Map<string, ExperimentGroup>();

  for (const entry of entries) {
    const key = normalizePromptKey(entry.prompt);
    if (!key) continue;

    const existing = map.get(key);
    const seed = entry.queueParams?.seed != null ? String(entry.queueParams.seed) : undefined;
    const cfg = entry.queueParams?.cfg != null ? String(entry.queueParams.cfg) : undefined;
    const steps = entry.queueParams?.steps != null ? String(entry.queueParams.steps) : undefined;

    if (!existing) {
      map.set(key, {
        id: key.slice(0, 32),
        label: entry.prompt.slice(0, 80),
        parentPrompt: entry.prompt,
        entries: [entry],
        variants: {
          seeds: seed ? [seed] : [],
          cfgValues: cfg ? [cfg] : [],
          stepValues: steps ? [steps] : [],
        },
      });
      continue;
    }

    existing.entries.push(entry);
    if (seed && !existing.variants.seeds.includes(seed)) {
      existing.variants.seeds.push(seed);
    }
    if (cfg && !existing.variants.cfgValues.includes(cfg)) {
      existing.variants.cfgValues.push(cfg);
    }
    if (steps && !existing.variants.stepValues.includes(steps)) {
      existing.variants.stepValues.push(steps);
    }
  }

  return [...map.values()]
    .filter((group) => group.entries.length >= 2 || group.variants.seeds.length >= 2)
    .sort((a, b) => b.entries.length - a.entries.length);
}
