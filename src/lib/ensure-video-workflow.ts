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

function inventoryHasCheckpoint(
  filename: string | undefined,
  checkpoints: string[],
): boolean {
  const trimmed = filename?.trim();
  if (!trimmed || checkpoints.length === 0) {
    return false;
  }
  return Boolean(matchInventoryFilename(trimmed, checkpoints));
}

/** Prefer installed WAN/Hunyuan weights for the video scaffold CheckpointLoader. */
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

  for (const pattern of preferredPatterns) {
    const hit = inventory.find((name) => pattern.test(name));
    if (hit) {
      return hit;
    }
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
  const checkpoints = input.inventory?.checkpoints ?? [];
  const hasInventory = checkpoints.length > 0;
  const mapped = input.sharedCheckpointMap?.[input.model]?.trim();

  if (mapped) {
    if (!hasInventory || inventoryHasCheckpoint(mapped, checkpoints)) {
      return { filename: mapped };
    }
    // Mapped file is not loadable by CheckpointLoaderSimple — drop it.
  }

  if (!hasInventory) {
    return {
      note: "Connect ComfyUI to auto-map a video checkpoint, or set Settings → checkpoint map for wan-video.",
    };
  }

  const fromInventory = pickVideoCheckpointFromInventory(input.model, checkpoints);
  if (fromInventory) {
    return {
      filename: fromInventory,
      note: `Mapped {{CHECKPOINT}} → ${fromInventory} from ComfyUI checkpoints.`,
    };
  }

  const hinted =
    getComfyModelDefinition(input.model)?.checkpointHint ??
    SUGGESTED_MODEL_CHECKPOINT_MAP[input.model];
  return {
    clearInvalid: true,
    note: hinted
      ? `No WAN/Hunyuan checkpoint installed in ComfyUI (need something like “${hinted}” under models/checkpoints). Your current checkpoints are image models only.`
      : "No WAN/Hunyuan checkpoint installed in ComfyUI models/checkpoints.",
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
 * When `inventory` is provided, only maps checkpoints that CheckpointLoaderSimple can load.
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
    [model, "wan-video", "hunyuan-video", "ltx-video"],
    shared.modelWorkflowMap,
    options?.overwriteMap === true,
  );

  const nextCheckpointMap = { ...(shared.modelCheckpointMap ?? {}) };
  const checkpoints = options?.inventory?.checkpoints ?? [];
  const hasInventory = checkpoints.length > 0;

  if (checkpoint.filename) {
    nextCheckpointMap[model] = checkpoint.filename;
    if (model === "wan-video" && !nextCheckpointMap["hunyuan-video"]?.trim()) {
      const hunyuan = pickVideoCheckpointFromInventory("hunyuan-video", checkpoints);
      if (hunyuan) {
        nextCheckpointMap["hunyuan-video"] = hunyuan;
      }
    }
  } else if (checkpoint.clearInvalid && hasInventory) {
    delete nextCheckpointMap[model];
    const hunyuanMapped = nextCheckpointMap["hunyuan-video"]?.trim();
    if (hunyuanMapped && !inventoryHasCheckpoint(hunyuanMapped, checkpoints)) {
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
    checkpointFilename: checkpoint.filename,
    checkpointNote: checkpoint.note,
  };
}
