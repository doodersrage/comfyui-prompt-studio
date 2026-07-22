import type { ComfyImageModel } from "./comfy-models/client";
import {
  COMFY_IMAGE_MODELS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
} from "./comfy-models/client";
import type {
  ComfyUiRuntimeConfig,
  CustomWorkflowToken,
  WorkflowParamValues,
} from "./comfyui-config";
import type { ComfyUiModelLists } from "./comfyui-object-info";
import { readCachedComfyObjectInfoModels } from "./comfyui-object-info-cache";
import {
  resolveSelectedWorkflowRuntime,
} from "./comfyui-runtime";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files";
import { pickVideoCheckpointFromInventory } from "./ensure-video-workflow";
import {
  syncLoaderMapsFromInventory,
  matchInventoryFilename,
} from "./loader-map-inventory-sync";
import {
  SUGGESTED_MODEL_CHECKPOINT_MAP,
  SUGGESTED_MODEL_VAE_MAP,
  type ModelCheckpointMap,
  type ModelVaeMap,
} from "./model-checkpoint-map";
import {
  filenameMatchesPrecisionTier,
  precisionHintFromFilename,
  type LoaderPrecisionTier,
} from "./model-loader-precision";
import {
  DEFAULT_MODEL_SAMPLER_PRESET_TIER,
  normalizeModelSamplerPresetTier,
  resolveModelSamplerParams,
} from "./model-sampler-defaults";
import {
  isQwenLightningModel,
  resolveModelSamplingParams,
} from "./model-sampling-patch";
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveModelResolutionParams,
} from "./model-resolution-defaults";
import {
  normalizeQueueQualityProfile,
  resolveEffectiveResolutionSizeTier,
  resolveEffectiveSamplerPreset,
} from "./queue-quality-profile";
import type { SharedToolSettings } from "./settings-cache";
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadToolSettings,
} from "./settings-cache";
import { rankWorkflowFilesForModel } from "./workflow-category-defaults";
import { workflowHasLoraLoader } from "./workflow-lightning-queue";
import { loraFilenameImpliesLightning } from "./workflow-lora-patch";
import {
  buildWorkflowScaffoldForModel,
  fluxKleinDualClipFilename,
} from "./workflow-scaffold";
import {
  extractWorkflowStackFingerprint,
  workflowStackMatchesModel,
} from "./workflow-stack-fingerprint";

/** Minimum rank score before a library graph can beat the built-in scaffold. */
export const SYSTEM_WORKFLOW_MIN_PACK_SCORE = 6;

/**
 * Models with a dedicated system scaffold (not the generic checkpoint fallback).
 * FLUX, Qwen (incl. Lightning / Edit / Rapid), and video (WAN / Hunyuan / LTX).
 */
export function isSystemWorkflowSupportedModel(
  model: ComfyImageModel | string,
): boolean {
  const category = getComfyModelDefinition(model)?.category;
  return category === "flux" || category === "qwen" || category === "video";
}

export function listSystemWorkflowSupportedModels(): ComfyImageModel[] {
  return COMFY_IMAGE_MODELS.filter((entry) =>
    isSystemWorkflowSupportedModel(entry.id),
  ).map((entry) => entry.id);
}

export function resolveSystemWorkflowFallbackModel(
  current?: ComfyImageModel | string,
): ComfyImageModel {
  if (current && isSystemWorkflowSupportedModel(current)) {
    return current as ComfyImageModel;
  }
  if (isSystemWorkflowSupportedModel(DEFAULT_COMFY_MODEL)) {
    return DEFAULT_COMFY_MODEL;
  }
  return listSystemWorkflowSupportedModels()[0] ?? DEFAULT_COMFY_MODEL;
}

export type SystemWorkflowSource = "pack" | "scaffold";

export type SystemWorkflowResolveResult = {
  workflowJson: string;
  source: SystemWorkflowSource;
  workflowFileId?: string;
  workflowLabel?: string;
  queueParams: WorkflowParamValues;
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelUpscaleMap?: SharedToolSettings["modelUpscaleMap"];
  customTokens?: CustomWorkflowToken[];
};

function looksLikeAppScaffoldLabel(file: Pick<ComfyWorkflowFile, "name" | "filename">): boolean {
  const haystack = `${file.name} ${file.filename ?? ""}`.toLowerCase();
  return /scaffold|starter graph|prompt.?studio.?template/.test(haystack);
}

function isVideoModel(model: ComfyImageModel | string): boolean {
  return getComfyModelDefinition(model)?.category === "video";
}

function looksLikeVideoPackGraph(workflowJson: string): boolean {
  return /WanImageToVideo|HunyuanImageToVideo|EmptyLTXVLatentVideo|LTXVConditioning|WanVideo|HunyuanVideoTextEncode|LTXVImgToVideo|LTXVScheduler|LTXVAddGuide|EmptyHunyuanLatentVideo/.test(
    workflowJson,
  );
}

function isFluxKleinModel(model: ComfyImageModel | string): boolean {
  return /flux-2-klein/i.test(String(model));
}

function isLtxVideoModel(model: ComfyImageModel | string): boolean {
  return /ltx/i.test(String(model));
}

/** Prefer an inventory filename whose precision matches the resolved UNET tier. */
export function matchInventoryFilenamePreferTier(
  preferred: string | undefined,
  pool: string[],
  tier?: LoaderPrecisionTier,
): string | undefined {
  if (!preferred?.trim() || pool.length === 0) {
    return undefined;
  }
  if (!tier) {
    return matchInventoryFilename(preferred, pool);
  }

  const lower = preferred.trim().toLowerCase();
  const stem = lower.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "");
  const related = pool.filter((entry) => {
    const entryLower = entry.toLowerCase();
    const entryStem = entryLower.replace(
      /\.(safetensors|ckpt|pt|pth|bin|gguf)$/i,
      "",
    );
    return (
      entryLower === lower ||
      entryLower.includes(stem) ||
      stem.includes(entryStem)
    );
  });
  if (related.length === 0) {
    return matchInventoryFilename(preferred, pool);
  }

  const tierMatched = related.find((name) =>
    filenameMatchesPrecisionTier(name, tier),
  );
  if (tierMatched) {
    return tierMatched;
  }
  return (
    related.find((name) => name.toLowerCase() === lower) ??
    related[0]
  );
}

function pickPoolFilenamePreferTier(
  pool: string[],
  patterns: RegExp[],
  tier?: LoaderPrecisionTier,
): string | undefined {
  const matched = pool.filter((name) => patterns.some((re) => re.test(name)));
  if (matched.length === 0) {
    return undefined;
  }
  if (!tier) {
    return matched[0];
  }
  return (
    matched.find((name) => filenameMatchesPrecisionTier(name, tier)) ??
    matched[0]
  );
}

function weightDtypeForUnetFilename(filename: string): string {
  if (precisionHintFromFilename(filename) === "fp8") {
    return "fp8_e4m3fn";
  }
  return "default";
}

function loaderStemWithoutPrecision(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "")
    .replace(/[-_]?(bf16|fp16|fp8_scaled|fp8|e4m3fn|q[2-8]_k[_-][a-z]|q[2-8]_0)/gi, "");
}

function resolveInventoryUnetForModel(
  model: ComfyImageModel,
  inventory: ComfyUiModelLists,
): string | undefined {
  const pool = [...inventory.unets, ...inventory.checkpoints];
  const preferred = SUGGESTED_MODEL_CHECKPOINT_MAP[model];
  const matched = matchInventoryFilename(preferred, pool);
  if (matched) {
    return matched;
  }
  if (!preferred?.trim() || pool.length === 0) {
    return undefined;
  }
  const baseStem = loaderStemWithoutPrecision(preferred);
  if (!baseStem) {
    return undefined;
  }
  return pool.find((entry) => {
    const entryStem = loaderStemWithoutPrecision(entry);
    return (
      entryStem === baseStem ||
      entryStem.includes(baseStem) ||
      baseStem.includes(entryStem)
    );
  });
}

function looksLikeI2vPackGraph(workflowJson: string): boolean {
  return /WanImageToVideo|WanCameraImageToVideo|HunyuanImageToVideo|LTXVImgToVideo/.test(
    workflowJson,
  );
}

function packHasBoundLoaders(workflowJson: string): boolean {
  const fingerprint = extractWorkflowStackFingerprint(workflowJson);
  return (
    fingerprint.family !== "unknown" &&
    fingerprint.family !== "other" &&
    !fingerprint.isMixed
  );
}

function isPlaceholderFilename(value: string): boolean {
  return /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
}

/** Stem/precision-adjacent match when exact inventory match fails. */
export function matchNearMissInventoryFilename(
  preferred: string | undefined,
  pool: string[],
  tier?: LoaderPrecisionTier,
): string | undefined {
  if (!preferred?.trim() || pool.length === 0) {
    return undefined;
  }
  const close = matchInventoryFilenamePreferTier(preferred, pool, tier);
  if (close) {
    return close;
  }
  const baseStem = loaderStemWithoutPrecision(preferred);
  if (!baseStem) {
    return undefined;
  }
  const related = pool.filter((entry) => {
    const entryStem = loaderStemWithoutPrecision(entry);
    return (
      entryStem === baseStem ||
      entryStem.includes(baseStem) ||
      baseStem.includes(entryStem)
    );
  });
  if (related.length === 0) {
    return undefined;
  }
  if (tier) {
    return (
      related.find((name) => filenameMatchesPrecisionTier(name, tier)) ??
      related[0]
    );
  }
  return related[0];
}

export type PickPackOptions = {
  /** Prefer Wan/Hunyuan/LTX I2V packs when an init image is configured. */
  preferI2v?: boolean;
};

/**
 * Prefer a library / pack graph that scores well for the model; otherwise null
 * (caller falls back to a built-in scaffold).
 */
export function pickPackWorkflowForModel(
  model: ComfyImageModel,
  workflowFiles: ComfyWorkflowFile[],
  inventory?: ComfyUiModelLists | null,
  options?: PickPackOptions,
): { file: ComfyWorkflowFile; score: number } | null {
  if (workflowFiles.length === 0) {
    return null;
  }

  const candidates: { file: ComfyWorkflowFile; score: number }[] = [];
  const ranked = rankWorkflowFilesForModel(model, workflowFiles);
  for (const entry of ranked) {
    if (entry.score < SYSTEM_WORKFLOW_MIN_PACK_SCORE) {
      break;
    }
    if (looksLikeAppScaffoldLabel(entry.file)) {
      continue;
    }

    const json = entry.file.workflowJson ?? "";
    if (!json.trim()) {
      continue;
    }

    const fingerprint = extractWorkflowStackFingerprint(json);
    if (fingerprint.isMixed) {
      continue;
    }

    // Near-miss loaders (fp8↔bf16, renamed CLIP) count as available after soft-repair.
    if (!packLoadersAvailableInInventory(json, inventory, model)) {
      continue;
    }

    // Image stacks: require fingerprint match when the graph has concrete loaders.
    if (!isVideoModel(model) && packHasBoundLoaders(json)) {
      if (!workflowStackMatchesModel(fingerprint, model)) {
        continue;
      }
    }

    if (isQwenLightningModel(model)) {
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const hasLightningToken = json.includes("{{LORA_LIGHTNING}}");
        if (!workflowHasLoraLoader(parsed) && !hasLightningToken) {
          continue;
        }
      } catch {
        continue;
      }
    }

    const videoPack = isVideoModel(model) && looksLikeVideoPackGraph(json);
    const videoBoundPack =
      isVideoModel(model) &&
      packHasBoundLoaders(json) &&
      entry.score >= SYSTEM_WORKFLOW_MIN_PACK_SCORE;
    const boundPack = packHasBoundLoaders(json) && entry.score >= 8;
    const strongName = entry.score >= 12;
    const ltxI2vPack =
      isLtxVideoModel(model) && /LTXVImgToVideo/.test(json);
    if (videoPack || videoBoundPack || ltxI2vPack || boundPack || strongName) {
      candidates.push(entry);
    }
  }

  if (candidates.length === 0) {
    return null;
  }
  if (options?.preferI2v) {
    const i2v = candidates.find((entry) =>
      looksLikeI2vPackGraph(entry.file.workflowJson ?? ""),
    );
    if (i2v) {
      return i2v;
    }
  }
  return candidates[0] ?? null;
}

/**
 * True when every concrete loader is exact-or-near-miss present in inventory
 * (Lightning LoRA may soft-fill from inventory). Cold start → false.
 */
export function packLoadersAvailableInInventory(
  workflowJson: string,
  inventory?: ComfyUiModelLists | null,
  model?: ComfyImageModel | string,
): boolean {
  if (!inventory) {
    return false;
  }
  let graph: Record<string, unknown>;
  try {
    graph = JSON.parse(workflowJson) as Record<string, unknown>;
  } catch {
    return false;
  }

  const unetPool = [...inventory.unets, ...inventory.checkpoints];
  const clipPool = inventory.clips;
  const vaePool = inventory.vaes;
  const loraPool = inventory.loras;
  const checkpointPool =
    inventory.checkpoints.length > 0 ? inventory.checkpoints : unetPool;
  const lightningFallback =
    model && isQwenLightningModel(model)
      ? pickLightningLoraFromInventory(model, loraPool)
      : undefined;

  for (const node of Object.values(graph)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }
    const classType = record.class_type ?? "";

    const requireMatch = (filename: unknown, pool: string[]) => {
      if (typeof filename !== "string" || !filename.trim()) {
        return true;
      }
      if (isPlaceholderFilename(filename)) {
        return true;
      }
      return Boolean(matchNearMissInventoryFilename(filename, pool));
    };

    if (classType === "UNETLoader" || classType === "UnetLoaderGGUF") {
      if (!requireMatch(inputs.unet_name, unetPool)) {
        return false;
      }
    }
    if (classType === "CheckpointLoaderSimple" || classType === "CheckpointLoader") {
      if (!requireMatch(inputs.ckpt_name, checkpointPool)) {
        return false;
      }
    }
    if (classType === "VAELoader") {
      if (!requireMatch(inputs.vae_name, vaePool)) {
        return false;
      }
    }
    if (classType === "CLIPLoader" || classType === "DualCLIPLoader") {
      for (const field of ["clip_name", "clip_name1", "clip_name2"] as const) {
        if (!requireMatch(inputs[field], clipPool)) {
          return false;
        }
      }
    }
    if (
      classType === "LoraLoader" ||
      classType === "LoraLoaderModelOnly"
    ) {
      const loraName = inputs.lora_name;
      if (typeof loraName === "string" && loraName.trim() && !isPlaceholderFilename(loraName)) {
        if (!matchNearMissInventoryFilename(loraName, loraPool)) {
          if (
            lightningFallback &&
            loraFilenameImpliesLightning(loraName)
          ) {
            // Wrong/missing Lightning LoRA can soft-rewrite from inventory.
            continue;
          }
          if (lightningFallback && isQwenLightningModel(model ?? "")) {
            continue;
          }
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Rewrite near-miss pack loaders (precision/stem/Lightning LoRA) to installed names.
 */
export function softRepairPackLoadersFromInventory(
  workflowJson: string,
  model: ComfyImageModel,
  inventory?: ComfyUiModelLists | null,
): { workflowJson: string; repaired: number } {
  if (!inventory) {
    return { workflowJson, repaired: 0 };
  }

  let graph: Record<string, unknown>;
  try {
    graph = JSON.parse(workflowJson) as Record<string, unknown>;
  } catch {
    return { workflowJson, repaired: 0 };
  }

  const unetPool = [...inventory.unets, ...inventory.checkpoints];
  const clipPool = inventory.clips;
  const vaePool = inventory.vaes;
  const loraPool = inventory.loras;
  const checkpointPool =
    inventory.checkpoints.length > 0 ? inventory.checkpoints : unetPool;
  const lightningLora = isQwenLightningModel(model)
    ? pickLightningLoraFromInventory(model, loraPool)
    : undefined;

  let repaired = 0;
  const rewrite = (
    current: unknown,
    pool: string[],
  ): string | undefined => {
    if (typeof current !== "string" || !current.trim()) {
      return undefined;
    }
    if (isPlaceholderFilename(current)) {
      return undefined;
    }
    const matched = matchNearMissInventoryFilename(current, pool);
    if (matched && matched !== current) {
      repaired += 1;
      return matched;
    }
    if (!matched) {
      return undefined;
    }
    return undefined;
  };

  for (const node of Object.values(graph)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    if (!record.inputs) {
      continue;
    }
    const classType = record.class_type ?? "";

    if (classType === "UNETLoader" || classType === "UnetLoaderGGUF") {
      const next = rewrite(record.inputs.unet_name, unetPool);
      if (next) {
        record.inputs.unet_name = next;
        const isGguf = /\.gguf$/i.test(next);
        if (isGguf) {
          record.class_type = "UnetLoaderGGUF";
          delete record.inputs.weight_dtype;
        } else {
          record.class_type = "UNETLoader";
          record.inputs.weight_dtype = weightDtypeForUnetFilename(next);
        }
      }
    }
    if (classType === "CheckpointLoaderSimple" || classType === "CheckpointLoader") {
      const next = rewrite(record.inputs.ckpt_name, checkpointPool);
      if (next) {
        record.inputs.ckpt_name = next;
      }
    }
    if (classType === "VAELoader") {
      const next = rewrite(record.inputs.vae_name, vaePool);
      if (next) {
        record.inputs.vae_name = next;
      }
    }
    if (classType === "CLIPLoader" || classType === "DualCLIPLoader") {
      for (const field of ["clip_name", "clip_name1", "clip_name2"] as const) {
        const next = rewrite(record.inputs[field], clipPool);
        if (next) {
          record.inputs[field] = next;
        }
      }
    }
    if (
      (classType === "LoraLoader" || classType === "LoraLoaderModelOnly") &&
      lightningLora
    ) {
      const current = record.inputs.lora_name;
      if (typeof current !== "string" || isPlaceholderFilename(current)) {
        continue;
      }
      const inInventory = matchNearMissInventoryFilename(current, loraPool);
      const wantEdit = /edit/i.test(String(model));
      const currentIsEdit = /edit/i.test(current);
      const mismatchedFamily =
        (wantEdit && !currentIsEdit) || (!wantEdit && currentIsEdit);
      if ((!inInventory || mismatchedFamily) && current !== lightningLora) {
        record.inputs.lora_name = lightningLora;
        repaired += 1;
      }
    }
  }

  return {
    workflowJson: repaired > 0 ? JSON.stringify(graph, null, 2) : workflowJson,
    repaired,
  };
}

/** Soft-bind scaffold CLIP/VAE/UNET filenames + pick Lightning LoRA from inventory. */
export function softBindScaffoldFromInventory(
  workflowJson: string,
  model: ComfyImageModel,
  inventory?: ComfyUiModelLists | null,
): {
  workflowJson: string;
  lightningLora?: string;
} {
  if (!inventory) {
    return { workflowJson };
  }

  let graph: Record<string, unknown>;
  try {
    graph = JSON.parse(workflowJson) as Record<string, unknown>;
  } catch {
    return { workflowJson };
  }

  const category = getComfyModelDefinition(model)?.category;
  const clipPool = inventory.clips;
  const vaePool = inventory.vaes;
  const checkpointPool =
    inventory.checkpoints.length > 0
      ? inventory.checkpoints
      : [...inventory.unets, ...inventory.checkpoints];
  const resolvedUnet = resolveInventoryUnetForModel(model, inventory);
  const resolvedCheckpoint =
    (isVideoModel(model)
      ? pickVideoCheckpointFromInventory(model, inventory.checkpoints)
      : undefined) ??
    matchNearMissInventoryFilename(
      SUGGESTED_MODEL_CHECKPOINT_MAP[model],
      checkpointPool,
    ) ??
    resolvedUnet;
  const unetTier = resolvedUnet
    ? precisionHintFromFilename(resolvedUnet)
    : resolvedCheckpoint
      ? precisionHintFromFilename(resolvedCheckpoint)
      : undefined;
  const kleinDual = isFluxKleinModel(model)
    ? fluxKleinDualClipFilename(model)
    : undefined;

  for (const node of Object.values(graph)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    if (!record.inputs) {
      continue;
    }
    const classType = record.class_type ?? "";

    if (
      (classType === "UNETLoader" || classType === "UnetLoaderGGUF") &&
      resolvedUnet
    ) {
      const isGguf = /\.gguf$/i.test(resolvedUnet);
      if (isGguf) {
        record.class_type = "UnetLoaderGGUF";
        // GGUF loader has no weight_dtype input.
        delete record.inputs.weight_dtype;
      } else if (classType === "UNETLoader" || classType === "UnetLoaderGGUF") {
        record.class_type = "UNETLoader";
        if ("weight_dtype" in record.inputs || classType === "UNETLoader") {
          record.inputs.weight_dtype = weightDtypeForUnetFilename(resolvedUnet);
        }
      }
      // Bind concrete names and {{UNET}} placeholders when inventory has the file.
      if (typeof record.inputs.unet_name === "string") {
        if (
          isPlaceholderFilename(record.inputs.unet_name) ||
          !matchInventoryFilename(record.inputs.unet_name, [
            ...inventory.unets,
            ...inventory.checkpoints,
          ])
        ) {
          record.inputs.unet_name = resolvedUnet;
        } else {
          const near = matchNearMissInventoryFilename(
            record.inputs.unet_name,
            [...inventory.unets, ...inventory.checkpoints],
            unetTier,
          );
          if (near) {
            record.inputs.unet_name = near;
          }
        }
      }
    }

    if (
      (classType === "CheckpointLoaderSimple" ||
        classType === "CheckpointLoader") &&
      resolvedCheckpoint
    ) {
      if (typeof record.inputs.ckpt_name === "string") {
        if (
          isPlaceholderFilename(record.inputs.ckpt_name) ||
          !matchNearMissInventoryFilename(
            record.inputs.ckpt_name,
            checkpointPool,
          )
        ) {
          record.inputs.ckpt_name = resolvedCheckpoint;
        } else {
          const near = matchNearMissInventoryFilename(
            record.inputs.ckpt_name,
            checkpointPool,
            unetTier,
          );
          if (near) {
            record.inputs.ckpt_name = near;
          }
        }
      }
    }

    if (classType === "VAELoader" && typeof record.inputs.vae_name === "string") {
      const matched = matchInventoryFilenamePreferTier(
        record.inputs.vae_name,
        vaePool,
        unetTier,
      );
      if (matched) {
        record.inputs.vae_name = matched;
      } else if (isPlaceholderFilename(record.inputs.vae_name)) {
        const suggested =
          SUGGESTED_MODEL_VAE_MAP[model] ?? SUGGESTED_MODEL_VAE_MAP.default;
        const fromInventory = matchNearMissInventoryFilename(
          suggested,
          vaePool,
          unetTier,
        );
        if (fromInventory) {
          record.inputs.vae_name = fromInventory;
        }
      }
    }

    if (classType === "CLIPLoader" && typeof record.inputs.clip_name === "string") {
      const matched = matchInventoryFilenamePreferTier(
        record.inputs.clip_name,
        clipPool,
        unetTier,
      );
      if (matched) {
        record.inputs.clip_name = matched;
      } else if (category === "qwen") {
        const fallback = pickPoolFilenamePreferTier(
          clipPool,
          [/qwen/i],
          unetTier,
        );
        if (fallback) {
          record.inputs.clip_name = fallback;
        }
      }
    }

    if (classType === "DualCLIPLoader") {
      if (kleinDual) {
        // Klein: both slots share one dual-CLIP stem — never fall back to Dev clip_l/t5.
        const matched =
          matchInventoryFilenamePreferTier(kleinDual, clipPool, unetTier) ??
          pickPoolFilenamePreferTier(clipPool, [/klein/i], unetTier);
        if (matched) {
          record.inputs.clip_name1 = matched;
          record.inputs.clip_name2 = matched;
        }
      } else {
        for (const field of ["clip_name1", "clip_name2"] as const) {
          const current = record.inputs[field];
          if (typeof current !== "string") {
            continue;
          }
          const matched = matchInventoryFilenamePreferTier(
            current,
            clipPool,
            unetTier,
          );
          if (matched) {
            record.inputs[field] = matched;
          }
        }
        // Prefer any clip_l / t5xxl if still missing after stem match.
        if (
          typeof record.inputs.clip_name1 === "string" &&
          !matchInventoryFilename(record.inputs.clip_name1, clipPool)
        ) {
          const clipL = pickPoolFilenamePreferTier(
            clipPool,
            [/clip_l/i],
            unetTier,
          );
          if (clipL) {
            record.inputs.clip_name1 = clipL;
          }
        }
        if (
          typeof record.inputs.clip_name2 === "string" &&
          !matchInventoryFilename(record.inputs.clip_name2, clipPool)
        ) {
          const t5 = pickPoolFilenamePreferTier(
            clipPool,
            [/t5xxl/i],
            unetTier,
          );
          if (t5) {
            record.inputs.clip_name2 = t5;
          }
        }
      }
    }
  }

  const lightningLora = isQwenLightningModel(model)
    ? pickLightningLoraFromInventory(model, inventory.loras)
    : undefined;

  return {
    workflowJson: JSON.stringify(graph, null, 2),
    lightningLora,
  };
}

export function pickLightningLoraFromInventory(
  model: ComfyImageModel | string,
  loras: string[],
): string | undefined {
  if (loras.length === 0) {
    return undefined;
  }
  const wantEdit = /edit/i.test(String(model));
  const want4 = /lightning-4/i.test(String(model));
  const want8 = /lightning-8/i.test(String(model));

  const candidates = loras.filter((name) => loraFilenameImpliesLightning(name));
  const scored = candidates
    .map((name) => {
      let score = 1;
      const lower = name.toLowerCase();
      if (wantEdit && /edit/i.test(lower)) {
        score += 4;
      }
      if (!wantEdit && !/edit/i.test(lower)) {
        score += 3;
      }
      if (wantEdit && !/edit/i.test(lower)) {
        score -= 5;
      }
      if (!wantEdit && /edit/i.test(lower)) {
        score -= 5;
      }
      if (want4 && /(4[\s-]?step|4steps)/i.test(lower)) {
        score += 2;
      }
      if (want8 && /(8[\s-]?step|8steps)/i.test(lower)) {
        score += 2;
      }
      return { name, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.name;
}

/** Seed queue params from family sampler + resolution presets for the active profile. */
export function buildSystemWorkflowQueueParams(
  model: ComfyImageModel,
  shared: SharedToolSettings,
): WorkflowParamValues {
  const profile = normalizeQueueQualityProfile(shared.queueQualityProfile);
  const presetTier = resolveEffectiveSamplerPreset(
    normalizeModelSamplerPresetTier(
      shared.modelSamplerPreset ?? DEFAULT_MODEL_SAMPLER_PRESET_TIER,
    ),
    profile,
  );
  const orientation = normalizeResolutionOrientation(
    shared.modelResolutionOrientation ?? DEFAULT_RESOLUTION_ORIENTATION,
  );
  const sizeTier = resolveEffectiveResolutionSizeTier(
    normalizeResolutionSizeTier(
      shared.modelResolutionSizeTier ?? DEFAULT_RESOLUTION_SIZE_TIER,
    ),
    profile,
  );

  return {
    ...resolveModelSamplerParams(model, presetTier),
    ...resolveModelResolutionParams(model, orientation, sizeTier),
    ...resolveModelSamplingParams(model, presetTier),
  };
}

/**
 * Inventory-aware loader maps for system queues. Does not persist to settings —
 * only enriches the runtime payload for this request.
 */
export function resolveSystemLoaderMaps(
  model: ComfyImageModel,
  shared: SharedToolSettings,
  inventory?: ComfyUiModelLists | null,
): {
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelUpscaleMap?: SharedToolSettings["modelUpscaleMap"];
} {
  const models = inventory ?? readCachedComfyObjectInfoModels();
  let modelCheckpointMap: ModelCheckpointMap = {
    ...(shared.modelCheckpointMap ?? {}),
  };
  let modelVaeMap: ModelVaeMap = { ...(shared.modelVaeMap ?? {}) };
  let modelUpscaleMap = shared.modelUpscaleMap;

  if (models) {
    const synced = syncLoaderMapsFromInventory({
      models,
      checkpointMap: modelCheckpointMap,
      vaeMap: modelVaeMap,
      upscaleMap: modelUpscaleMap,
      controlNetMap: shared.modelControlNetMap,
      healMissing: true,
    });
    modelCheckpointMap = synced.modelCheckpointMap;
    modelVaeMap = synced.modelVaeMap;
    modelUpscaleMap = synced.modelUpscaleMap;

    if (isVideoModel(model) && !modelCheckpointMap[model]?.trim()) {
      const picked = pickVideoCheckpointFromInventory(model, models.checkpoints);
      if (picked) {
        modelCheckpointMap = { ...modelCheckpointMap, [model]: picked };
      }
    }

    // Soft-fill this model from suggestions matched to live inventory.
    if (!modelCheckpointMap[model]?.trim()) {
      const matched = matchInventoryFilename(
        SUGGESTED_MODEL_CHECKPOINT_MAP[model],
        [...models.unets, ...models.checkpoints],
      );
      if (matched) {
        modelCheckpointMap = { ...modelCheckpointMap, [model]: matched };
      }
    }
    if (!modelVaeMap[model]?.trim()) {
      const matched = matchInventoryFilename(
        SUGGESTED_MODEL_VAE_MAP[model] ?? SUGGESTED_MODEL_VAE_MAP.default,
        models.vaes,
      );
      if (matched) {
        modelVaeMap = { ...modelVaeMap, [model]: matched };
      }
    }
  } else {
    // No inventory yet — still seed suggested stems so placeholders can bind.
    if (!modelCheckpointMap[model]?.trim() && SUGGESTED_MODEL_CHECKPOINT_MAP[model]) {
      modelCheckpointMap = {
        ...modelCheckpointMap,
        [model]: SUGGESTED_MODEL_CHECKPOINT_MAP[model]!,
      };
    }
    if (!modelVaeMap[model]?.trim()) {
      const suggested =
        SUGGESTED_MODEL_VAE_MAP[model] ?? SUGGESTED_MODEL_VAE_MAP.default;
      if (suggested) {
        modelVaeMap = { ...modelVaeMap, [model]: suggested };
      }
    }
  }

  return { modelCheckpointMap, modelVaeMap, modelUpscaleMap };
}

export type SystemWorkflowChoiceReason =
  | "pack"
  | "pack-repaired"
  | "i2v-pack"
  | "cold-start"
  | "missing-loaders"
  | "no-worthy-pack";

export type SystemWorkflowChoiceDescription = {
  source: SystemWorkflowSource;
  label: string;
  reason: SystemWorkflowChoiceReason;
  /** Full Graph: line for UI. */
  display: string;
};

/** True when Video tool has an I2V init image configured. */
export function videoInitImageConfigured(): boolean {
  try {
    const video = loadToolSettings("video", DEFAULT_VIDEO_TOOL_CACHE);
    return Boolean(video.initImageUrl?.trim());
  } catch {
    return false;
  }
}

function resolvePreferI2v(
  model: ComfyImageModel,
  options?: PickPackOptions,
): boolean {
  if (options?.preferI2v != null) {
    return options.preferI2v;
  }
  return isVideoModel(model) && videoInitImageConfigured();
}

export function describeSystemWorkflowChoice(
  model: ComfyImageModel,
  workflowFiles: ComfyWorkflowFile[],
  inventory?: ComfyUiModelLists | null,
  options?: PickPackOptions,
): SystemWorkflowChoiceDescription {
  if (!inventory) {
    return {
      source: "scaffold",
      label: "Built-in scaffold",
      reason: "cold-start",
      display: "Built-in scaffold · waiting for Comfy inventory",
    };
  }

  const preferI2v = resolvePreferI2v(model, options);
  const pack = pickPackWorkflowForModel(model, workflowFiles, inventory, {
    preferI2v,
  });
  if (pack) {
    const json = pack.file.workflowJson ?? "";
    const repaired = softRepairPackLoadersFromInventory(json, model, inventory);
    const label =
      pack.file.name.trim() || pack.file.filename?.trim() || pack.file.id;
    const isI2v = preferI2v && looksLikeI2vPackGraph(json);
    if (isI2v) {
      return {
        source: "pack",
        label,
        reason: "i2v-pack",
        display: `Pack · ${label} (I2V)`,
      };
    }
    if (repaired.repaired > 0) {
      return {
        source: "pack",
        label,
        reason: "pack-repaired",
        display: `Pack · ${label} (inventory soft-bound)`,
      };
    }
    return {
      source: "pack",
      label,
      reason: "pack",
      display: `Pack · ${label}`,
    };
  }

  const ranked = rankWorkflowFilesForModel(model, workflowFiles);
  const hasLoaderBlockedPack = ranked.some((entry) => {
    if (entry.score < SYSTEM_WORKFLOW_MIN_PACK_SCORE) {
      return false;
    }
    if (looksLikeAppScaffoldLabel(entry.file)) {
      return false;
    }
    const json = entry.file.workflowJson ?? "";
    if (!json.trim()) {
      return false;
    }
    try {
      const fingerprint = extractWorkflowStackFingerprint(json);
      if (fingerprint.isMixed) {
        return false;
      }
    } catch {
      return false;
    }
    return !packLoadersAvailableInInventory(json, inventory, model);
  });

  if (hasLoaderBlockedPack) {
    return {
      source: "scaffold",
      label: "Built-in scaffold",
      reason: "missing-loaders",
      display: "Built-in scaffold · pack loaders not installed",
    };
  }

  if (isLtxVideoModel(model)) {
    return {
      source: "scaffold",
      label: "Built-in scaffold",
      reason: "no-worthy-pack",
      display: "Built-in scaffold · LTX I2V needs pack",
    };
  }
  if (isVideoModel(model)) {
    return {
      source: "scaffold",
      label: "Built-in scaffold",
      reason: "no-worthy-pack",
      display: preferI2v
        ? "Built-in scaffold · prefer I2V pack"
        : "Built-in scaffold · prefer video pack for I2V",
    };
  }

  return {
    source: "scaffold",
    label: "Built-in scaffold",
    reason: "no-worthy-pack",
    display: "Built-in scaffold",
  };
}

export function resolveSystemWorkflowForModel(
  model: ComfyImageModel,
  shared: SharedToolSettings,
  workflowFiles: ComfyWorkflowFile[],
  inventory?: ComfyUiModelLists | null,
  options?: PickPackOptions,
): SystemWorkflowResolveResult {
  const models = inventory ?? readCachedComfyObjectInfoModels();
  const loaders = resolveSystemLoaderMaps(model, shared, models);
  const queueParams = buildSystemWorkflowQueueParams(model, shared);
  const preferI2v = resolvePreferI2v(model, options);
  const pack = pickPackWorkflowForModel(model, workflowFiles, models, {
    preferI2v,
  });

  if (pack) {
    const runtime = resolveSelectedWorkflowRuntime(pack.file.id);
    if (runtime?.workflowJson?.trim()) {
      const repaired = softRepairPackLoadersFromInventory(
        runtime.workflowJson,
        model,
        models,
      );
      const customTokens = softFillLightningTokenForGraph(
        model,
        repaired.workflowJson,
        [...(runtime.customTokens ?? [])],
        models,
      );
      return {
        workflowJson: repaired.workflowJson,
        source: "pack",
        workflowFileId: pack.file.id,
        workflowLabel:
          pack.file.name.trim() || pack.file.filename?.trim() || pack.file.id,
        queueParams,
        ...loaders,
        ...(customTokens.length ? { customTokens } : {}),
      };
    }
  }

  const scaffold = buildWorkflowScaffoldForModel(model);
  const bound = softBindScaffoldFromInventory(scaffold.json, model, models);
  const customTokens: CustomWorkflowToken[] = [];
  if (bound.lightningLora) {
    customTokens.push({
      token: "{{LORA_LIGHTNING}}",
      value: bound.lightningLora,
    });
  }

  const choice = describeSystemWorkflowChoice(
    model,
    workflowFiles,
    models,
    { preferI2v },
  );

  return {
    workflowJson: bound.workflowJson,
    source: "scaffold",
    workflowLabel: choice.display,
    queueParams,
    ...loaders,
    ...(customTokens.length ? { customTokens } : {}),
  };
}

function hasBoundLightningToken(tokens: CustomWorkflowToken[]): boolean {
  return tokens.some(
    (entry) =>
      entry.token.trim() === "{{LORA_LIGHTNING}}" && entry.value.trim(),
  );
}

/** Soft-fill {{LORA_LIGHTNING}} on pack graphs from live inventory when unset. */
function softFillLightningTokenForGraph(
  model: ComfyImageModel,
  workflowJson: string,
  tokens: CustomWorkflowToken[],
  inventory?: ComfyUiModelLists | null,
): CustomWorkflowToken[] {
  if (!isQwenLightningModel(model)) {
    return tokens;
  }
  if (hasBoundLightningToken(tokens)) {
    return tokens;
  }
  if (!workflowJson.includes("{{LORA_LIGHTNING}}")) {
    return tokens;
  }
  const picked = inventory?.loras?.length
    ? pickLightningLoraFromInventory(model, inventory.loras)
    : undefined;
  if (!picked) {
    return tokens;
  }
  return [
    ...tokens.filter((entry) => entry.token.trim() !== "{{LORA_LIGHTNING}}"),
    { token: "{{LORA_LIGHTNING}}", value: picked },
  ];
}

/** Merge system-workflow resolution into a queue runtime config. */
export function applySystemWorkflowToRuntime(
  model: ComfyImageModel,
  shared: SharedToolSettings,
  workflowFiles: ComfyWorkflowFile[],
  baseFlags: ComfyUiRuntimeConfig,
  inventory?: ComfyUiModelLists | null,
  options?: PickPackOptions,
): ComfyUiRuntimeConfig {
  const resolved = resolveSystemWorkflowForModel(
    model,
    shared,
    workflowFiles,
    inventory,
    options,
  );
  const profile = normalizeQueueQualityProfile(shared.queueQualityProfile);
  const isDraft = profile === "draft";
  const isMax = profile === "max";
  const isFinalOrMax = profile === "final" || isMax;

  return {
    ...baseFlags,
    workflowJson: resolved.workflowJson,
    workflowFileId: resolved.workflowFileId,
    queueParams: resolved.queueParams,
    modelCheckpointMap: resolved.modelCheckpointMap,
    modelVaeMap: resolved.modelVaeMap,
    ...(resolved.modelUpscaleMap
      ? { modelUpscaleMap: resolved.modelUpscaleMap }
      : {}),
    ...(resolved.customTokens?.length
      ? {
          customTokens: [
            ...(baseFlags.customTokens ?? []),
            ...resolved.customTokens,
          ],
        }
      : {}),
    queueQualityProfile: profile,
    systemWorkflowSource: resolved.source,
    systemWorkflowLabel: resolved.workflowLabel,
    syncWorkflowLoadersToModel: true,
    workflowQueueOptimize: true,
    // Draft stays lean (no enrich); Final/Max turn polish on.
    workflowGraphEnrich: !isDraft && shared.workflowGraphEnrich !== false,
    workflowSdxlRefinerEnrich:
      isFinalOrMax || shared.workflowSdxlRefinerEnrich !== false,
    workflowNeuralUpscalePolish:
      isMax || shared.workflowNeuralUpscalePolish !== false,
    workflowSharpenAfterUpscale: isMax
      ? shared.workflowSharpenAfterUpscale !== false
      : shared.workflowSharpenAfterUpscale === true,
  };
}
