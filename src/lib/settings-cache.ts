import { DEFAULT_QWEN_MODEL, type ComfyImageModel } from "./comfy-models/client";
import { DEFAULT_MODEL_SAMPLER_PRESET_TIER, normalizeModelSamplerPresetTier } from "./model-sampler-defaults";
import type { ModelSamplerPresetTier } from "./model-sampler-defaults";
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
} from "./model-resolution-defaults";
import type { ResolutionOrientation, ResolutionSizeTier } from "./model-resolution-defaults";
import {
  DEFAULT_ANATOMY_GUARD_MODE,
  normalizeAnatomyGuardMode,
} from "./anatomy-guard";
import type { AnatomyGuardMode } from "./anatomy-guard";
import {
  DEFAULT_RENDER_REALISM_MODE,
  normalizeRenderRealismMode,
} from "./render-realism";
import type { RenderRealismMode } from "./render-realism";
import { DEFAULT_VARIATION_SETTINGS } from "./variation-settings";
import type { DetailLevel } from "./detail-level";
import {
  isBrowserStorageReady,
  readBrowserValue,
  writeBrowserValue,
} from "./browser-storage";
import type { ModelCheckpointMap, ModelRefinerMap, ModelVaeMap } from "./model-checkpoint-map";
import type { ModelLoraMap, SessionActiveLoraIdsByModel } from "./model-lora-map";
import type { ModelUpscaleMap } from "./model-upscale-map";
import {
  DEFAULT_QUEUE_QUALITY_PROFILE,
  normalizeQueueQualityProfile,
  resolveQueueQualityProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";
import { normalizeToolQueueQualityProfiles, SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES } from "./tool-quality-profiles";
import { mergeToolQualityRecipes } from "./tool-quality-recipes";
import {
  formatModelCheckpointMap,
  parseModelCheckpointMap,
  SUGGESTED_MODEL_CHECKPOINT_MAP,
  SUGGESTED_MODEL_REFINER_MAP,
  SUGGESTED_MODEL_VAE_MAP,
  mergeSuggestedLoaderMaps,
  formatModelRefinerMap,
  parseModelRefinerMap,
  formatModelVaeMap,
  parseModelVaeMap,
} from "./model-checkpoint-map";
import {
  formatModelUpscaleMap,
  mergeSuggestedUpscaleMap,
  parseModelUpscaleMap,
} from "./model-upscale-map";
import { SUGGESTED_MODEL_LORA_MAP } from "./model-lora-map";
import {
  normalizeLoraDatasetExportPrefs,
  normalizeLoraTrainTrainerPrefs,
  normalizeTrainJobs,
} from "./lora-train-job";

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
  /** When true (default), pick the mapped workflow when the target model changes. */
  autoSelectWorkflowForModel?: boolean;
  /**
   * When true (default), apply the model LoRA map to the session picker when the
   * target model changes and the user is still following defaults (session unset).
   */
  autoSelectLorasForModel?: boolean;
  /** When true (default), limit the model picker to models with available workflows. */
  limitModelsToAvailableWorkflows?: boolean;
  /**
   * When true, queue uses built-in scaffolds for the target model instead of
   * library / mapped / picker workflow JSON. Checkpoint/VAE/LoRA maps and
   * queue optimize still apply.
   */
  useSystemWorkflows?: boolean;
  /**
   * When system workflows are on, limit the model picker to FLUX/Qwen/video
   * (default true). Set false for hybrid mode: unsupported families keep
   * mapped/manual workflows instead of snapping away.
   */
  systemWorkflowsLimitPicker?: boolean;
  /** Temporary override to show every model in the picker. */
  showAllModelsOverride?: boolean;
  /** Active inference engine for queue / status / view (`comfyui` | `diffusers`). */
  inferenceEngine?: import("./engine/types").EngineId;
  /** Browser Diffusers engine URL (proxied via `/api/diffusers`). */
  diffusersApiUrl?: string;
  /**
   * Diffusers workshop crop: auto-detect craft roles, always hide hands,
   * or never force the head-and-shoulders crop.
   */
  diffusersWorkshopCrop?: "auto" | "always" | "never";
  /** Session LLM temperature override (0–2) sent with generation requests. */
  sessionLlmTemperature?: number;
  /** Session override for template fallback when LLM fails. */
  sessionAllowTemplateFallback?: boolean;
  /** Session override for the text LLM model (undefined = server LLM_MODEL default). */
  sessionLlmModel?: string;
  /** Session override for the vision LLM model (undefined = server LLM_VISION_MODEL default). */
  sessionLlmVisionModel?: string;
  /** Session LLM enabled override (undefined = server default; false = template-only for this browser). */
  sessionLlmEnabled?: boolean;
  /** Pinned character appearance block injected into Character/Duo generations. */
  activeCharacterDescriptor?: string;
  /** KSampler preset tier applied when queueing (base, optimized, max compatible, or max quality). */
  modelSamplerPreset?: ModelSamplerPresetTier;
  /** Latent orientation preset applied when queueing. */
  modelResolutionOrientation?: ResolutionOrientation;
  /** Latent size tier applied when queueing (small / medium / max). */
  modelResolutionSizeTier?: ResolutionSizeTier;
  /** Auto-adjust positive/negative prompts for realistic renders on queue. */
  renderRealismMode?: RenderRealismMode;
  /** Auto-adjust prompts to reduce mutations and extra limbs on queue. */
  anatomyGuardMode?: AnatomyGuardMode;
  /** When true (default), patch EmptyLatentImage and loader nodes directly at queue time. */
  directWorkflowPatching?: boolean;
  /** When true, overwrite hardcoded checkpoint/UNET/VAE/CLIP filenames with the target model at queue time. */
  syncWorkflowLoadersToModel?: boolean;
  /** When true (default), auto-bind placeholders and audit workflow structure at queue time. */
  workflowQueueOptimize?: boolean;
  /** When true (default), insert model-sampling nodes into imported FLUX/SD3 workflows at queue time. */
  workflowGraphEnrich?: boolean;
  /** When true (default), insert SDXL refiner pass on Final/Max when refiner map is set. */
  workflowSdxlRefinerEnrich?: boolean;
  /** When true (default), chain Lanczos polish after neural UpscaleModel on Max. */
  workflowNeuralUpscalePolish?: boolean;
  /** When true, add subtle ImageSharpen after upscale on Max (off by default — sharpen can look waxy on skin). */
  workflowSharpenAfterUpscale?: boolean;
  /**
   * When true (default), Draft queues save via WebP when a compatible ComfyUI
   * save node is installed; Final/Max keep PNG.
   */
  compactDraftSaves?: boolean;
  /** Overrides sidebar sampler/resolution when queueing (draft / final / max). */
  queueQualityProfile?: QueueQualityProfile;
  /**
   * Session intent shortcuts: Iterate → Draft, Keeper → Final.
   * Cleared when the user picks Max / Follow settings manually.
   */
  sessionQueueMode?: "iterate" | "keeper" | "off";
  /** When true, Max gallery Upscale/Moiré jobs wait until ComfyUI queue is idle. */
  holdMaxUntilIdle?: boolean;
  /** When true (default), Max→Final if free VRAM is below the threshold. */
  vramGuardEnabled?: boolean;
  /** Free VRAM (GB) below which Max enrich downgrades to Final. */
  vramGuardMinFreeGb?: number;
  /** When true, call ComfyUI's `/free` (unload + free VRAM) after a Max-quality gallery job completes. */
  freeVramAfterMax?: boolean;
  /** Per-model sampler params learned from 4–5★ gallery ratings. */
  modelSamplerMemory?: import("./sampler-memory").ModelSamplerMemoryMap;
  /** Per-tool queue quality overrides (tool id → profile). */
  toolQueueQualityProfiles?: import("./tool-quality-profiles").ToolQueueQualityProfiles;
  /** Named quality recipes (model + profile + optional LoRA session). */
  toolQualityRecipes?: import("./tool-quality-recipes").ToolQualityRecipe[];
  /** Per-model checkpoint filename overrides for loader patching (modelId=filename). */
  modelCheckpointMap?: ModelCheckpointMap;
  /** Per-model VAE filename overrides for VAELoader patching (modelId=filename). */
  modelVaeMap?: ModelVaeMap;
  /** Per-model SDXL refiner checkpoint overrides (modelId=filename). */
  modelRefinerMap?: ModelRefinerMap;
  /** Per-model UpscaleModel loader filenames (modelId or default=filename). */
  modelUpscaleMap?: ModelUpscaleMap;
  /**
   * Per-model default LoRA library ids (modelId=id1,id2). Empty value = no LoRAs.
   * Used when this model has no entry in sessionActiveLoraIdsByModel.
   */
  modelLoraMap?: ModelLoraMap;
  /** Per-model ControlNet filenames (modelId or default=filename). */
  modelControlNetMap?: import("./model-controlnet-map").ModelControlNetMap;
  /**
   * Session IP-Adapter identity/style reference(s).
   * At queue time, patches existing {{IPADAPTER_*}} tokens/nodes or auto-inserts
   * a minimal IPAdapter chain when none exist (requires ComfyUI-IPAdapter-Plus
   * class nodes). Extra filenames stack additional Apply nodes. When IP-Adapter
   * Plus is missing, InstantID/PuLID auto-insert is attempted as a fallback.
   */
  ipAdapterImageFilename?: string;
  /** Extra IP-Adapter refs (index 0 mirrors ipAdapterImageFilename). */
  ipAdapterImageFilenames?: string[];
  /** Convenience source URL for the IP-Adapter reference — uploaded to ComfyUI on queue. */
  ipAdapterImageUrl?: string;
  /** IP-Adapter weight (0–1) patched onto IPAdapter-family nodes at queue time. */
  ipAdapterStrength?: number;
  /** Optional ipadapter_file filename override for {{IPADAPTER_MODEL}}. */
  ipAdapterModelFilename?: string;
  /**
   * Current-model LoRA picks mirrored for queue/recipes. Prefer
   * sessionActiveLoraIdsByModel for per-model persistence.
   */
  sessionActiveLoraIds?: string[];
  /**
   * Per-model session LoRA picks. Key present (even with []) = explicit override
   * for that model; missing key = follow model LoRA map / library enabled.
   */
  sessionActiveLoraIdsByModel?: SessionActiveLoraIdsByModel;
  /** Tiled neural upscale tile size (0 disables tiling). Overrides Max default when set. */
  neuralUpscaleTileSize?: number;
  /** Prefer mapped library workflow with upscale nodes for gallery upscale actions. */
  useLibraryUpscaleWorkflow?: boolean;
  /** img2img / edit denoise strength (0.05–1) applied when queueing with an input image. */
  editDenoiseStrength?: number;
  /**
   * Default denoise for the gallery "Face detail" requeue action — feeds
   * {{FACE_DETAIL_DENOISE}} (and {{DENOISE}}) on the resolved workflow.
   */
  faceDetailerDenoise?: number;
  /**
   * When true (default), stamp promptVersion / promptContentHash / versionRootId
   * on history saves and show vN labels in Studio.
   */
  promptVersioningEnabled?: boolean;
  /** @deprecated Use selectedWorkflowFileId */
  selectedWorkflowPresetId?: string;
  /** When true (default), expand `__name__` / `{a|b|c}` wildcard tokens before queueing. */
  expandWildcards?: boolean;
  /** Optional seed for reproducible wildcard expands (blank = fresh random roll each queue). */
  wildcardSeed?: string;
  /** User-defined `__name__` list overrides/additions layered on top of the built-in defaults. */
  wildcardLists?: import("./wildcard-expand").WildcardMap;
  /** When true (default), auto-retry once on OOM/CUDA/execution_error gallery job failures. */
  autoRetryOnOom?: boolean;
  /** When true (default), downgrade Max→Final / Final→Draft on OOM auto-retry. */
  oomRetryDowngrade?: boolean;
  /**
   * Preferred ComfyUI pool host URL. When set and the host is in COMFYUI_POOL
   * and healthy-ish, queue routing prefers it over VRAM-aware / round-robin picks.
   */
  preferredComfyHost?: string;
  /** Last-used gallery LoRA dataset export prefs (trigger + caption mode). */
  loraDatasetExportPrefs?: import("./lora-train-job").LoraDatasetExportPrefs;
  /** External LoRA trainer URL / command / output prefs (app owns the loop). */
  loraTrainTrainerPrefs?: import("./lora-train-job").LoraTrainTrainerPrefs;
  /** Recent LoRA train jobs (localStorage / Dexie settings slice). */
  loraTrainJobs?: import("./lora-train-job").TrainJob[];
};

export type GenerateSource = "keywords" | "random";

export type GenerateToolCache = {
  mode?: "positive" | "negative";
  generateSource?: GenerateSource;
  hintSource?: import("./scene-hint-source").SceneHintSource;
  historySeedScope?: import("./scene-hint-source").HistorySeedScope;
  lastHistorySeedEntryId?: string;
  /** Persisted keyword / scene draft for Generate. */
  hints?: string;
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
  /** Persisted Format draft input. */
  draft?: string;
};

export type PromptEditorToolCache = {
  hints?: string;
  positive?: string;
  negative?: string;
};

export type RefineToolCache = {
  intentHints?: string;
  currentPrompt?: string;
  regionalSlots?: import("./regional-prompt-slots").RegionalPromptSlot[];
};

export type InpaintToolCache = {
  maskDescription?: string;
  changeDescription?: string;
  directPrompt?: string;
  regionalSlots?: import("./regional-prompt-slots").RegionalPromptSlot[];
};

/** Outpaint / expand — pad canvas + border mask. */
export type OutpaintToolCache = {
  intent?: string;
  padTop?: number;
  padRight?: number;
  padBottom?: number;
  padLeft?: number;
};

/** Compose / Transfer tool — key is `imageCompose` (legacy `compose` was CharacterTool). */
export type ImageComposeToolCache = {
  instruction?: string;
  mode?: "transfer" | "modify";
  /** Last figure-slot count hint (1–4). */
  figureCountHint?: number;
  /** Pull identity from Figure 1 via IP-Adapter at queue time. */
  identityLock?: boolean;
  /** IP-Adapter weight when identityLock is on (default 0.5). */
  identityLockStrength?: number;
  /** Identity backend when lock is on (default ipadapter). */
  identityKind?: import("./compose-identity-lock").ComposeIdentityKind;
  regionalSlots?: import("./regional-prompt-slots").RegionalPromptSlot[];
};

export type ControlNetToolCache = {
  mode?: import("./controlnet-prompt").ControlNetMode;
  subject?: string;
  scene?: string;
  /** Extra constraints — not DetailLevel. */
  detailNotes?: string;
};

export type VideoToolCache = {
  subject?: string;
  motion?: string;
  camera?: string;
  style?: string;
  durationSec?: number;
  /** Last video-category model chosen on `/video` (survives other tools changing shared.model). */
  model?: import("./comfy-models/client").ComfyImageModel;
  /** Optional I2V reference frame — a ComfyUI-uploaded filename or a fetchable URL. */
  initImageUrl?: string;
  /** Frame count / length fed to {{VIDEO_FRAMES}} at queue time. */
  frames?: number;
  /** Output frame rate fed to {{VIDEO_FPS}} at queue time. */
  fps?: number;
};

export type AudioToolCache = {
  subject?: string;
  mood?: string;
  instruments?: string;
  durationSec?: number;
};

export type MeshToolCache = {
  subject?: string;
  materials?: string;
  style?: string;
  resolution?: number;
};

export type LintToolCache = {
  hints?: string;
  prompt?: string;
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
  /** Regional prompt segments for {{REGION_*}} queue injection. */
  regionalSegments?: import("./regional-prompt-builder").RegionalPromptSegment[];
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
  promptEditor?: PromptEditorToolCache;
  refine?: RefineToolCache;
  inpaint?: InpaintToolCache;
  outpaint?: OutpaintToolCache;
  /** Compose / Transfer multi-image edit (not CharacterTool legacy `compose`). */
  imageCompose?: ImageComposeToolCache;
  controlnet?: ControlNetToolCache;
  video?: VideoToolCache;
  audio?: AudioToolCache;
  mesh?: MeshToolCache;
  lint?: LintToolCache;
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
  /** Installed plugin runtime manifests (Sprint 8). */
  installedPlugins?: import("./plugin-manifest").PluginManifest[];
};

export const DEFAULT_SHARED_SETTINGS: SharedToolSettings = {
  model: DEFAULT_QWEN_MODEL,
  detail: "balanced",
  alwaysIncludeClothing: true,
  autoFixRules: true,
  modelSamplerPreset: "base",
  modelResolutionOrientation: DEFAULT_RESOLUTION_ORIENTATION,
  modelResolutionSizeTier: DEFAULT_RESOLUTION_SIZE_TIER,
  renderRealismMode: DEFAULT_RENDER_REALISM_MODE,
  anatomyGuardMode: DEFAULT_ANATOMY_GUARD_MODE,
  directWorkflowPatching: true,
  syncWorkflowLoadersToModel: false,
  workflowQueueOptimize: true,
  workflowGraphEnrich: true,
  workflowSdxlRefinerEnrich: true,
  workflowNeuralUpscalePolish: true,
  workflowSharpenAfterUpscale: true,
  compactDraftSaves: true,
  neuralUpscaleTileSize: 512,
  useLibraryUpscaleWorkflow: false,
  queueQualityProfile: "followSettings",
  sessionQueueMode: "off",
  holdMaxUntilIdle: false,
  vramGuardEnabled: true,
  vramGuardMinFreeGb: 6,
  freeVramAfterMax: false,
  modelSamplerMemory: {},
  toolQueueQualityProfiles: SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES,
  toolQualityRecipes: mergeToolQualityRecipes(undefined),
  modelCheckpointMap: {},
  modelVaeMap: {},
  modelRefinerMap: {},
  modelUpscaleMap: {},
  modelLoraMap: {},
  sessionActiveLoraIdsByModel: {},
  autoSelectWorkflowForModel: true,
  autoSelectLorasForModel: true,
  limitModelsToAvailableWorkflows: true,
  useSystemWorkflows: false,
  systemWorkflowsLimitPicker: true,
  showAllModelsOverride: false,
  ipAdapterStrength: 0.6,
  expandWildcards: true,
  autoRetryOnOom: true,
  oomRetryDowngrade: true,
  // Keep in sync with DEFAULT_FACE_DETAIL_DENOISE in gallery-output-face-detail.ts
  // (not imported here to avoid a module cycle through comfyui-config.ts).
  faceDetailerDenoise: 0.35,
  promptVersioningEnabled: true,
  preferredComfyHost: undefined,
};

export const DEFAULT_GENERATE_TOOL_CACHE: GenerateToolCache = {
  mode: "positive",
  generateSource: "keywords",
  hintSource: "manual",
  historySeedScope: "related",
  hints: "",
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
  draft: "",
};

export const DEFAULT_PROMPT_EDITOR_TOOL_CACHE: PromptEditorToolCache = {
  hints: "",
  positive: "",
  negative: "",
};

export const DEFAULT_REFINE_TOOL_CACHE: RefineToolCache = {
  intentHints: "",
  currentPrompt: "",
};

export const DEFAULT_INPAINT_TOOL_CACHE: InpaintToolCache = {
  maskDescription: "",
  changeDescription: "",
  directPrompt: "",
};

export const DEFAULT_OUTPAINT_TOOL_CACHE: OutpaintToolCache = {
  intent: "continue the scene naturally with matching lighting",
  padTop: 128,
  padRight: 128,
  padBottom: 128,
  padLeft: 128,
};

export const DEFAULT_IMAGE_COMPOSE_TOOL_CACHE: ImageComposeToolCache = {
  instruction: "",
  mode: "transfer",
  figureCountHint: 2,
  identityLock: false,
  identityLockStrength: 0.5,
  identityKind: "ipadapter",
};

export const DEFAULT_CONTROLNET_TOOL_CACHE: ControlNetToolCache = {
  mode: "depth",
  subject: "",
  scene: "",
  detailNotes: "",
};

export const DEFAULT_VIDEO_TOOL_CACHE: VideoToolCache = {
  subject: "",
  motion: "",
  camera: "",
  style: "",
  durationSec: 4,
};

export const DEFAULT_AUDIO_TOOL_CACHE: AudioToolCache = {
  subject: "",
  mood: "",
  instruments: "",
  durationSec: 10,
};

export const DEFAULT_MESH_TOOL_CACHE: MeshToolCache = {
  subject: "",
  materials: "",
  style: "",
  resolution: 512,
};

export const DEFAULT_LINT_TOOL_CACHE: LintToolCache = {
  hints: "",
  prompt: "",
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
    return { shared: DEFAULT_SHARED_SETTINGS, tools: {}, installedPlugins: [] };
  }

  try {
    const parsed = readBrowserValue<Partial<SettingsCache>>(SETTINGS_CACHE_KEY);
    if (!parsed) {
      return { shared: DEFAULT_SHARED_SETTINGS, tools: {}, installedPlugins: [] };
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
    shared.renderRealismMode = normalizeRenderRealismMode(
      shared.renderRealismMode ?? DEFAULT_SHARED_SETTINGS.renderRealismMode,
    );
    shared.anatomyGuardMode = normalizeAnatomyGuardMode(
      shared.anatomyGuardMode ?? DEFAULT_ANATOMY_GUARD_MODE,
    );
    shared.queueQualityProfile = normalizeQueueQualityProfile(
      shared.queueQualityProfile ?? DEFAULT_QUEUE_QUALITY_PROFILE,
    );
    shared.expandWildcards = shared.expandWildcards !== false;
    shared.autoRetryOnOom = shared.autoRetryOnOom !== false;
    shared.oomRetryDowngrade = shared.oomRetryDowngrade !== false;
    shared.vramGuardEnabled = shared.vramGuardEnabled !== false;
    shared.promptVersioningEnabled = shared.promptVersioningEnabled !== false;
    const freeGb = shared.vramGuardMinFreeGb;
    shared.vramGuardMinFreeGb =
      typeof freeGb === "number" && Number.isFinite(freeGb)
        ? Math.min(48, Math.max(1, Math.round(freeGb * 10) / 10))
        : DEFAULT_SHARED_SETTINGS.vramGuardMinFreeGb;
    shared.toolQueueQualityProfiles = {
      ...SUGGESTED_TOOL_QUEUE_QUALITY_PROFILES,
      ...normalizeToolQueueQualityProfiles(shared.toolQueueQualityProfiles),
    };
    shared.toolQualityRecipes = mergeToolQualityRecipes(shared.toolQualityRecipes);
    const preferredHost =
      typeof shared.preferredComfyHost === "string"
        ? shared.preferredComfyHost.trim()
        : "";
    shared.preferredComfyHost = preferredHost || undefined;
    shared.loraDatasetExportPrefs = normalizeLoraDatasetExportPrefs(
      shared.loraDatasetExportPrefs,
    );
    shared.loraTrainTrainerPrefs = normalizeLoraTrainTrainerPrefs(
      shared.loraTrainTrainerPrefs,
    );
    shared.loraTrainJobs = normalizeTrainJobs(shared.loraTrainJobs);
    shared.modelCheckpointMap = {
      ...SUGGESTED_MODEL_CHECKPOINT_MAP,
      ...shared.modelCheckpointMap,
    };
    shared.modelVaeMap = {
      ...SUGGESTED_MODEL_VAE_MAP,
      ...shared.modelVaeMap,
    };
    shared.modelRefinerMap = {
      ...SUGGESTED_MODEL_REFINER_MAP,
      ...shared.modelRefinerMap,
    };
    shared.modelUpscaleMap = mergeSuggestedUpscaleMap(shared.modelUpscaleMap);
    shared.modelLoraMap = {
      ...SUGGESTED_MODEL_LORA_MAP,
      ...shared.modelLoraMap,
    };

    // Migrate sticky global LoRA session → per-model for the current model only.
    // Other models keep the system default (map or empty) until the user picks.
    const byModel = shared.sessionActiveLoraIdsByModel ?? {};
    const byModelEmpty = Object.keys(byModel).length === 0;
    if (
      byModelEmpty &&
      Array.isArray(shared.sessionActiveLoraIds) &&
      shared.model?.trim()
    ) {
      shared.sessionActiveLoraIdsByModel = {
        [shared.model.trim()]: shared.sessionActiveLoraIds,
      };
    } else if (!shared.sessionActiveLoraIdsByModel) {
      shared.sessionActiveLoraIdsByModel = {};
    }

    const rawTools = parsed.tools ?? {};
    const migrated = migrateLegacyToolSettings(rawTools);
    if (migrated.changed && typeof window !== "undefined") {
      saveSettingsCache({ shared, tools: migrated.tools });
    }

    return {
      shared,
      tools: migrated.tools,
      installedPlugins: Array.isArray(parsed.installedPlugins)
        ? (parsed.installedPlugins as SettingsCache["installedPlugins"])
        : [],
    };
  } catch {
    return { shared: DEFAULT_SHARED_SETTINGS, tools: {}, installedPlugins: [] };
  }
}

export function saveSettingsCache(cache: SettingsCache): void {
  if (typeof window === "undefined") {
    return;
  }
  // Refuse pre-hydrate writes — loadSettingsCache() returns defaults when the
  // KV cache is still empty, and persisting that would wipe real IDB settings.
  if (!isBrowserStorageReady()) {
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

/**
 * Pure list helpers for `StudioToolCache.savedIdentityBundles` — a saved library of
 * portable character sheets (descriptor + LoRA triggers + IP-Adapter ref settings)
 * on top of the single-bundle export/import already in character-identity-bundle.ts.
 * Callers persist the result via saveToolSettings("studio", { savedIdentityBundles }).
 */
export function upsertSavedIdentityBundle(
  list: import("./character-identity-bundle").CharacterIdentityBundle[] | undefined,
  bundle: import("./character-identity-bundle").CharacterIdentityBundle,
): import("./character-identity-bundle").CharacterIdentityBundle[] {
  const key = bundle.name.trim().toLowerCase();
  const next = (list ?? []).filter((entry) => entry.name.trim().toLowerCase() !== key);
  next.push(bundle);
  return next;
}

export function removeSavedIdentityBundle(
  list: import("./character-identity-bundle").CharacterIdentityBundle[] | undefined,
  name: string,
): import("./character-identity-bundle").CharacterIdentityBundle[] {
  const key = name.trim().toLowerCase();
  return (list ?? []).filter((entry) => entry.name.trim().toLowerCase() !== key);
}

export function listSavedIdentityBundles(): import("./character-identity-bundle").CharacterIdentityBundle[] {
  return loadToolSettings("studio", DEFAULT_STUDIO_TOOL_CACHE).savedIdentityBundles ?? [];
}
