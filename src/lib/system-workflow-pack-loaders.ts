import type { ComfyImageModel } from "./comfy-models/client";
import type { ComfyUiModelLists } from "./comfyui-object-info";
import {
  matchInventoryFilename,
  matchInventoryFilenameNearMiss,
} from "./loader-map-inventory-sync";
import { isQwenLightningModel } from "./model-sampling-patch";
import {
  isLoraLoaderClassType,
  loraFilenameImpliesLightning,
  pickLightningLoraFromInventory,
} from "./workflow-lora-patch";
import { repairQwenImageClipLoaderNodes } from "./workflow-qwen-clip-repair";

export { pickLightningLoraFromInventory } from "./workflow-lora-patch";

export type PackLoaderMiss = {
  kind: string;
  filename: string;
};

export type PackLoaderInspection = {
  ok: boolean;
  missing: PackLoaderMiss[];
  softDropLoras: PackLoaderMiss[];
  exactMatches: number;
  nearMissMatches: number;
};

type WorkflowNodeRecord = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

const PLACEHOLDER_PATTERN = /^\{\{[A-Z0-9_]+\}\}$/;

const EDIT_PACK_GRAPH_PATTERN =
  /TextEncodeQwenImageEdit|InpaintModelConditioning|LoadImageMask|IPAdapterAdvanced|IPAdapterModelLoader|SetLatentNoiseMask/;

const QWEN_EDIT_ENCODE_PATTERN =
  /TextEncodeQwenImageEdit(?:Plus)?/;

const I2V_PACK_GRAPH_PATTERN =
  /WanImageToVideo|WanCameraImageToVideo|HunyuanImageToVideo|LTXVImgToVideo/;

const POWER_LORA_CLASS = "Power Lora Loader (rgthree)";

function isPlaceholderFilename(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

/** Plain T2I packs may carry unused ControlNet/Upscale/CLIPVision — soft-miss those. */
function packAllowsSoftSecondaryLoaders(workflowJson: string): boolean {
  return (
    !EDIT_PACK_GRAPH_PATTERN.test(workflowJson) &&
    !I2V_PACK_GRAPH_PATTERN.test(workflowJson)
  );
}

function iteratePowerLoraSlots(
  inputs: Record<string, unknown>,
): { key: string; lora: string }[] {
  const slots: { key: string; lora: string }[] = [];
  for (const [key, value] of Object.entries(inputs)) {
    if (!/^lora_/i.test(key) || !value || typeof value !== "object") {
      continue;
    }
    const slot = value as { on?: boolean; lora?: unknown };
    if (slot.on === false) {
      continue;
    }
    if (
      typeof slot.lora === "string" &&
      slot.lora.trim() &&
      !isPlaceholderFilename(slot.lora)
    ) {
      slots.push({ key, lora: slot.lora.trim() });
    }
  }
  return slots;
}

function weightDtypeForUnetFilename(filename: string): string {
  if (/fp8/i.test(filename)) {
    return "fp8_e4m3fn";
  }
  return "default";
}

function getLinkedNodeId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }
  const id = value[0];
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function getLinkedSlot(value: unknown): number {
  if (!Array.isArray(value) || value.length < 2) {
    return 0;
  }
  const slot = Number(value[1]);
  return Number.isFinite(slot) ? slot : 0;
}

function isExactInventoryHit(filename: string, pool: string[]): boolean {
  const trimmed = filename.trim();
  if (!trimmed || pool.length === 0) {
    return false;
  }
  if (pool.includes(trimmed)) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  return pool.some((entry) => entry.toLowerCase() === lower);
}

function classifyFilename(
  filename: string,
  pool: string[],
): "exact" | "near" | "miss" {
  if (isExactInventoryHit(filename, pool)) {
    return "exact";
  }
  if (matchInventoryFilenameNearMiss(filename, pool)) {
    return "near";
  }
  // Stem-include via matchInventoryFilename also counts as near when not exact.
  if (matchInventoryFilename(filename, pool)) {
    return "near";
  }
  return "miss";
}

function emptyInspection(ok: boolean): PackLoaderInspection {
  return {
    ok,
    missing: [],
    softDropLoras: [],
    exactMatches: 0,
    nearMissMatches: 0,
  };
}

/**
 * Inspect concrete pack loaders against Comfy inventory.
 * Hard loaders must exact-or-near-miss; style LoRAs may soft-drop; Lightning may soft-fill.
 */
export function inspectPackLoadersInInventory(
  workflowJson: string,
  inventory?: ComfyUiModelLists | null,
  model?: ComfyImageModel | string,
): PackLoaderInspection {
  if (!inventory) {
    return emptyInspection(false);
  }

  let graph: Record<string, unknown>;
  try {
    graph = JSON.parse(workflowJson) as Record<string, unknown>;
  } catch {
    return emptyInspection(false);
  }

  const unetPool = [...inventory.unets, ...inventory.checkpoints];
  const clipPool = inventory.clips;
  const vaePool = inventory.vaes;
  const loraPool = inventory.loras;
  const controlNetPool = inventory.controlNets;
  const upscalePool = inventory.upscaleModels;
  const clipVisionPool = [...(inventory.clipVisions ?? []), ...inventory.clips];
  const checkpointPool =
    inventory.checkpoints.length > 0 ? inventory.checkpoints : unetPool;
  const lightningFallback =
    model && isQwenLightningModel(model)
      ? pickLightningLoraFromInventory(model, loraPool)
      : undefined;

  const missing: PackLoaderMiss[] = [];
  const softDropLoras: PackLoaderMiss[] = [];
  let exactMatches = 0;
  let nearMissMatches = 0;
  const softSecondary = packAllowsSoftSecondaryLoaders(workflowJson);

  const noteRequired = (kind: string, filename: unknown, pool: string[]) => {
    if (typeof filename !== "string" || !filename.trim()) {
      return;
    }
    if (isPlaceholderFilename(filename)) {
      return;
    }
    const status = classifyFilename(filename, pool);
    if (status === "exact") {
      exactMatches += 1;
      return;
    }
    if (status === "near") {
      nearMissMatches += 1;
      return;
    }
    missing.push({ kind, filename: filename.trim() });
  };

  const noteSoftOptional = (kind: string, filename: unknown, pool: string[]) => {
    if (typeof filename !== "string" || !filename.trim()) {
      return;
    }
    if (isPlaceholderFilename(filename)) {
      return;
    }
    const status = classifyFilename(filename, pool);
    if (status === "exact") {
      exactMatches += 1;
      return;
    }
    if (status === "near") {
      nearMissMatches += 1;
      return;
    }
    softDropLoras.push({ kind, filename: filename.trim() });
  };

  const noteLoraFilename = (loraName: string) => {
    const status = classifyFilename(loraName, loraPool);
    if (status === "exact") {
      exactMatches += 1;
      return;
    }
    if (status === "near") {
      nearMissMatches += 1;
      return;
    }
    if (loraFilenameImpliesLightning(loraName)) {
      if (lightningFallback) {
        nearMissMatches += 1;
        return;
      }
      missing.push({ kind: "LoRA", filename: loraName.trim() });
      return;
    }
    softDropLoras.push({ kind: "LoRA", filename: loraName.trim() });
  };

  for (const node of Object.values(graph)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as WorkflowNodeRecord;
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }
    const classType = record.class_type ?? "";

    if (classType === "UNETLoader" || classType === "UnetLoaderGGUF") {
      noteRequired("UNET", inputs.unet_name, unetPool);
    }
    if (classType === "CheckpointLoaderSimple" || classType === "CheckpointLoader") {
      noteRequired("Checkpoint", inputs.ckpt_name, checkpointPool);
    }
    if (classType === "VAELoader") {
      noteRequired("VAE", inputs.vae_name, vaePool);
    }
    if (classType === "CLIPLoader" || classType === "DualCLIPLoader") {
      for (const field of ["clip_name", "clip_name1", "clip_name2"] as const) {
        noteRequired("CLIP", inputs[field], clipPool);
      }
    }
    if (
      classType === "ControlNetLoader" ||
      classType === "DiffControlNetLoader"
    ) {
      (softSecondary ? noteSoftOptional : noteRequired)(
        "ControlNet",
        inputs.control_net_name,
        controlNetPool,
      );
    }
    if (classType === "UpscaleModelLoader" || classType === "UpscaleModel") {
      (softSecondary ? noteSoftOptional : noteRequired)(
        "Upscale",
        inputs.model_name,
        upscalePool,
      );
    }
    if (classType === "CLIPVisionLoader") {
      (softSecondary ? noteSoftOptional : noteRequired)(
        "CLIPVision",
        inputs.clip_name,
        clipVisionPool,
      );
    }
    if (isLoraLoaderClassType(classType) && classType !== POWER_LORA_CLASS) {
      const loraName = inputs.lora_name;
      if (
        typeof loraName !== "string" ||
        !loraName.trim() ||
        isPlaceholderFilename(loraName)
      ) {
        continue;
      }
      noteLoraFilename(loraName);
    }
    if (classType === POWER_LORA_CLASS) {
      for (const slot of iteratePowerLoraSlots(inputs)) {
        noteLoraFilename(slot.lora);
      }
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    softDropLoras,
    exactMatches,
    nearMissMatches,
  };
}

/** True when every hard loader is exact-or-near-miss present (style LoRAs may soft-drop). */
export function packLoadersAvailableInInventory(
  workflowJson: string,
  inventory?: ComfyUiModelLists | null,
  model?: ComfyImageModel | string,
): boolean {
  return inspectPackLoadersInInventory(workflowJson, inventory, model).ok;
}

/** Fitness for re-ranking pack candidates: exact ≫ near ≫ soft-drop; hard-miss → -1000. */
export function packInventoryFitness(
  workflowJson: string,
  inventory: ComfyUiModelLists | null | undefined,
  model?: ComfyImageModel | string,
): number {
  const inspection = inspectPackLoadersInInventory(
    workflowJson,
    inventory,
    model,
  );
  if (!inspection.ok) {
    return -1000;
  }
  return (
    inspection.exactMatches * 10 +
    inspection.nearMissMatches * 2 -
    inspection.softDropLoras.length * 3
  );
}

export function looksLikeEditPackGraph(workflowJson: string): boolean {
  return EDIT_PACK_GRAPH_PATTERN.test(workflowJson);
}

/** Multi-ref Compose: Qwen edit encode + at least two LoadImage nodes (or Figure/Image 2). */
export function looksLikeMultiRefEditPackGraph(workflowJson: string): boolean {
  if (!QWEN_EDIT_ENCODE_PATTERN.test(workflowJson)) {
    return false;
  }
  if (/\b(?:Figure|Image|Ref|Photo|Picture)\s*2\b/i.test(workflowJson)) {
    return true;
  }
  if (/"image2"\s*:/.test(workflowJson)) {
    return true;
  }
  const loadImageMatches = workflowJson.match(/"class_type"\s*:\s*"LoadImage(?:Output)?"/g);
  return (loadImageMatches?.length ?? 0) >= 2;
}

export function formatPackLoaderMisses(
  missing: PackLoaderMiss[],
  max = 3,
): string {
  if (missing.length === 0) {
    return "";
  }
  const shown = missing.slice(0, Math.max(0, max));
  const parts = shown.map((entry) => `${entry.kind}: ${entry.filename}`);
  const overflow = missing.length - shown.length;
  if (overflow > 0) {
    return `${parts.join("; ")}…`;
  }
  return parts.join("; ");
}

function rewriteFilename(
  current: unknown,
  pool: string[],
): string | undefined {
  if (typeof current !== "string" || !current.trim()) {
    return undefined;
  }
  if (isPlaceholderFilename(current)) {
    return undefined;
  }
  const matched = matchInventoryFilenameNearMiss(current, pool);
  if (matched && matched !== current) {
    return matched;
  }
  return undefined;
}

function rewireAndDeleteLoraNode(
  graph: Record<string, unknown>,
  nodeId: string,
  record: WorkflowNodeRecord,
): void {
  const modelUpstream = record.inputs?.model;
  const clipUpstream = record.inputs?.clip;

  for (const [consumerId, node] of Object.entries(graph)) {
    if (consumerId === nodeId || !node || typeof node !== "object") {
      continue;
    }
    const consumer = node as WorkflowNodeRecord;
    if (!consumer.inputs) {
      continue;
    }
    for (const [key, value] of Object.entries(consumer.inputs)) {
      if (getLinkedNodeId(value) !== nodeId) {
        continue;
      }
      const slot = getLinkedSlot(value);
      if (slot === 1 && clipUpstream !== undefined) {
        consumer.inputs[key] = clipUpstream;
      } else if (modelUpstream !== undefined) {
        consumer.inputs[key] = modelUpstream;
      }
    }
  }

  delete graph[nodeId];
}

/**
 * Rewrite near-miss pack loaders, Lightning soft-fill, soft-drop missing style LoRAs,
 * DualCLIP→CLIPLoader for Qwen, Power Lora slot disable, and GGUF class switch.
 */
export function softRepairPackLoadersFromInventory(
  workflowJson: string,
  model: ComfyImageModel,
  inventory?: ComfyUiModelLists | null,
): { workflowJson: string; repaired: number; droppedLoras: string[] } {
  if (!inventory) {
    return { workflowJson, repaired: 0, droppedLoras: [] };
  }

  let graph: Record<string, unknown>;
  try {
    graph = JSON.parse(workflowJson) as Record<string, unknown>;
  } catch {
    return { workflowJson, repaired: 0, droppedLoras: [] };
  }

  const clipRepair = repairQwenImageClipLoaderNodes(graph);
  graph = clipRepair.workflow;
  let repaired = clipRepair.repairedNodeIds.length;

  // FLUX.2 Klein: DualCLIP type "flux" → CLIPLoader type "flux2" (shape mismatch otherwise).
  if (/flux-2-klein/i.test(String(model))) {
    const want9b = /9b/i.test(String(model));
    const preferred =
      want9b
        ? matchInventoryFilenameNearMiss(
            "qwen_3_8b_fp8mixed.safetensors",
            inventory.clips,
          ) ??
          matchInventoryFilenameNearMiss(
            "flux2-klein-9b-uncensored.safetensors",
            inventory.clips,
          )
        : matchInventoryFilenameNearMiss(
            "qwen_3_4b.safetensors",
            inventory.clips,
          ) ??
          matchInventoryFilenameNearMiss(
            "flux2-klein-4b.safetensors",
            inventory.clips,
          );
    for (const [, node] of Object.entries(graph)) {
      if (!node || typeof node !== "object") {
        continue;
      }
      const record = node as WorkflowNodeRecord;
      if (!record.inputs) {
        continue;
      }
      if (record.class_type === "DualCLIPLoader") {
        const fromSlot =
          typeof record.inputs.clip_name1 === "string"
            ? record.inputs.clip_name1
            : typeof record.inputs.clip_name2 === "string"
              ? record.inputs.clip_name2
              : preferred;
        const clipName =
          (typeof fromSlot === "string"
            ? matchInventoryFilenameNearMiss(fromSlot, inventory.clips)
            : undefined) ??
          preferred ??
          (want9b
            ? "qwen_3_8b_fp8mixed.safetensors"
            : "qwen_3_4b.safetensors");
        record.class_type = "CLIPLoader";
        record.inputs = { clip_name: clipName, type: "flux2" };
        if (record._meta?.title) {
          record._meta.title = record._meta.title.replace(/DualCLIP/i, "CLIP");
        }
        repaired += 1;
      } else if (record.class_type === "CLIPLoader") {
        const currentType =
          typeof record.inputs.type === "string" ? record.inputs.type : "";
        if (currentType !== "flux2") {
          record.inputs.type = "flux2";
          repaired += 1;
        }
        if (preferred && typeof record.inputs.clip_name === "string") {
          const matched =
            matchInventoryFilenameNearMiss(
              record.inputs.clip_name,
              inventory.clips,
            ) ?? preferred;
          if (matched !== record.inputs.clip_name) {
            record.inputs.clip_name = matched;
            repaired += 1;
          }
        }
      }
    }
  }

  const unetPool = [...inventory.unets, ...inventory.checkpoints];
  const clipPool = inventory.clips;
  const vaePool = inventory.vaes;
  const loraPool = inventory.loras;
  const controlNetPool = inventory.controlNets;
  const upscalePool = inventory.upscaleModels;
  const clipVisionPool = [...(inventory.clipVisions ?? []), ...inventory.clips];
  const checkpointPool =
    inventory.checkpoints.length > 0 ? inventory.checkpoints : unetPool;
  const lightningLora = isQwenLightningModel(model)
    ? pickLightningLoraFromInventory(model, loraPool)
    : undefined;

  const droppedLoras: string[] = [];
  const loraNodesToDrop: string[] = [];

  for (const [nodeId, node] of Object.entries(graph)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as WorkflowNodeRecord;
    if (!record.inputs) {
      continue;
    }
    const classType = record.class_type ?? "";

    if (classType === "UNETLoader" || classType === "UnetLoaderGGUF") {
      const next = rewriteFilename(record.inputs.unet_name, unetPool);
      if (next) {
        record.inputs.unet_name = next;
        repaired += 1;
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
      const next = rewriteFilename(record.inputs.ckpt_name, checkpointPool);
      if (next) {
        record.inputs.ckpt_name = next;
        repaired += 1;
      }
    }
    if (classType === "VAELoader") {
      const next = rewriteFilename(record.inputs.vae_name, vaePool);
      if (next) {
        record.inputs.vae_name = next;
        repaired += 1;
      }
    }
    if (classType === "CLIPLoader" || classType === "DualCLIPLoader") {
      for (const field of ["clip_name", "clip_name1", "clip_name2"] as const) {
        const next = rewriteFilename(record.inputs[field], clipPool);
        if (next) {
          record.inputs[field] = next;
          repaired += 1;
        }
      }
    }
    if (
      classType === "ControlNetLoader" ||
      classType === "DiffControlNetLoader"
    ) {
      const next = rewriteFilename(record.inputs.control_net_name, controlNetPool);
      if (next) {
        record.inputs.control_net_name = next;
        repaired += 1;
      }
    }
    if (classType === "UpscaleModelLoader" || classType === "UpscaleModel") {
      const next = rewriteFilename(record.inputs.model_name, upscalePool);
      if (next) {
        record.inputs.model_name = next;
        repaired += 1;
      }
    }
    if (classType === "CLIPVisionLoader") {
      const next = rewriteFilename(record.inputs.clip_name, clipVisionPool);
      if (next) {
        record.inputs.clip_name = next;
        repaired += 1;
      }
    }
    if (isLoraLoaderClassType(classType) && classType !== POWER_LORA_CLASS) {
      const current = record.inputs.lora_name;
      if (typeof current !== "string" || isPlaceholderFilename(current)) {
        continue;
      }
      const inInventory = matchInventoryFilenameNearMiss(current, loraPool);
      if (inInventory && inInventory !== current) {
        record.inputs.lora_name = inInventory;
        repaired += 1;
        continue;
      }
      if (inInventory) {
        if (lightningLora && loraFilenameImpliesLightning(current)) {
          const wantEdit = /edit/i.test(String(model));
          const currentIsEdit = /edit/i.test(current);
          const mismatchedFamily =
            (wantEdit && !currentIsEdit) || (!wantEdit && currentIsEdit);
          if (mismatchedFamily && current !== lightningLora) {
            record.inputs.lora_name = lightningLora;
            repaired += 1;
          }
        }
        continue;
      }
      if (lightningLora && loraFilenameImpliesLightning(current)) {
        if (current !== lightningLora) {
          record.inputs.lora_name = lightningLora;
          repaired += 1;
        }
        continue;
      }
      if (!loraFilenameImpliesLightning(current)) {
        loraNodesToDrop.push(nodeId);
        droppedLoras.push(current.trim());
      }
    }
    if (classType === POWER_LORA_CLASS) {
      for (const slot of iteratePowerLoraSlots(record.inputs)) {
        const current = slot.lora;
        const entry = record.inputs[slot.key];
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const slotRecord = entry as {
          on?: boolean;
          lora?: string;
          strength?: number;
          strengthTwo?: number | null;
        };
        const inInventory = matchInventoryFilenameNearMiss(current, loraPool);
        if (inInventory && inInventory !== current) {
          slotRecord.lora = inInventory;
          repaired += 1;
          continue;
        }
        if (inInventory) {
          if (lightningLora && loraFilenameImpliesLightning(current)) {
            const wantEdit = /edit/i.test(String(model));
            const currentIsEdit = /edit/i.test(current);
            const mismatchedFamily =
              (wantEdit && !currentIsEdit) || (!wantEdit && currentIsEdit);
            if (mismatchedFamily && current !== lightningLora) {
              slotRecord.lora = lightningLora;
              repaired += 1;
            }
          }
          continue;
        }
        if (lightningLora && loraFilenameImpliesLightning(current)) {
          if (current !== lightningLora) {
            slotRecord.lora = lightningLora;
            repaired += 1;
          }
          continue;
        }
        if (!loraFilenameImpliesLightning(current)) {
          slotRecord.on = false;
          droppedLoras.push(current.trim());
          repaired += 1;
        }
      }
    }
  }

  for (const nodeId of loraNodesToDrop) {
    const node = graph[nodeId];
    if (!node || typeof node !== "object") {
      continue;
    }
    rewireAndDeleteLoraNode(graph, nodeId, node as WorkflowNodeRecord);
    repaired += 1;
  }

  const changed = repaired > 0 || droppedLoras.length > 0;
  return {
    workflowJson: changed ? JSON.stringify(graph, null, 2) : workflowJson,
    repaired,
    droppedLoras,
  };
}
