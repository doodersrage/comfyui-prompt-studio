export type ComfyUiSettingsSectionId =
  | "presets"
  | "workflow-map"
  | "workflow-patching"
  | "lora-library"
  | "lora-train"
  | "workflow-library"
  | "connection"
  | "auto-improve"
  | "queue-params"
  | "prompt-quality"
  | "vram-guard"
  | "hold-max"
  | "sampler-memory";

export type ComfyUiSettingsSection = {
  id: ComfyUiSettingsSectionId;
  label: string;
  keywords: string[];
};

export const COMFYUI_SETTINGS_SECTIONS: ComfyUiSettingsSection[] = [
  {
    id: "presets",
    label: "Browser presets",
    keywords: ["iterate", "keeper", "lab", "preset", "profile"],
  },
  {
    id: "workflow-map",
    label: "Workflow map",
    keywords: ["model", "workflow", "map", "assignment"],
  },
  {
    id: "workflow-patching",
    label: "Patching & maps",
    keywords: ["checkpoint", "vae", "refiner", "upscale", "controlnet", "patch"],
  },
  {
    id: "workflow-library",
    label: "Workflow library",
    keywords: ["library", "import", "health", "diff"],
  },
  {
    id: "lora-library",
    label: "LoRA library",
    keywords: ["lora", "trigger", "auto", "stack", "lightx2v"],
  },
  {
    id: "lora-train",
    label: "LoRA train",
    keywords: ["lora", "train", "kohya", "dataset", "trigger", "trainer"],
  },
  {
    id: "connection",
    label: "Connection",
    keywords: ["url", "token", "injection", "placeholder", "workflow json"],
  },
  {
    id: "auto-improve",
    label: "Auto-improve",
    keywords: ["rating", "requeue", "mutate", "seed", "calm", "aggressive"],
  },
  {
    id: "queue-params",
    label: "Queue parameters",
    keywords: ["steps", "cfg", "sampler", "seed", "params"],
  },
  {
    id: "prompt-quality",
    label: "Prompt quality",
    keywords: ["detail", "realism", "anatomy", "quality", "orientation", "sampler preset"],
  },
  {
    id: "vram-guard",
    label: "VRAM guard",
    keywords: ["vram", "max", "downgrade", "memory", "gpu"],
  },
  {
    id: "hold-max",
    label: "Hold Max",
    keywords: ["hold", "idle", "orchestration", "max"],
  },
  {
    id: "sampler-memory",
    label: "Sampler memory",
    keywords: ["remember", "cfg", "steps", "learned"],
  },
];

export function settingsComfyUiSectionHref(section: ComfyUiSettingsSectionId): string {
  return `/settings?tab=comfyui&section=${section}`;
}

export function normalizeComfyUiSettingsSection(
  value: string | null | undefined,
): ComfyUiSettingsSectionId | null {
  if (!value) {
    return null;
  }
  return COMFYUI_SETTINGS_SECTIONS.some((section) => section.id === value)
    ? (value as ComfyUiSettingsSectionId)
    : null;
}

export function filterComfyUiSettingsSections(
  query: string,
): ComfyUiSettingsSection[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return COMFYUI_SETTINGS_SECTIONS;
  }
  return COMFYUI_SETTINGS_SECTIONS.filter((section) => {
    const haystack = [section.label, section.id, ...section.keywords]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}
