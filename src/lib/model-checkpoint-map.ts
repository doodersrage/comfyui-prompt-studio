import {
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models";
import type { CustomWorkflowToken } from "./comfyui-config";
import {
  defaultLoaderPrecisionTier,
  qwen2512UnetFilename,
  qwenEdit2509UnetFilename,
  qwenEdit2511UnetFilename,
  qwenGenericUnetFilename,
  type LoaderPrecisionTier,
} from "./model-loader-precision";

export type ModelLoaderFilenames = {
  checkpoint?: string;
  unet?: string;
  vae?: string;
};

export type ModelCheckpointMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelUnetMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelVaeMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelRefinerMap = Partial<Record<ComfyImageModel | string, string>>;

export const DEFAULT_CHECKPOINT_TOKEN = "{{CHECKPOINT}}";
export const DEFAULT_UNET_TOKEN = "{{UNET}}";
export const DEFAULT_VAE_TOKEN = "{{VAE}}";
export const DEFAULT_REFINER_TOKEN = "{{REFINER}}";

const DEFAULT_SDXL_REFINER_CHECKPOINT = "sd_xl_refiner_1.0.safetensors";

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
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

  if (id.includes("qwen-image-2512") || id.includes("qwen_image_2512")) {
    const unet = qwen2512UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
    };
  }

  if (id.includes("qwen-image-edit-2511") || id.includes("qwen_image_edit_2511")) {
    const unet = qwenEdit2511UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
    };
  }

  if (id.includes("qwen-image-edit-2509") || id.includes("qwen_image_edit_2509")) {
    const unet = qwenEdit2509UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
    };
  }

  if (id.includes("qwen-image-edit") || id.includes("qwen_image_edit")) {
    const unet = qwenEdit2509UnetFilename(tier);
    return {
      unet,
      vae: DEFAULT_QWEN_VAE,
    };
  }

  if (id.includes("qwen-image") || id.includes("qwen_image")) {
    const unet = qwenGenericUnetFilename(tier);
    return {
      unet,
      vae: DEFAULT_QWEN_VAE,
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

export function resolveLoaderFilenamesForModel(
  model: ComfyImageModel | string,
  options?: {
    checkpointMap?: ModelCheckpointMap;
    unetMap?: ModelUnetMap;
    vaeMap?: ModelVaeMap;
    customTokens?: CustomWorkflowToken[];
    precisionTier?: LoaderPrecisionTier;
  },
): ModelLoaderFilenames {
  const tier = options?.precisionTier ?? defaultLoaderPrecisionTier();
  const def = getComfyModelDefinition(model);
  const inferred = {
    ...inferQwenLoaderHints(model, tier),
    ...inferKleinLoaderHints(model),
  };
  const mappedCheckpoint = trimFilename(options?.checkpointMap?.[model]);
  const mappedUnet = trimFilename(options?.unetMap?.[model]);
  const checkpoint =
    mappedCheckpoint ??
    resolveCustomTokenValue(DEFAULT_CHECKPOINT_TOKEN, options?.customTokens) ??
    trimFilename(def?.checkpointHint) ??
    inferred.checkpoint;
  const unet =
    mappedUnet ??
    mappedCheckpoint ??
    resolveCustomTokenValue(DEFAULT_UNET_TOKEN, options?.customTokens) ??
    inferred.unet ??
    trimFilename(def?.unetHint) ??
    checkpoint;
  const vae =
    trimFilename(options?.vaeMap?.[model]) ??
    trimFilename(def?.vaeHint) ??
    (def?.category ? CATEGORY_VAE_HINTS[def.category] : undefined);

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

export function resolveRefinerFilenameForModel(
  model: ComfyImageModel | string,
  options?: {
    refinerMap?: ModelRefinerMap;
    customTokens?: CustomWorkflowToken[];
  },
): string | undefined {
  const def = getComfyModelDefinition(model);
  if (def.category !== "sdxl" || model.toLowerCase().includes("refiner")) {
    return undefined;
  }

  return (
    trimFilename(options?.refinerMap?.[model]) ??
    trimFilename(options?.refinerMap?.default) ??
    resolveCustomTokenValue(DEFAULT_REFINER_TOKEN, options?.customTokens) ??
    DEFAULT_SDXL_REFINER_CHECKPOINT
  );
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
