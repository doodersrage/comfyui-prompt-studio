import { DEFAULT_QWEN_MODEL, type ComfyImageModel } from "./comfy-models";
import { DEFAULT_MODEL_SAMPLER_PRESET_TIER, normalizeModelSamplerPresetTier } from "./model-sampler-defaults";
import type { ModelSamplerPresetTier } from "./model-sampler-defaults";
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
} from "./model-resolution-defaults";
import type { ResolutionOrientation, ResolutionSizeTier } from "./model-resolution-defaults";
import { DEFAULT_VARIATION_SETTINGS } from "./variation-settings";
import type { DetailLevel } from "./detail-level";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";

export const SETTINGS_CACHE_KEY = "comfy-prompt-tool-settings-v1";

export type SharedToolSettings = {
  model: ComfyImageModel;
  detail: DetailLevel;
  /** Shared across people-focused tools; rolls catalog wardrobe when enabled. */
  alwaysIncludeClothing?: boolean;
  /** Pin catalog wardrobe across Character/Duo/Batch generations. */
  lockedWardrobeId?: string;
  /** Pin scene location across people-focused generators. */
  lockedLocation?: string;
  /** Pin variation/environment seed for reproducible rolls. */
  lockedVariationSeed?: string;
  /** Auto-apply rule fixes when lint reports errors after generation. */
  autoFixRules?: boolean;
  /** Saved workflow assignment used when queueing from generators. */
  selectedWorkflowFileId?: string;
  /** Auto-select workflow file when target model changes. */
  modelWorkflowMap?: Record<string, string>;
  /** Session LLM temperature override (0–2) sent with generation requests. */
  sessionLlmTemperature?: number;
  /** Session override for template fallback when LLM fails. */
  sessionAllowTemplateFallback?: boolean;
  /** Pinned character appearance block injected into Character/Duo generations. */
  activeCharacterDescriptor?: string;
  /** KSampler preset tier applied when queueing (base vs optimized). */
  modelSamplerPreset?: ModelSamplerPresetTier;
  /** Latent orientation preset applied when queueing. */
  modelResolutionOrientation?: ResolutionOrientation;
  /** Latent size tier applied when queueing (small / medium / max). */
  modelResolutionSizeTier?: ResolutionSizeTier;
  /** @deprecated Use selectedWorkflowFileId */
  selectedWorkflowPresetId?: string;
};

export type GenerateSource = "keywords" | "random";

export type GenerateToolCache = {
  mode?: "positive" | "negative";
  generateSource?: GenerateSource;
  hintSource?: import("./scene-hint-source").SceneHintSource;
  historySeedScope?: import("./scene-hint-source").HistorySeedScope;
  lastHistorySeedEntryId?: string;
  variationEnabled?: boolean;
  variationStrength?: number;
  distinctPeople?: boolean;
  sportPresetId?: string;
  sceneStarterCategory?: import("./scene-starter-presets").SceneStarterCategory | "all";
  sceneStarterPresetId?: string;
  sceneStarterQuery?: string;
  sceneStarterFraming?: import("./scene-starter-presets").SceneStarterFramingFilter;
  sceneStarterTags?: string[];
  /** Optional theme steer for random surprise mode. */
  genre?: string;
  includePeople?: boolean;
  wildness?: number;
};

export type FormatToolCache = {
  mode?: "positive" | "negative";
  smartFormat?: boolean;
};

import type { CharacterPresetOptions } from "./character-options";

export type CharacterSceneMode = "solo" | "duo" | "compose";

export type CharacterToolCache = {
  hints?: string;
  hintSource?: import("./scene-hint-source").SceneHintSource;
  historySeedScope?: import("./scene-hint-source").HistorySeedScope;
  randomTheme?: string;
  lastHistorySeedEntryId?: string;
  sceneMode?: CharacterSceneMode;
  portraitStyle?: "portrait" | "full-body" | "action";
  variationStrength?: number;
  sportPresetId?: string;
  sceneStarterCategory?: import("./scene-starter-presets").SceneStarterCategory | "all";
  sceneStarterPresetId?: string;
  sceneStarterQuery?: string;
  sceneStarterFraming?: import("./scene-starter-presets").SceneStarterFramingFilter;
  sceneStarterTags?: string[];
  teamKit?: boolean;
  batchCount?: number;
  composeSubjectMode?: "character" | "duo";
  composeStyle?: "layered" | "inline";
  settingType?: string;
  timeOfDay?: string;
  mood?: string;
} & Partial<CharacterPresetOptions> &
  Partial<Omit<BackgroundPresetOptions, "surfaceMaterials">> & {
    surfaceMaterials?: string;
  };

import type { BackgroundPresetOptions } from "./background-options";

export type BackgroundToolCache = {
  settingType?: string;
  timeOfDay?: string;
  mood?: string;
  hintSource?: import("./scene-hint-source").SceneHintSource;
  historySeedScope?: import("./scene-hint-source").HistorySeedScope;
  randomTheme?: string;
  lastHistorySeedEntryId?: string;
  surfaceMaterials?: string;
} & Partial<Omit<BackgroundPresetOptions, "surfaceMaterials">>;

import type { FantasyPresetOptions, FantasyShotFraming } from "./fantasy-options";
import type { PetPresetOptions } from "./pet-options";

export type PetToolCache = {
  hints?: string;
  hintSource?: import("./scene-hint-source").SceneHintSource;
  historySeedScope?: import("./scene-hint-source").HistorySeedScope;
  randomTheme?: string;
  lastHistorySeedEntryId?: string;
  portraitStyle?: "portrait" | "full-body" | "action";
  variationStrength?: number;
  petPresetId?: string;
  presetCategory?: "all" | "dog" | "cat" | "bird" | "rabbit" | "small";
} & Partial<PetPresetOptions>;

export type FantasyToolCache = {
  hints?: string;
  hintSource?: import("./scene-hint-source").SceneHintSource;
  historySeedScope?: import("./scene-hint-source").HistorySeedScope;
  randomTheme?: string;
  lastHistorySeedEntryId?: string;
  portraitStyle?: FantasyShotFraming;
  wildness?: number;
  variationStrength?: number;
  fantasyPresetId?: string;
  presetCategory?:
    | "all"
    | "character"
    | "creature"
    | "environment"
    | "epic"
    | "dark"
    | "fairy"
    | "celestial";
} & Partial<FantasyPresetOptions>;

export type ImagePromptToolCache = {
  focus?: "full" | "subject" | "background" | "style";
  descriptionPreset?: import("./image-prompt-presets").ImagePromptDescriptionPreset;
  extraHints?: string;
};

export type TopicToolCache = {
  seedTopic?: string;
  hintSource?: import("./scene-hint-source").SceneHintSource;
  historySeedScope?: import("./scene-hint-source").HistorySeedScope;
  randomTheme?: string;
  lastHistorySeedEntryId?: string;
  count?: number;
  variety?: number;
  batchTarget?: "generate" | "duo" | "character" | "pet" | "fantasy" | "background";
};

export type NegativeToolCache = {
  sport?: string;
  preserveSubject?: boolean;
  extra?: string;
};

export type StudioToolCache = {
  compareModelB?: string;
  compareVisualSeed?: string;
  templateId?: string;
  templateSlots?: Record<string, string>;
  catalogTab?: "clothing" | "locations";
  locationBlocklist?: string[];
  savedIdentityBundles?: import("./character-identity-bundle").CharacterIdentityBundle[];
};

export type VariationsToolCache = {
  hints?: string;
  hintSource?: import("./scene-hint-source").SceneHintSource;
  historySeedScope?: import("./scene-hint-source").HistorySeedScope;
  randomTheme?: string;
  lastHistorySeedEntryId?: string;
  count?: number;
  variationStrength?: number;
  target?: "generate" | "character" | "duo" | "pet" | "fantasy" | "background";
  gridMode?: "roll" | "matrix" | "imported";
  matrixAxisRow?: "variation" | "sportPreset" | "location";
  matrixAxisCol?: "variation" | "sportPreset" | "location";
  matrixRowCount?: number;
  matrixColCount?: number;
  portraitStyle?: "portrait" | "full-body" | "action";
  sportPresetId?: string;
  importedBatchPrompts?: string[];
  importedBatchTopics?: string[];
};

export type ToolSettingsCache = {
  generate?: GenerateToolCache;
  format?: FormatToolCache;
  background?: BackgroundToolCache;
  pet?: PetToolCache;
  fantasy?: FantasyToolCache;
  character?: CharacterToolCache;
  imagePrompt?: ImagePromptToolCache;
  topics?: TopicToolCache;
  negative?: NegativeToolCache;
  studio?: StudioToolCache;
  variations?: VariationsToolCache;
};

/** @internal Legacy keys merged into character/generate on load. */
type LegacyToolSettingsCache = ToolSettingsCache & {
  randomScene?: Pick<GenerateToolCache, "genre" | "includePeople" | "wildness">;
  duo?: Pick<
    CharacterToolCache,
    | "hints"
    | "portraitStyle"
    | "variationStrength"
    | "sportPresetId"
    | "teamKit"
    | "batchCount"
  >;
  compose?: Pick<
    CharacterToolCache,
    | "hints"
    | "portraitStyle"
    | "variationStrength"
    | "teamKit"
    | "composeStyle"
    | "settingType"
    | "timeOfDay"
    | "mood"
    | "surfaceMaterials"
  > &
    Partial<CharacterPresetOptions> &
    Partial<Omit<BackgroundPresetOptions, "surfaceMaterials">> & {
      subjectMode?: "character" | "duo";
    };
};

export type SettingsCache = {
  shared: SharedToolSettings;
  tools: ToolSettingsCache;
};

export const DEFAULT_SHARED_SETTINGS: SharedToolSettings = {
  model: DEFAULT_QWEN_MODEL,
  detail: "balanced",
  alwaysIncludeClothing: true,
  autoFixRules: true,
  modelSamplerPreset: "base",
  modelResolutionOrientation: DEFAULT_RESOLUTION_ORIENTATION,
  modelResolutionSizeTier: DEFAULT_RESOLUTION_SIZE_TIER,
};

export const DEFAULT_GENERATE_TOOL_CACHE: GenerateToolCache = {
  mode: "positive",
  generateSource: "keywords",
  hintSource: "manual",
  historySeedScope: "related",
  variationEnabled: DEFAULT_VARIATION_SETTINGS.enabled,
  variationStrength: DEFAULT_VARIATION_SETTINGS.strength,
  distinctPeople: true,
  genre: "",
  includePeople: true,
  wildness: 65,
};

export const DEFAULT_FORMAT_TOOL_CACHE: FormatToolCache = {
  mode: "positive",
  smartFormat: true,
};

export const DEFAULT_CHARACTER_TOOL_CACHE: CharacterToolCache = {
  hints: "",
  hintSource: "manual",
  historySeedScope: "related",
  randomTheme: "",
  sceneMode: "solo",
  portraitStyle: "portrait",
  variationStrength: 50,
  sportPresetId: "",
  teamKit: false,
  batchCount: 3,
  composeSubjectMode: "duo",
  composeStyle: "layered",
  settingType: "",
  timeOfDay: "",
  mood: "",
};

export const DEFAULT_BACKGROUND_TOOL_CACHE: BackgroundToolCache = {
  hintSource: "manual",
  historySeedScope: "related",
  randomTheme: "",
  settingType: "",
  timeOfDay: "",
  mood: "",
};

export const DEFAULT_PET_TOOL_CACHE: PetToolCache = {
  hints: "",
  hintSource: "manual",
  historySeedScope: "related",
  randomTheme: "",
  portraitStyle: "portrait",
  variationStrength: 50,
};

export const DEFAULT_FANTASY_TOOL_CACHE: FantasyToolCache = {
  hints: "",
  hintSource: "manual",
  historySeedScope: "related",
  randomTheme: "",
  portraitStyle: "portrait",
  wildness: 65,
  variationStrength: 50,
};

export const DEFAULT_IMAGE_PROMPT_TOOL_CACHE: ImagePromptToolCache = {
  focus: "full",
  descriptionPreset: "standard",
  extraHints: "",
};

export const DEFAULT_TOPIC_TOOL_CACHE: TopicToolCache = {
  seedTopic: "",
  hintSource: "manual",
  historySeedScope: "related",
  randomTheme: "",
  count: 10,
  variety: 50,
  batchTarget: "generate",
};

export const DEFAULT_NEGATIVE_TOOL_CACHE: NegativeToolCache = {
  sport: "",
  preserveSubject: false,
  extra: "",
};

export const DEFAULT_STUDIO_TOOL_CACHE: StudioToolCache = {
  compareModelB: "flux-2-klein",
  templateId: "duo-sport-race",
  templateSlots: {},
  catalogTab: "clothing",
  locationBlocklist: [],
};

export const DEFAULT_VARIATIONS_TOOL_CACHE: VariationsToolCache = {
  hints: "",
  hintSource: "manual",
  historySeedScope: "related",
  randomTheme: "",
  count: 4,
  variationStrength: 65,
  target: "generate",
  portraitStyle: "action",
  sportPresetId: "",
};

function isDetailLevel(value: unknown): value is DetailLevel {
  return value === "concise" || value === "balanced" || value === "rich";
}

export function migrateLegacyToolSettings(
  tools: ToolSettingsCache,
): { tools: ToolSettingsCache; changed: boolean } {
  const legacy = tools as LegacyToolSettingsCache;
  const { randomScene, duo, compose, ...rest } = legacy;

  if (!randomScene && !duo && !compose) {
    return { tools, changed: false };
  }

  let changed = false;
  let character = { ...(rest.character ?? {}) } as CharacterToolCache;
  let generate = { ...(rest.generate ?? {}) } as GenerateToolCache;

  if (duo) {
    changed = true;
    character = {
      ...character,
      ...duo,
      sceneMode: "duo",
    };
  }

  if (compose) {
    changed = true;
    const { subjectMode, ...composeRest } = compose;
    character = {
      ...character,
      ...composeRest,
      composeSubjectMode: subjectMode ?? character.composeSubjectMode,
      sceneMode: "compose",
    };
  }

  if (randomScene) {
    changed = true;
    generate = {
      ...generate,
      ...randomScene,
      generateSource: "random",
    };
  }

  return {
    tools: {
      ...rest,
      character,
      generate,
    },
    changed,
  };
}

export function loadSettingsCache(): SettingsCache {
  if (typeof window === "undefined") {
    return { shared: DEFAULT_SHARED_SETTINGS, tools: {} };
  }

  try {
    const parsed = readBrowserValue<Partial<SettingsCache>>(SETTINGS_CACHE_KEY);
    if (!parsed) {
      return { shared: DEFAULT_SHARED_SETTINGS, tools: {} };
    }
    const shared = {
      ...DEFAULT_SHARED_SETTINGS,
      ...parsed.shared,
    };

    if (!isDetailLevel(shared.detail)) {
      shared.detail = DEFAULT_SHARED_SETTINGS.detail;
    }

    shared.modelSamplerPreset = normalizeModelSamplerPresetTier(
      shared.modelSamplerPreset ?? DEFAULT_MODEL_SAMPLER_PRESET_TIER,
    );
    shared.modelResolutionOrientation = normalizeResolutionOrientation(
      shared.modelResolutionOrientation ?? DEFAULT_RESOLUTION_ORIENTATION,
    );
    shared.modelResolutionSizeTier = normalizeResolutionSizeTier(
      shared.modelResolutionSizeTier ?? DEFAULT_RESOLUTION_SIZE_TIER,
    );

    const rawTools = parsed.tools ?? {};
    const migrated = migrateLegacyToolSettings(rawTools);
    if (migrated.changed && typeof window !== "undefined") {
      saveSettingsCache({ shared, tools: migrated.tools });
    }

    return {
      shared,
      tools: migrated.tools,
    };
  } catch {
    return { shared: DEFAULT_SHARED_SETTINGS, tools: {} };
  }
}

export function saveSettingsCache(cache: SettingsCache): void {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserValue(SETTINGS_CACHE_KEY, cache);
}

export function saveSharedSettings(shared: SharedToolSettings): void {
  const cache = loadSettingsCache();
  saveSettingsCache({ ...cache, shared });
}

export function saveToolSettings<K extends keyof ToolSettingsCache>(
  tool: K,
  settings: ToolSettingsCache[K],
): void {
  const cache = loadSettingsCache();
  saveSettingsCache({
    ...cache,
    tools: {
      ...cache.tools,
      [tool]: {
        ...cache.tools[tool],
        ...settings,
      },
    },
  });
}

export function loadToolSettings<K extends keyof ToolSettingsCache>(
  tool: K,
  defaults: NonNullable<ToolSettingsCache[K]>,
): NonNullable<ToolSettingsCache[K]> {
  const cache = loadSettingsCache();
  return {
    ...defaults,
    ...(cache.tools[tool] ?? {}),
  } as NonNullable<ToolSettingsCache[K]>;
}
