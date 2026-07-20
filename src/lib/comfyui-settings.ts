import {
  type ComfyUiRuntimeConfig,
  stripEmptyComfyUiRuntime,
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  type CustomWorkflowToken,
  type WorkflowParamValues,
  type WorkflowPlaceholderTokens,
} from "./comfyui-config";
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from "./browser-storage";

export const COMFYUI_SETTINGS_KEY = "comfyui-settings-v4";

export type LoraLibraryEntry = {
  id: string;
  label: string;
  triggerPhrase: string;
  tokenValue: string;
};

export type ComfyUiSettings = {
  useServerDefaults: boolean;
  apiUrl?: string;
  positiveToken?: string;
  negativeToken?: string;
  workflowJson?: string;
  queueParams?: WorkflowParamValues;
  customTokens?: CustomWorkflowToken[];
  loraLibrary?: LoraLibraryEntry[];
  notifyOnComplete?: boolean;
  /** Auto-tag completed gallery entries with vision LLM tags. */
  autoVisionTags?: boolean;
  /** Auto-fetch negative prompt when queueing SD-family models. */
  autoNegativeOnQueue?: boolean;
  /** Save to Studio history when queueing from a result panel (skips if already saved). */
  autoSaveHistoryOnQueue?: boolean;
  /** Open Refine with corrective intent when a gallery output is rated 1–2★. */
  autoRefineOnLowRating?: boolean;
  /** Queue mutations when a gallery output is rated 4–5★. */
  autoMutateOnHighRating?: boolean;
  /** Queue seed experiments when a gallery output is rated 4–5★. */
  autoSeedExperimentOnHighRating?: boolean;
  /** Queue seed experiments when an output is favorited. */
  autoSeedExperimentOnFavorite?: boolean;
  /** Re-queue 4–5★ gallery outputs at Final quality with a new seed. */
  autoRequeueFinalOnHighRating?: boolean;
  /** Re-queue 5★ gallery outputs at Max quality with a new seed. */
  autoRequeueMaxOnFiveStar?: boolean;
  /** Prefer ComfyUI WebSocket progress updates over polling-only status. */
  useWebSocketProgress?: boolean;
  /** Saved negative presets for queue / copy pair. */
  negativeProfiles?: import("./negative-profiles").NegativeProfile[];
  selectedNegativeProfileId?: string;
};

export const DEFAULT_COMFYUI_SETTINGS: ComfyUiSettings = {
  useServerDefaults: true,
  apiUrl: "",
  positiveToken: DEFAULT_POSITIVE_TOKEN,
  negativeToken: DEFAULT_NEGATIVE_TOKEN,
  workflowJson: "",
  queueParams: {
    width: "1024",
    height: "1024",
    cfg: "7",
    steps: "20",
  },
  customTokens: [],
  loraLibrary: [],
  notifyOnComplete: false,
  autoVisionTags: true,
  autoNegativeOnQueue: true,
  autoSaveHistoryOnQueue: true,
  autoRefineOnLowRating: true,
  autoMutateOnHighRating: false,
  autoSeedExperimentOnHighRating: false,
  autoSeedExperimentOnFavorite: false,
  autoRequeueFinalOnHighRating: true,
  autoRequeueMaxOnFiveStar: true,
  useWebSocketProgress: false,
  negativeProfiles: [],
  selectedNegativeProfileId: "general-sd",
};

const LORA_TOKEN_PREFIX = "{{LORA_";

export function mergeLoraLibraryIntoCustomTokens(
  settings: ComfyUiSettings,
): ComfyUiSettings {
  const library = settings.loraLibrary ?? [];
  const manualTokens = (settings.customTokens ?? []).filter(
    (entry) => !entry.token.trim().startsWith(LORA_TOKEN_PREFIX),
  );
  const loraTokens: CustomWorkflowToken[] = library
    .filter((entry) => entry.id.trim())
    .map((entry) => ({
      token: `{{LORA_${entry.id.trim()}}}`,
      value: entry.tokenValue,
    }));

  return {
    ...settings,
    customTokens: [...manualTokens, ...loraTokens],
  };
}

const LEGACY_SETTINGS_KEYS = [
  "comfyui-settings-v3",
  "comfyui-settings-v2",
  "comfyui-settings-v1",
];

function migrateLegacySettings(
  parsed: Partial<ComfyUiSettings & { positiveNodeId?: string; negativeNodeId?: string }>,
): ComfyUiSettings {
  try {
    return {
      ...DEFAULT_COMFYUI_SETTINGS,
      useServerDefaults: parsed.useServerDefaults ?? true,
      apiUrl: parsed.apiUrl ?? "",
      positiveToken: parsed.positiveToken ?? DEFAULT_POSITIVE_TOKEN,
      negativeToken: parsed.negativeToken ?? DEFAULT_NEGATIVE_TOKEN,
      workflowJson: parsed.workflowJson ?? "",
      queueParams: parsed.queueParams ?? DEFAULT_COMFYUI_SETTINGS.queueParams,
      customTokens: parsed.customTokens ?? [],
      loraLibrary: parsed.loraLibrary ?? [],
      notifyOnComplete: parsed.notifyOnComplete ?? false,
      autoVisionTags: parsed.autoVisionTags ?? true,
    };
  } catch {
    return DEFAULT_COMFYUI_SETTINGS;
  }
}

export function loadComfyUiSettings(): ComfyUiSettings {
  if (typeof window === "undefined") {
    return DEFAULT_COMFYUI_SETTINGS;
  }

  try {
    const current = readBrowserValue<Partial<ComfyUiSettings>>(COMFYUI_SETTINGS_KEY);
    if (current) {
      return { ...DEFAULT_COMFYUI_SETTINGS, ...current };
    }

    for (const legacyKey of LEGACY_SETTINGS_KEYS) {
      const legacy = readBrowserValue<
        Partial<ComfyUiSettings & { positiveNodeId?: string; negativeNodeId?: string }>
      >(legacyKey);
      if (legacy) {
        const migrated = migrateLegacySettings(legacy);
        saveComfyUiSettings(migrated);
        return migrated;
      }
    }

    return DEFAULT_COMFYUI_SETTINGS;
  } catch {
    return DEFAULT_COMFYUI_SETTINGS;
  }
}

export function saveComfyUiSettings(settings: ComfyUiSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserValue(COMFYUI_SETTINGS_KEY, settings);
  for (const legacyKey of LEGACY_SETTINGS_KEYS) {
    removeBrowserKey(legacyKey);
  }
}

export function resetComfyUiSettings(): void {
  if (typeof window === "undefined") {
    return;
  }

  removeBrowserKey(COMFYUI_SETTINGS_KEY);
  for (const legacyKey of LEGACY_SETTINGS_KEYS) {
    removeBrowserKey(legacyKey);
  }
}

export function comfyUiSettingsToRuntime(
  settings: ComfyUiSettings,
): ComfyUiRuntimeConfig | undefined {
  if (settings.useServerDefaults) {
    return undefined;
  }

  return stripEmptyComfyUiRuntime({
    apiUrl: settings.apiUrl,
    workflowJson: settings.workflowJson,
    positiveToken:
      settings.positiveToken === DEFAULT_POSITIVE_TOKEN
        ? undefined
        : settings.positiveToken,
    negativeToken:
      settings.negativeToken === DEFAULT_NEGATIVE_TOKEN
        ? undefined
        : settings.negativeToken,
    queueParams: settings.queueParams,
    customTokens: settings.customTokens,
  });
}

export function placeholderTokensFromSettings(
  settings: ComfyUiSettings,
): WorkflowPlaceholderTokens {
  return {
    positive: settings.positiveToken?.trim() || DEFAULT_POSITIVE_TOKEN,
    negative: settings.negativeToken?.trim() || DEFAULT_NEGATIVE_TOKEN,
    seed: DEFAULT_SEED_TOKEN,
    width: DEFAULT_WIDTH_TOKEN,
    height: DEFAULT_HEIGHT_TOKEN,
    cfg: DEFAULT_CFG_TOKEN,
    steps: DEFAULT_STEPS_TOKEN,
    sampler: DEFAULT_SAMPLER_TOKEN,
    scheduler: DEFAULT_SCHEDULER_TOKEN,
    shift: DEFAULT_SHIFT_TOKEN,
    fluxMaxShift: DEFAULT_FLUX_MAX_SHIFT_TOKEN,
    fluxBaseShift: DEFAULT_FLUX_BASE_SHIFT_TOKEN,
    denoise: DEFAULT_DENOISE_TOKEN,
    inputImage: DEFAULT_INPUT_IMAGE_TOKEN,
    maskImage: DEFAULT_MASK_IMAGE_TOKEN,
  };
}
