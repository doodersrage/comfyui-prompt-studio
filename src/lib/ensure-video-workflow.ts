import {
  upsertComfyWorkflowFile,
  loadComfyWorkflowFiles,
  type ComfyWorkflowFile,
} from "./comfyui-workflow-files";
import {
  assignWorkflowToInferredModels,
  resolveWorkflowForModel,
} from "./model-workflow-map";
import {
  buildWorkflowScaffoldForModel,
  suggestedScaffoldName,
} from "./workflow-scaffold";
import {
  loadSettingsCache,
  saveSharedSettings,
  type SharedToolSettings,
} from "./settings-cache";
import {
  DEFAULT_VIDEO_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
} from "./comfy-models/client";
import {
  DEFAULT_CHECKPOINT_TOKEN,
  SUGGESTED_MODEL_CHECKPOINT_MAP,
} from "./model-checkpoint-map";
import { matchInventoryFilename } from "./loader-map-inventory-sync";
import type { ComfyUiModelLists } from "./comfyui-object-info";

export type EnsureVideoWorkflowResult = {
  created: boolean;
  assigned: boolean;
  workflow: ComfyWorkflowFile;
  model: ComfyImageModel;
  /** Full shared patch to apply in React state (avoids clobbering the map). */
  sharedPatch: Partial<SharedToolSettings>;
  checkpointFilename?: string;
  checkpointNote?: string;
};

function looksLikeVideoScaffold(file: ComfyWorkflowFile): boolean {
  const json = file.workflowJson ?? "";
  if (
    json.includes("EmptyHunyuanLatentVideo") ||
    json.includes("EmptyLTXVLatentVideo") ||
    json.includes("WanImageToVideo") ||
    json.includes("HunyuanImageToVideo")
  ) {
    return true;
  }
  return /video|wan|hunyuan/i.test(`${file.name} ${file.filename ?? ""}`);
}

function findReusableVideoWorkflow(
  files: ComfyWorkflowFile[],
  model: ComfyImageModel,
): ComfyWorkflowFile | undefined {
  const preferredName = suggestedScaffoldName(model, "template").toLowerCase();
  const byName = files.find((file) => file.name.trim().toLowerCase() === preferredName);
  if (byName) {
    return byName;
  }
  return files.find((file) => looksLikeVideoScaffold(file));
}

function inventoryHasVideoWeight(
  filename: string | undefined,
  inventory?: ComfyUiModelLists | null,
): boolean {
  const trimmed = filename?.trim();
  if (!trimmed || !inventory) {
    return false;
  }
  const pool = [...(inventory.checkpoints ?? []), ...(inventory.unets ?? [])];
  if (pool.length === 0) {
    return false;
  }
  return Boolean(matchInventoryFilename(trimmed, pool));
}

function videoWeightPool(inventory?: ComfyUiModelLists | null): string[] {
  if (!inventory) {
    return [];
  }
  return [...(inventory.checkpoints ?? []), ...(inventory.unets ?? [])];
}

/** Score WAN/Hunyuan/LTX candidates so 2.2 / 14B beat older 2.1 / 1.3B defaults. */
function scoreVideoWeightFilename(
  model: ComfyImageModel | string,
  filename: string,
): number {
  const lower = filename.toLowerCase();
  let score = 0;
  if (model === "hunyuan-video") {
    if (/hunyuan|hy[-_]?video/.test(lower)) score += 100;
  } else if (model === "ltx-video") {
    if (/ltx/.test(lower)) score += 100;
  } else if (/wan/.test(lower)) {
    score += 100;
  }
  const version = /(?:wan|ltx|hunyuan)[^\d]*(\d+(?:\.\d+)?)/i.exec(filename);
  if (version?.[1]) {
    score += Number.parseFloat(version[1]) * 20;
  }
  const billions = /(\d+(?:\.\d+)?)\s*b\b/i.exec(filename);
  if (billions?.[1]) {
    score += Number.parseFloat(billions[1]);
  }
  if (/high[_\s-]?noise/i.test(filename)) score += 2;
  if (/t2v/i.test(filename)) score += 1;
  if (/fp8/i.test(filename)) score -= 0.5;
  return score;
}

/** Prefer installed WAN/Hunyuan/LTX weights for the video scaffold loader. */
export function pickVideoCheckpointFromInventory(
  model: ComfyImageModel | string,
  inventory: string[],
): string | undefined {
  if (inventory.length === 0) {
    return undefined;
  }
  const preferredPatterns =
    model === "hunyuan-video"
      ? [/hunyuan/i, /hy[-_]?video/i, /wan/i, /ltx/i]
      : model === "ltx-video"
        ? [/ltx/i, /wan/i, /hunyuan/i]
        : [/wan/i, /hunyuan/i, /hy[-_]?video/i, /ltx/i];

  const matched = inventory.filter((name) =>
    preferredPatterns.some((pattern) => pattern.test(name)),
  );
  if (matched.length > 0) {
    return matched
      .slice()
      .sort(
        (a, b) =>
          scoreVideoWeightFilename(model, b) - scoreVideoWeightFilename(model, a),
      )[0];
  }

  const hinted =
    getComfyModelDefinition(model)?.checkpointHint ??
    SUGGESTED_MODEL_CHECKPOINT_MAP[model];
  // Only return a suggested name when that exact weight is installed.
  return matchInventoryFilename(hinted, inventory);
}

function resolveVideoCheckpointFilename(input: {
  model: ComfyImageModel;
  sharedCheckpointMap?: SharedToolSettings["modelCheckpointMap"];
  inventory?: ComfyUiModelLists | null;
}): { filename?: string; note?: string; clearInvalid?: boolean } {
  const pool = videoWeightPool(input.inventory);
  const hasInventory = pool.length > 0;
  const mapped = input.sharedCheckpointMap?.[input.model]?.trim();

  if (mapped) {
    if (!hasInventory || inventoryHasVideoWeight(mapped, input.inventory)) {
      const resolved = hasInventory
        ? matchInventoryFilename(mapped, pool) ?? mapped
        : mapped;
      return { filename: resolved };
    }
    // Mapped file is not in checkpoints or UNETs — fall through to pick a better one.
  }

  if (!hasInventory) {
    return {
      note: "Connect ComfyUI to auto-map a video weight, or set Settings → checkpoint map for wan-video.",
    };
  }

  const fromInventory = pickVideoCheckpointFromInventory(input.model, pool);
  if (fromInventory) {
    return {
      filename: fromInventory,
      note: `Mapped {{CHECKPOINT}} → ${fromInventory} from ComfyUI checkpoints/UNETs.`,
    };
  }

  const hinted =
    getComfyModelDefinition(input.model)?.checkpointHint ??
    SUGGESTED_MODEL_CHECKPOINT_MAP[input.model];
  return {
    clearInvalid: true,
    note: hinted
      ? `No WAN/Hunyuan/LTX weight installed in ComfyUI (need something like “${hinted}” under models/checkpoints or models/diffusion_models). Your current loaders are image models only.`
      : "No WAN/Hunyuan/LTX weight installed in ComfyUI models/checkpoints or models/diffusion_models.",
  };
}

function withCheckpointToken(
  workflow: ComfyWorkflowFile,
  filename: string | undefined,
  clearInvalid: boolean,
): ComfyWorkflowFile {
  const others = (workflow.customTokens ?? []).filter(
    (token) => token.token.trim() !== DEFAULT_CHECKPOINT_TOKEN,
  );
  const existing = (workflow.customTokens ?? []).find(
    (token) => token.token.trim() === DEFAULT_CHECKPOINT_TOKEN,
  );
  const existingValue = existing?.value?.trim();

  if (filename) {
    if (existingValue === filename) {
      return workflow;
    }
    return upsertComfyWorkflowFile({
      ...workflow,
      customTokens: [...others, { token: DEFAULT_CHECKPOINT_TOKEN, value: filename }],
    });
  }

  if (clearInvalid && existingValue) {
    return upsertComfyWorkflowFile({
      ...workflow,
      customTokens: others,
    });
  }

  return workflow;
}

/**
 * Ensure a video scaffold exists and is mapped for the given video model
 * (default `wan-video`). Idempotent when a map entry or existing scaffold resolves.
 * When `inventory` is provided, accepts weights from checkpoints or UNETs
 * (WAN 2.2 diffusion models often live under models/diffusion_models).
 */
export function ensureVideoWorkflowScaffold(
  model: ComfyImageModel = DEFAULT_VIDEO_MODEL,
  options?: {
    overwriteMap?: boolean;
    inventory?: ComfyUiModelLists | null;
  },
): EnsureVideoWorkflowResult {
  const shared = loadSettingsCache().shared;
  const files = loadComfyWorkflowFiles();
  const existingId = resolveWorkflowForModel(model, shared.modelWorkflowMap);

  let workflow: ComfyWorkflowFile | undefined;
  let created = false;

  if (existingId?.trim() && !options?.overwriteMap) {
    workflow = files.find((file) => file.id === existingId);
  }

  // User already mapped this model to a real library workflow — don't steal the
  // picker or reassign wan/hunyuan/ltx to a scaffold.
  if (workflow && existingId?.trim() && !options?.overwriteMap) {
    const existingMapped = shared.modelCheckpointMap?.[model]?.trim();
    const existingMappedValid =
      Boolean(existingMapped) &&
      inventoryHasVideoWeight(existingMapped, options?.inventory);
    const checkpoint = resolveVideoCheckpointFilename({
      model,
      sharedCheckpointMap: shared.modelCheckpointMap,
      inventory: options?.inventory,
    });
    const nextCheckpointMap = { ...(shared.modelCheckpointMap ?? {}) };
    const pool = videoWeightPool(options?.inventory);
    if (checkpoint.filename) {
      if (!existingMappedValid) {
        nextCheckpointMap[model] = checkpoint.filename;
      } else if (existingMapped) {
        nextCheckpointMap[model] =
          matchInventoryFilename(existingMapped, pool) ?? existingMapped;
      }
    }
    workflow = withCheckpointToken(
      workflow,
      nextCheckpointMap[model]?.trim() || checkpoint.filename,
      checkpoint.clearInvalid === true,
    );
    const sharedPatch: Partial<SharedToolSettings> = {
      model,
      modelCheckpointMap: nextCheckpointMap,
    };
    // Only force the picker when nothing is selected yet.
    if (!shared.selectedWorkflowFileId?.trim()) {
      sharedPatch.selectedWorkflowFileId = workflow.id;
    }
    saveSharedSettings({
      ...shared,
      ...sharedPatch,
    });
    return {
      created: false,
      assigned: true,
      workflow,
      model,
      sharedPatch,
      checkpointFilename:
        nextCheckpointMap[model]?.trim() || checkpoint.filename,
      checkpointNote: checkpoint.note,
    };
  }

  if (!workflow) {
    workflow = findReusableVideoWorkflow(files, model);
  }
  if (!workflow) {
    const scaffold = buildWorkflowScaffoldForModel(model);
    workflow = upsertComfyWorkflowFile({
      name: suggestedScaffoldName(model, "template"),
      workflowJson: scaffold.json,
    });
    created = true;
  }

  const existingMapped = shared.modelCheckpointMap?.[model]?.trim();
  const existingMappedValid =
    Boolean(existingMapped) &&
    inventoryHasVideoWeight(existingMapped, options?.inventory);

  const checkpoint = resolveVideoCheckpointFilename({
    model,
    sharedCheckpointMap: shared.modelCheckpointMap,
    inventory: options?.inventory,
  });

  workflow = withCheckpointToken(
    workflow,
    checkpoint.filename,
    checkpoint.clearInvalid === true,
  );

  const nextMap = assignWorkflowToInferredModels(
    workflow.id,
    // Only claim the active model when creating/filling — don't overwrite sibling
    // video model assignments the user already set in the library.
    [model],
    shared.modelWorkflowMap,
    options?.overwriteMap === true,
  );

  const nextCheckpointMap = { ...(shared.modelCheckpointMap ?? {}) };
  const pool = videoWeightPool(options?.inventory);
  const hasInventory = pool.length > 0;

  // Keep a valid user assignment. Only write when empty, invalid, or ensure picked
  // a different installed weight (e.g. first-time auto-map).
  if (checkpoint.filename) {
    if (!existingMappedValid || options?.overwriteMap) {
      nextCheckpointMap[model] = checkpoint.filename;
    } else if (existingMapped) {
      nextCheckpointMap[model] =
        matchInventoryFilename(existingMapped, pool) ?? existingMapped;
    }
    if (model === "wan-video" && !nextCheckpointMap["hunyuan-video"]?.trim()) {
      const hunyuan = pickVideoCheckpointFromInventory("hunyuan-video", pool);
      if (hunyuan) {
        nextCheckpointMap["hunyuan-video"] = hunyuan;
      }
    }
  } else if (checkpoint.clearInvalid && hasInventory) {
    delete nextCheckpointMap[model];
    const hunyuanMapped = nextCheckpointMap["hunyuan-video"]?.trim();
    if (
      hunyuanMapped &&
      !inventoryHasVideoWeight(hunyuanMapped, options?.inventory)
    ) {
      delete nextCheckpointMap["hunyuan-video"];
    }
  }

  const sharedPatch: Partial<SharedToolSettings> = {
    model,
    selectedWorkflowFileId: workflow.id,
    modelWorkflowMap: nextMap,
    modelCheckpointMap: nextCheckpointMap,
  };
  saveSharedSettings({
    ...shared,
    ...sharedPatch,
  });

  return {
    created,
    assigned: true,
    workflow,
    model,
    sharedPatch,
    checkpointFilename:
      nextCheckpointMap[model]?.trim() || checkpoint.filename,
    checkpointNote: checkpoint.note,
  };
}
