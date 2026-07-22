import type { ComfyUiModelLists } from "./comfyui-object-info";
import {
  SUGGESTED_MODEL_CHECKPOINT_MAP,
  SUGGESTED_MODEL_VAE_MAP,
  type ModelCheckpointMap,
  type ModelVaeMap,
} from "./model-checkpoint-map";
import type { ModelControlNetMap } from "./model-controlnet-map";
import {
  SUGGESTED_MODEL_UPSCALE_MAP,
  type ModelUpscaleMap,
} from "./model-upscale-map";

export type LoaderMapInventorySyncInput = {
  models: ComfyUiModelLists;
  checkpointMap?: ModelCheckpointMap;
  vaeMap?: ModelVaeMap;
  upscaleMap?: ModelUpscaleMap;
  controlNetMap?: ModelControlNetMap;
};

export type LoaderMapInventorySyncResult = {
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelUpscaleMap: ModelUpscaleMap;
  modelControlNetMap: ModelControlNetMap;
  filledCheckpointKeys: string[];
  filledVaeKeys: string[];
  filledUpscaleKeys: string[];
  filledControlNetKeys: string[];
};

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Closest installed filename for a suggested stem (exact → stem includes). */
export function matchInventoryFilename(
  preferred: string | undefined,
  inventory: string[],
): string | undefined {
  const trimmed = preferred?.trim();
  if (!trimmed || inventory.length === 0) {
    return undefined;
  }
  const exact = inventory.find((entry) => entry === trimmed);
  if (exact) {
    return exact;
  }
  const lower = trimmed.toLowerCase();
  const exactCi = inventory.find((entry) => entry.toLowerCase() === lower);
  if (exactCi) {
    return exactCi;
  }
  const stem = lower.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, "");
  return inventory.find((entry) => {
    const entryLower = entry.toLowerCase();
    const entryStem = entryLower.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, "");
    return entryLower.includes(stem) || stem.includes(entryStem);
  });
}

function fillEmptyMapKeys(input: {
  current?: Record<string, string | undefined>;
  suggested: Record<string, string | undefined>;
  inventory: string[];
}): { map: Record<string, string>; filledKeys: string[] } {
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.current ?? {})) {
    const trimmed = trimFilename(value);
    if (trimmed) {
      map[key] = trimmed;
    }
  }
  const filledKeys: string[] = [];
  for (const [key, preferred] of Object.entries(input.suggested)) {
    if (trimFilename(map[key])) {
      continue;
    }
    const matched = matchInventoryFilename(preferred, input.inventory);
    if (matched) {
      map[key] = matched;
      filledKeys.push(key);
    }
  }
  return { map, filledKeys };
}

/**
 * Fill empty loader-map keys from live ComfyUI inventory using curated suggest
 * stems. Never overwrites a non-empty user value.
 */
export function syncLoaderMapsFromInventory(
  input: LoaderMapInventorySyncInput,
): LoaderMapInventorySyncResult {
  const checkpointInventory = [
    ...new Set([...input.models.unets, ...input.models.checkpoints]),
  ];

  const checkpoint = fillEmptyMapKeys({
    current: input.checkpointMap,
    suggested: SUGGESTED_MODEL_CHECKPOINT_MAP,
    inventory: checkpointInventory,
  });
  const vae = fillEmptyMapKeys({
    current: input.vaeMap,
    suggested: SUGGESTED_MODEL_VAE_MAP,
    inventory: input.models.vaes,
  });
  const upscale = fillEmptyMapKeys({
    current: input.upscaleMap,
    suggested: SUGGESTED_MODEL_UPSCALE_MAP,
    inventory: input.models.upscaleModels,
  });

  const controlNetSuggested: ModelControlNetMap = {
    default: input.models.controlNets[0],
  };
  const controlNet = fillEmptyMapKeys({
    current: input.controlNetMap,
    suggested: controlNetSuggested,
    inventory: input.models.controlNets,
  });

  return {
    modelCheckpointMap: checkpoint.map,
    modelVaeMap: vae.map,
    modelUpscaleMap: upscale.map,
    modelControlNetMap: controlNet.map,
    filledCheckpointKeys: checkpoint.filledKeys,
    filledVaeKeys: vae.filledKeys,
    filledUpscaleKeys: upscale.filledKeys,
    filledControlNetKeys: controlNet.filledKeys,
  };
}

export function formatInventorySyncMessage(
  result: LoaderMapInventorySyncResult,
): string {
  const total =
    result.filledCheckpointKeys.length +
    result.filledVaeKeys.length +
    result.filledUpscaleKeys.length +
    result.filledControlNetKeys.length;
  if (total === 0) {
    return "No empty map keys matched ComfyUI inventory.";
  }
  const parts: string[] = [];
  if (result.filledCheckpointKeys.length) {
    parts.push(`${result.filledCheckpointKeys.length} checkpoint/UNET`);
  }
  if (result.filledVaeKeys.length) {
    parts.push(`${result.filledVaeKeys.length} VAE`);
  }
  if (result.filledUpscaleKeys.length) {
    parts.push(`${result.filledUpscaleKeys.length} upscale`);
  }
  if (result.filledControlNetKeys.length) {
    parts.push(`${result.filledControlNetKeys.length} ControlNet`);
  }
  return `Filled ${total} empty map key(s) from inventory (${parts.join(", ")}).`;
}
