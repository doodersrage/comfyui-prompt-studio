export type ComfyUiSettingsSectionId =
  | 'presets'
  | 'workflow-map'
  | 'model-assets'
  | 'workflow-patching'
  | 'lora-library'
  | 'lora-train'
  | 'workflow-library'
  | 'connection'
  | 'inference-engine'
  | 'auto-improve'
  | 'queue-params'
  | 'prompt-quality'
  | 'vram-guard'
  | 'hold-max'
  | 'sampler-memory';

export type ComfyUiSettingsSection = {
  id: ComfyUiSettingsSectionId;
  label: string;
  keywords: string[];
};

export const COMFYUI_SETTINGS_SECTIONS: ComfyUiSettingsSection[] = [
  {
    id: 'inference-engine',
    label: 'Inference engine',
    keywords: [
      'diffusers',
      'engine',
      'comfyui',
      'backend',
      'txt2img',
      'fal',
      'replicate',
      'openai',
      'chatgpt',
      'gemini',
      'grok',
      'cloud',
    ],
  },
  {
    id: 'presets',
    label: 'Browser presets',
    keywords: ['iterate', 'keeper', 'lab', 'preset', 'profile'],
  },
  {
    id: 'workflow-map',
    label: 'Workflow map',
    keywords: ['model', 'workflow', 'map', 'assignment'],
  },
  {
    id: 'model-assets',
    label: 'Model assets',
    keywords: [
      'download',
      'checkpoint',
      'unet',
      'vae',
      'lora',
      'upscale',
      'clip',
      'text encoder',
      'controlnet',
      'install',
      'huggingface',
      'weights',
      'comfyui_root',
    ],
  },
  {
    id: 'workflow-patching',
    label: 'Patching & maps',
    keywords: ['checkpoint', 'vae', 'refiner', 'upscale', 'controlnet', 'patch'],
  },
  {
    id: 'workflow-library',
    label: 'Workflow library',
    keywords: ['library', 'import', 'health', 'diff'],
  },
  {
    id: 'lora-library',
    label: 'LoRA library',
    keywords: ['lora', 'trigger', 'auto', 'stack', 'lightx2v', 'civitai', 'search', 'download'],
  },
  {
    id: 'lora-train',
    label: 'LoRA train',
    keywords: ['lora', 'train', 'kohya', 'dataset', 'trigger', 'trainer', 'trainer_url'],
  },
  {
    id: 'connection',
    label: 'Connection',
    keywords: [
      'url',
      'token',
      'injection',
      'placeholder',
      'workflow json',
      'pool',
      'cluster',
      'gpu',
      'export',
      'sidecar',
      'restart',
      'reboot',
      'manager',
    ],
  },
  {
    id: 'auto-improve',
    label: 'Auto-improve',
    keywords: ['rating', 'requeue', 'mutate', 'seed', 'calm', 'aggressive'],
  },
  {
    id: 'queue-params',
    label: 'Queue parameters',
    keywords: ['steps', 'cfg', 'sampler', 'seed', 'params'],
  },
  {
    id: 'prompt-quality',
    label: 'Prompt quality',
    keywords: ['detail', 'realism', 'anatomy', 'quality', 'orientation', 'sampler preset'],
  },
  {
    id: 'vram-guard',
    label: 'VRAM guard',
    keywords: ['vram', 'max', 'downgrade', 'memory', 'gpu'],
  },
  {
    id: 'hold-max',
    label: 'Hold Max',
    keywords: ['hold', 'idle', 'orchestration', 'max'],
  },
  {
    id: 'sampler-memory',
    label: 'Sampler memory',
    keywords: ['remember', 'cfg', 'steps', 'learned'],
  },
];

export function settingsComfyUiSectionHref(section: ComfyUiSettingsSectionId): string {
  return `/settings?tab=comfyui&section=${section}`;
}

export function normalizeComfyUiSettingsSection(
  value: string | null | undefined
): ComfyUiSettingsSectionId | null {
  if (!value) {
    return null;
  }
  return COMFYUI_SETTINGS_SECTIONS.some(section => section.id === value)
    ? (value as ComfyUiSettingsSectionId)
    : null;
}

/** ComfyUI sections shown when Settings is in essentials / slim mode. */
export const COMFYUI_ESSENTIAL_SECTION_IDS: ComfyUiSettingsSectionId[] = [
  'connection',
  'workflow-map',
  'model-assets',
  'queue-params',
  'hold-max',
  'prompt-quality',
  'vram-guard',
  'inference-engine',
];

const ESSENTIAL_SECTION_ID_SET = new Set<ComfyUiSettingsSectionId>(COMFYUI_ESSENTIAL_SECTION_IDS);

export function isEssentialComfyUiSection(id: ComfyUiSettingsSectionId): boolean {
  return ESSENTIAL_SECTION_ID_SET.has(id);
}

/** Deep links to advanced ComfyUI sections must leave essentials-only view. */
export function comfyUiSectionRequiresFullSettings(
  section: ComfyUiSettingsSectionId | null | undefined
): boolean {
  return Boolean(section && !isEssentialComfyUiSection(section));
}

export function comfyUiSectionsForEssentials(essentialsOnly: boolean): ComfyUiSettingsSection[] {
  if (!essentialsOnly) {
    return COMFYUI_SETTINGS_SECTIONS;
  }
  return COMFYUI_SETTINGS_SECTIONS.filter(section => ESSENTIAL_SECTION_ID_SET.has(section.id));
}

export function filterComfyUiSettingsSections(
  query: string,
  options?: { essentialsOnly?: boolean }
): ComfyUiSettingsSection[] {
  const base = comfyUiSectionsForEssentials(Boolean(options?.essentialsOnly));
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return base;
  }
  return base.filter(section => {
    const haystack = [section.label, section.id, ...section.keywords].join(' ').toLowerCase();
    return haystack.includes(normalized);
  });
}
