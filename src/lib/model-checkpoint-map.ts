import {
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models";
import type { CustomWorkflowToken, WorkflowParamValues } from "./comfyui-config";
import {
  defaultLoaderPrecisionTier,
  detectLoaderPrecisionTier,
  filenameMatchesPrecisionTier,
  precisionHintFromFilename,
  qwen2512UnetFilename,
  qwenDualClipFilename,
  qwenEdit2509UnetFilename,
  qwenEdit2511UnetFilename,
  qwenGenericUnetFilename,
  type LoaderPrecisionTier,
} from "./model-loader-precision";
import { isQwenLightningModel } from "./model-sampling-patch";

export type ModelLoaderFilenames = {
  checkpoint?: string;
  unet?: string;
  vae?: string;
  dualClip?: string;
};

export type ModelCheckpointMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelUnetMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelVaeMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelRefinerMap = Partial<Record<ComfyImageModel | string, string>>;

export const DEFAULT_CHECKPOINT_TOKEN = "{{CHECKPOINT}}";
export const DEFAULT_UNET_TOKEN = "{{UNET}}";
export const DEFAULT_VAE_TOKEN = "{{VAE}}";
export const DEFAULT_REFINER_TOKEN = "{{REFINER}}";

export const DEFAULT_SDXL_REFINER_CHECKPOINT = "sd_xl_refiner_1.0.safetensors";

/** Suggested checkpoint/UNET filenames for common models (merged into Settings; user entries win). */
export const SUGGESTED_MODEL_CHECKPOINT_MAP: ModelCheckpointMap = {
  "qwen-image-2512": "qwen_image_2512_bf16.safetensors",
  "qwen-image-2512-lightning-4": "qwen_image_2512_bf16.safetensors",
  "qwen-image-2512-lightning-8": "qwen_image_2512_bf16.safetensors",
  "qwen-image-edit-2511": "qwen_image_edit_2511_bf16.safetensors",
  "qwen-image-edit-2511-lightning-4": "qwen_image_edit_2511_bf16.safetensors",
  "qwen-image-edit-2511-lightning-8": "qwen_image_edit_2511_bf16.safetensors",
  "qwen-image-edit-2509": "qwen_image_edit_2509_bf16.safetensors",
  "flux-2-klein": "flux-2-klein-base-4b-fp8.safetensors",
  "flux-2-klein-4b-distilled": "flux-2-klein-4b-fp8.safetensors",
  "flux-2-klein-9b": "flux-2-klein-9b.safetensors",
  "flux-2-klein-9b-distilled": "flux-2-klein-9b-fp8.safetensors",
  "flux-dev": "flux1-dev.safetensors",
  sdxl: "sd_xl_base_1.0.safetensors",
};

export const SUGGESTED_MODEL_VAE_MAP: ModelVaeMap = {
  default: "flux2-vae.safetensors",
  "flux-2-klein": "flux2-vae.safetensors",
  "flux-2-klein-4b-distilled": "flux2-vae.safetensors",
  "flux-2-klein-9b": "flux2-vae.safetensors",
  "flux-2-klein-9b-distilled": "flux2-vae.safetensors",
  "flux-dev": "ae.safetensors",
  "qwen-image-2512": "qwen_image_vae.safetensors",
  "qwen-image-2512-lightning-4": "qwen_image_vae.safetensors",
  "qwen-image-2512-lightning-8": "qwen_image_vae.safetensors",
  "qwen-image-edit-2511": "qwen_image_vae.safetensors",
  "qwen-image-edit-2511-lightning-4": "qwen_image_vae.safetensors",
  "qwen-image-edit-2511-lightning-8": "qwen_image_vae.safetensors",
  "qwen-image-edit-2509": "qwen_image_vae.safetensors",
};

export const SUGGESTED_MODEL_REFINER_MAP: ModelRefinerMap = {
  default: DEFAULT_SDXL_REFINER_CHECKPOINT,
};

/** Merge suggested loader maps; explicit user entries win over suggestions. */
export function mergeSuggestedLoaderMaps(input?: {
  checkpointMap?: ModelCheckpointMap;
  vaeMap?: ModelVaeMap;
  refinerMap?: ModelRefinerMap;
}): {
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelRefinerMap: ModelRefinerMap;
  addedCheckpointKeys: string[];
  addedVaeKeys: string[];
  addedRefinerKeys: string[];
} {
  const modelCheckpointMap = {
    ...SUGGESTED_MODEL_CHECKPOINT_MAP,
    ...input?.checkpointMap,
  };
  const modelVaeMap = {
    ...SUGGESTED_MODEL_VAE_MAP,
    ...input?.vaeMap,
  };
  const modelRefinerMap = {
    ...SUGGESTED_MODEL_REFINER_MAP,
    ...input?.refinerMap,
  };

  const addedCheckpointKeys = Object.keys(SUGGESTED_MODEL_CHECKPOINT_MAP).filter(
    (key) => !trimFilename(input?.checkpointMap?.[key]),
  );
  const addedVaeKeys = Object.keys(SUGGESTED_MODEL_VAE_MAP).filter(
    (key) => !trimFilename(input?.vaeMap?.[key]),
  );
  const addedRefinerKeys = Object.keys(SUGGESTED_MODEL_REFINER_MAP).filter(
    (key) => !trimFilename(input?.refinerMap?.[key]),
  );

  return {
    modelCheckpointMap,
    modelVaeMap,
    modelRefinerMap,
    addedCheckpointKeys,
    addedVaeKeys,
    addedRefinerKeys,
  };
}

export function formatSuggestedLoaderMergeMessage(result: {
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelRefinerMap: ModelRefinerMap;
  addedCheckpointKeys: string[];
  addedVaeKeys: string[];
  addedRefinerKeys: string[];
}): string {
  const checkpointCount = Object.keys(result.modelCheckpointMap).length;
  const vaeCount = Object.keys(result.modelVaeMap).length;
  const refinerCount = Object.keys(result.modelRefinerMap).length;
  const addedTotal =
    result.addedCheckpointKeys.length +
    result.addedVaeKeys.length +
    result.addedRefinerKeys.length;

  if (addedTotal === 0) {
    return `Loader maps already include all suggested entries (${checkpointCount} checkpoint, ${vaeCount} VAE, ${refinerCount} refiner). Edit the text areas below if your ComfyUI folder uses different filenames.`;
  }

  const parts: string[] = [];
  if (result.addedCheckpointKeys.length > 0) {
    parts.push(`${result.addedCheckpointKeys.length} checkpoint`);
  }
  if (result.addedVaeKeys.length > 0) {
    parts.push(`${result.addedVaeKeys.length} VAE`);
  }
  if (result.addedRefinerKeys.length > 0) {
    parts.push(`${result.addedRefinerKeys.length} refiner`);
  }

  return `Merged suggested loader maps — added ${parts.join(", ")} ${parts.length === 1 ? "entry" : "entries"} (${checkpointCount} checkpoint, ${vaeCount} VAE, ${refinerCount} refiner total). Review the text areas below.`;
}

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Phr00t Rapid AIO / Wan Rapid AIO merges are full checkpoints for CheckpointLoader,
 * not diffusion_models UNETs. Never write these into UNETLoader.unet_name.
 */
export function filenameLooksLikeCheckpointOnly(filename: string | undefined): boolean {
  const name = trimFilename(filename)?.toLowerCase();
  if (!name) {
    return false;
  }
  if (/rapid[\s_-]*aio/.test(name)) {
    return true;
  }
  if (/phr00t/.test(name) && /aio/.test(name)) {
    return true;
  }
  return false;
}

function preferUnetCompatibleFilename(
  candidate: string | undefined,
  fallback?: string,
): string | undefined {
  const trimmed = trimFilename(candidate);
  if (!trimmed || filenameLooksLikeCheckpointOnly(trimmed)) {
    return trimFilename(fallback);
  }
  return trimmed;
}

function resolveCustomTokenValue(
  token: string,
  customTokens?: CustomWorkflowToken[],
): string | undefined {
  if (!customTokens?.length) {
    return undefined;
  }
  const match = customTokens.find((entry) => entry.token.trim() === token);
  return trimFilename(match?.value);
}

const CATEGORY_VAE_HINTS: Partial<Record<ComfyModelCategory, string>> = {
  flux: "flux2-vae.safetensors",
  sd3: "sd3_vae.safetensors",
  sdxl: "sdxl_vae.safetensors",
  qwen: "qwen_image_vae.safetensors",
  "stable-diffusion": "vae-ft-mse-840000-ema-pruned.safetensors",
};

const DEFAULT_QWEN_VAE = "qwen_image_vae.safetensors";

/** Default UNET/checkpoint filenames when registry hints are missing (matches common ComfyUI installs). */
function inferQwenLoaderHints(
  modelId: string,
  tier: LoaderPrecisionTier = defaultLoaderPrecisionTier(),
): ModelLoaderFilenames {
  const id = modelId.toLowerCase();
  if (!id.includes("qwen")) {
    return {};
  }

  if (id.includes("qwen-rapid-aio") || id.includes("qwen_rapid_aio")) {
    return {
      // Checkpoint-only family — never invent a UNET name from the Rapid AIO merge.
      vae: DEFAULT_QWEN_VAE,
    };
  }

  if (id.includes("qwen-image-2512") || id.includes("qwen_image_2512")) {
    const unet = qwen2512UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  if (id.includes("qwen-image-edit-2511") || id.includes("qwen_image_edit_2511")) {
    const unet = qwenEdit2511UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  if (id.includes("qwen-image-edit-2509") || id.includes("qwen_image_edit_2509")) {
    const unet = qwenEdit2509UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  if (id.includes("qwen-image-edit") || id.includes("qwen_image_edit")) {
    const unet = qwenEdit2509UnetFilename(tier);
    return {
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  if (id.includes("qwen-image") || id.includes("qwen_image")) {
    const unet = qwenGenericUnetFilename(tier);
    return {
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  return { vae: DEFAULT_QWEN_VAE };
}

/** Default UNET/checkpoint filenames when registry hints are missing (matches common ComfyUI installs). */
function inferKleinLoaderHints(modelId: string): ModelLoaderFilenames {
  const id = modelId.toLowerCase();
  if (id.includes("flux-2-klein-9b-distilled") || id.includes("flux-2-klein-9b-distill")) {
    return {
      checkpoint: "flux-2-klein-9b-fp8.safetensors",
      unet: "flux-2-klein-9b-fp8.safetensors",
    };
  }
  if (id.includes("flux-2-klein-9b")) {
    return {
      checkpoint: "flux-2-klein-9b.safetensors",
      unet: "flux-2-klein-9b.safetensors",
    };
  }
  if (id.includes("flux-2-klein-4b-distilled") || id.includes("flux-2-klein-4b-distill")) {
    return {
      checkpoint: "flux-2-klein-4b-fp8.safetensors",
      unet: "flux-2-klein-4b-fp8.safetensors",
    };
  }
  if (id.includes("flux-2-klein")) {
    return {
      checkpoint: "flux-2-klein-base-4b-fp8.safetensors",
      unet: "flux-2-klein-base-4b-fp8.safetensors",
    };
  }
  return {};
}

function preferTierAlignedLoaderFilename(
  candidate: string | undefined,
  tier: LoaderPrecisionTier,
  fallback: string | undefined,
  workflowTier?: LoaderPrecisionTier,
): string | undefined {
  const trimmed = trimFilename(candidate);
  if (!trimmed) {
    return fallback;
  }
  if (workflowTier && !filenameMatchesPrecisionTier(trimmed, workflowTier)) {
    return fallback;
  }
  if (!filenameMatchesPrecisionTier(trimmed, tier)) {
    return fallback;
  }
  return trimmed;
}

export function realignLoaderFilenamesToWorkflowPrecision(
  params: WorkflowParamValues,
  model: string,
  workflow: Record<string, unknown> | undefined,
  options?: {
    checkpointMap?: ModelCheckpointMap;
    vaeMap?: ModelVaeMap;
    customTokens?: CustomWorkflowToken[];
    workflowCustomTokens?: CustomWorkflowToken[];
  },
): WorkflowParamValues {
  const workflowTier = workflow ? detectLoaderPrecisionTier(workflow) : undefined;
  const tier =
    isQwenLightningModel(model) ? "bf16" : workflowTier;
  if (!tier || !model.trim()) {
    return params;
  }

  const aligned = resolveLoaderFilenamesForModel(model, {
    ...options,
    precisionTier: tier,
    workflow,
  });
  const next = { ...params };

  if (
    next.unetFilename?.toString().trim() &&
    !filenameMatchesPrecisionTier(next.unetFilename.toString(), tier)
  ) {
    if (aligned.unet) {
      next.unetFilename = aligned.unet;
    }
  }
  if (
    next.checkpointFilename?.toString().trim() &&
    !filenameMatchesPrecisionTier(next.checkpointFilename.toString(), tier)
  ) {
    if (aligned.checkpoint) {
      next.checkpointFilename = aligned.checkpoint;
    }
  }

  return next;
}

export function resolveLoaderFilenamesForModel(
  model: ComfyImageModel | string,
  options?: {
    checkpointMap?: ModelCheckpointMap;
    unetMap?: ModelUnetMap;
    vaeMap?: ModelVaeMap;
    customTokens?: CustomWorkflowToken[];
    /** Per-workflow tokens — beat modelCheckpointMap for CHECKPOINT/UNET/VAE. */
    workflowCustomTokens?: CustomWorkflowToken[];
    precisionTier?: LoaderPrecisionTier;
    workflow?: Record<string, unknown>;
  },
): ModelLoaderFilenames {
  const workflowTier = options?.workflow
    ? detectLoaderPrecisionTier(options.workflow)
    : undefined;
  const tier = options?.precisionTier ?? workflowTier ?? defaultLoaderPrecisionTier();
  const def = getComfyModelDefinition(model);
  const inferred = {
    ...inferQwenLoaderHints(model, workflowTier ?? tier),
    ...inferKleinLoaderHints(model),
  };
  const mappedCheckpoint = trimFilename(options?.checkpointMap?.[model]);
  const mappedUnet = trimFilename(options?.unetMap?.[model]);
  const workflowCheckpoint = resolveCustomTokenValue(
    DEFAULT_CHECKPOINT_TOKEN,
    options?.workflowCustomTokens,
  );
  const workflowUnet = resolveCustomTokenValue(
    DEFAULT_UNET_TOKEN,
    options?.workflowCustomTokens,
  );
  const workflowVae = resolveCustomTokenValue(
    DEFAULT_VAE_TOKEN,
    options?.workflowCustomTokens,
  );
  const customCheckpoint = resolveCustomTokenValue(
    DEFAULT_CHECKPOINT_TOKEN,
    options?.customTokens,
  );
  const customUnet = resolveCustomTokenValue(DEFAULT_UNET_TOKEN, options?.customTokens);

  let checkpoint: string | undefined;
  let unet: string | undefined;

  if (workflowTier) {
    checkpoint =
      preferTierAlignedLoaderFilename(workflowCheckpoint, tier, undefined, workflowTier) ??
      preferTierAlignedLoaderFilename(mappedCheckpoint, tier, undefined, workflowTier) ??
      preferTierAlignedLoaderFilename(customCheckpoint, tier, undefined, workflowTier) ??
      trimFilename(def?.checkpointHint) ??
      inferred.checkpoint;
    unet =
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(workflowUnet, tier, undefined, workflowTier),
      ) ??
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(mappedUnet, tier, undefined, workflowTier),
      ) ??
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(mappedCheckpoint, tier, undefined, workflowTier),
      ) ??
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(customUnet, tier, undefined, workflowTier),
      ) ??
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(checkpoint, tier, undefined, workflowTier),
      ) ??
      inferred.unet ??
      trimFilename(def?.unetHint);
  } else {
    checkpoint =
      workflowCheckpoint ??
      mappedCheckpoint ??
      customCheckpoint ??
      trimFilename(def?.checkpointHint) ??
      inferred.checkpoint;
    unet =
      preferUnetCompatibleFilename(workflowUnet) ??
      preferUnetCompatibleFilename(mappedUnet) ??
      preferUnetCompatibleFilename(mappedCheckpoint) ??
      preferUnetCompatibleFilename(customUnet) ??
      preferUnetCompatibleFilename(inferred.unet) ??
      preferUnetCompatibleFilename(trimFilename(def?.unetHint)) ??
      preferUnetCompatibleFilename(checkpoint);
  }
  const vae =
    workflowVae ??
    trimFilename(options?.vaeMap?.[model]) ??
    trimFilename(def?.vaeHint) ??
    (def?.category ? CATEGORY_VAE_HINTS[def.category] : undefined);

  const effectiveTier =
    precisionHintFromFilename(unet ?? checkpoint ?? "") ??
    workflowTier ??
    tier;

  const result: ModelLoaderFilenames = {};
  if (checkpoint) {
    result.checkpoint = checkpoint;
  }
  if (unet) {
    result.unet = unet;
  }
  if (vae) {
    result.vae = vae;
  }
  if (inferred.dualClip || model.toLowerCase().includes("qwen")) {
    result.dualClip = qwenDualClipFilename(effectiveTier);
  }
  return result;
}

export function loaderFilenameCustomTokens(
  loaders: ModelLoaderFilenames,
): CustomWorkflowToken[] {
  const tokens: CustomWorkflowToken[] = [];
  if (loaders.checkpoint?.trim()) {
    tokens.push({ token: DEFAULT_CHECKPOINT_TOKEN, value: loaders.checkpoint.trim() });
  }
  if (loaders.unet?.trim()) {
    tokens.push({ token: DEFAULT_UNET_TOKEN, value: loaders.unet.trim() });
  }
  if (loaders.vae?.trim()) {
    tokens.push({ token: DEFAULT_VAE_TOKEN, value: loaders.vae.trim() });
  }
  return tokens;
}

/** Prefer official SDXL refiner, else any checkpoint whose name looks like a refiner. */
export function pickSdxlRefinerFromInventory(
  checkpoints?: string[] | null,
): string | undefined {
  if (!checkpoints?.length) {
    return undefined;
  }
  const trimmed = checkpoints.map((name) => name.trim()).filter(Boolean);
  const preferred = trimmed.find((name) => /sd_xl_refiner/i.test(name));
  if (preferred) {
    return preferred;
  }
  return trimmed.find((name) => /refiner/i.test(name));
}

export function resolveRefinerFilenameForModel(
  model: ComfyImageModel | string,
  options?: {
    refinerMap?: ModelRefinerMap;
    customTokens?: CustomWorkflowToken[];
    availableCheckpoints?: string[] | null;
  },
): string | undefined {
  const def = getComfyModelDefinition(model);
  if (def.category !== "sdxl" || model.toLowerCase().includes("refiner")) {
    return undefined;
  }

  const mapped =
    trimFilename(options?.refinerMap?.[model]) ??
    trimFilename(options?.refinerMap?.default) ??
    resolveCustomTokenValue(DEFAULT_REFINER_TOKEN, options?.customTokens) ??
    DEFAULT_SDXL_REFINER_CHECKPOINT;

  const inventory = options?.availableCheckpoints;
  if (inventory && inventory.length > 0) {
    if (mapped && inventory.includes(mapped)) {
      return mapped;
    }
    return pickSdxlRefinerFromInventory(inventory) ?? mapped;
  }

  return mapped;
}

export function formatModelCheckpointMap(map: ModelCheckpointMap | undefined): string {
  if (!map) {
    return "";
  }
  return Object.entries(map)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([modelId, filename]) => `${modelId}=${filename.trim()}`)
    .join("\n");
}

export function parseModelCheckpointMap(text: string): ModelCheckpointMap {
  const map: ModelCheckpointMap = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.includes("=") ? "=" : ":";
    const [modelId, ...rest] = trimmed.split(separator);
    const filename = rest.join(separator).trim();
    if (modelId?.trim() && filename) {
      map[modelId.trim()] = filename;
    }
  }
  return map;
}

export const formatModelVaeMap = formatModelCheckpointMap;
export const parseModelVaeMap = parseModelCheckpointMap;
export const formatModelRefinerMap = formatModelCheckpointMap;
export const parseModelRefinerMap = parseModelCheckpointMap;
