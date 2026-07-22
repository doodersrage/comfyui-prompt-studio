import {
  isQwenLightningModel,
  QWEN_LIGHTNING_SHIFT_DEFAULT,
} from "./model-sampling-patch";
import { isEditCapableModel } from "./model-denoise-defaults";
import {
  filenameLooksLikeCheckpointOnly,
  type ModelLoaderFilenames,
} from "./model-checkpoint-map";
import type { WorkflowParamValues } from "./comfyui-config";
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  ensureLightningNativeResolutionParams,
} from "./model-resolution-defaults";
import {
  precisionHintFromFilename,
  qwen2512UnetFilename,
  qwenDualClipFilename,
  qwenEdit2509UnetFilename,
  qwenEdit2511UnetFilename,
  qwenUnetFamilyFromFilename,
} from "./model-loader-precision";
import {
  isLatentSizeNode,
  normalizeEmptyLatentForModel,
  patchLoaderNodesInWorkflow,
} from "./workflow-direct-patch";
import { isPromptStudioOutputUpscaleNode } from "./workflow-enrich-markers";
import {
  isLoraLoaderClassType,
  loraFilenameImpliesLightning,
  loraNameImpliesLightning,
  loraNameIsLightningSlot,
  LIGHTNING_LORA_TOKEN,
  alignLightningLoraFamilyInWorkflow,
  patchLoraNodesInWorkflow,
  resolveLoraLoaderFilename,
} from "./workflow-lora-patch";
import { normalizeInputImageFilenames } from "./workflow-load-image-bindings";

const VAE_DECODE_TYPES = new Set(["VAEDecode"]);
const OUTPUT_POST_PROCESS_TYPES = new Set([
  "ImageScaleBy",
  "ImageScale",
  "ImageSharpen",
  "ImageUpscaleWithModel",
  "LatentUpscale",
  "LatentUpscaleBy",
]);

const QWEN_EDIT_ENCODE_TYPES = new Set([
  "TextEncodeQwenImageEdit",
  "TextEncodeQwenImageEditPlus",
]);

const QWEN_EDIT_IMAGE_INPUT_KEYS = [
  "image",
  "image1",
  "image2",
  "image3",
  "image4",
] as const;

const UNET_LOADER_TYPES = new Set(["UNETLoader", "UnetLoaderGGUF"]);
const CHECKPOINT_LOADER_TYPES = new Set([
  "CheckpointLoaderSimple",
  "CheckpointLoader",
]);
const CLIP_LOADER_TYPES = new Set([
  "CLIPLoader",
  "DualCLIPLoader",
  "CLIPLoaderGGUF",
]);
const AURA_FLOW_TYPE = "ModelSamplingAuraFlow";

type WorkflowNodeRecord = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

function getLinkedNodeId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }
  const id = value[0];
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function parseNodeId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextWorkflowNodeId(workflow: Record<string, WorkflowNodeRecord>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = parseNodeId(key);
    if (parsed != null && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

function isSamplerNode(classType: string | undefined, inputs: Record<string, unknown>): boolean {
  const classLower = (classType ?? "").toLowerCase();
  if (
    classLower.includes("ksampler") ||
    classLower.includes("samplercustom") ||
    classLower.includes("guider")
  ) {
    return true;
  }
  return "seed" in inputs && ("steps" in inputs || "cfg" in inputs);
}

function isMainGenerateSampler(inputs: Record<string, unknown>): boolean {
  const denoise = inputs.denoise;
  if (denoise == null) {
    return true;
  }
  const value = Number(denoise);
  return !Number.isFinite(value) || value >= 0.95;
}

function walkModelChainIds(
  workflow: Record<string, WorkflowNodeRecord>,
  startId: string | null,
): string[] {
  const chain: string[] = [];
  let current = startId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    const node = workflow[current];
    if (!node?.inputs) {
      break;
    }
    current = getLinkedNodeId(node.inputs.model);
  }
  return chain;
}

function resolveLightningLoraName(loraFilenames: Record<string, string>): string | null {
  const mapped = loraFilenames[LIGHTNING_LORA_TOKEN]?.trim();
  if (
    mapped &&
    !/^\{\{[A-Z0-9_]+\}\}$/.test(mapped) &&
    mapped.length > 0
  ) {
    return mapped;
  }
  for (const value of Object.values(loraFilenames)) {
    const trimmed = value?.trim();
    if (
      trimmed &&
      !/^\{\{[A-Z0-9_]+\}\}$/.test(trimmed) &&
      loraFilenameImpliesLightning(trimmed)
    ) {
      return trimmed;
    }
  }
  // Never insert the unresolved placeholder into the graph — that false-fails
  // preflight as "Unresolved {{LORA_LIGHTNING}}" even when the real issue is
  // a missing token/map entry.
  return null;
}

function findClipSourceRef(
  workflow: Record<string, WorkflowNodeRecord>,
): [string, number] | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || !CHECKPOINT_LOADER_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    return [nodeId, 1];
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || !CLIP_LOADER_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    return [nodeId, 0];
  }
  return null;
}

function chainHasLightningLora(
  workflow: Record<string, WorkflowNodeRecord>,
  chainIds: string[],
  loraFilenames: Record<string, string>,
): boolean {
  return chainIds.some((id) => {
    const node = workflow[id];
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      return false;
    }
    return loraNameIsLightningSlot(node.inputs.lora_name, loraFilenames);
  });
}

function chainHasAuraFlow(
  workflow: Record<string, WorkflowNodeRecord>,
  chainIds: string[],
): string | null {
  for (const id of chainIds) {
    if (workflow[id]?.class_type === AURA_FLOW_TYPE) {
      return id;
    }
  }
  return null;
}

function findLightningLoraNodeId(
  workflow: Record<string, WorkflowNodeRecord>,
  loraFilenames: Record<string, string>,
): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    if (loraNameIsLightningSlot(node.inputs.lora_name, loraFilenames)) {
      return nodeId;
    }
  }
  return null;
}

function findPrimaryModelLoaderId(
  workflow: Record<string, WorkflowNodeRecord>,
): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node && UNET_LOADER_TYPES.has(node.class_type ?? "")) {
      return nodeId;
    }
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node && CHECKPOINT_LOADER_TYPES.has(node.class_type ?? "")) {
      return nodeId;
    }
  }
  return null;
}

function listModelConsumerEntries(
  workflow: Record<string, WorkflowNodeRecord>,
  loaderId: string,
): Array<{ nodeId: string; node: WorkflowNodeRecord }> {
  const consumers: Array<{ nodeId: string; node: WorkflowNodeRecord }> = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.inputs || getLinkedNodeId(node.inputs.model) !== loaderId) {
      continue;
    }
    consumers.push({ nodeId, node });
  }
  return consumers;
}

function insertLightningLoraNode(
  workflow: Record<string, WorkflowNodeRecord>,
  modelSourceId: string,
  lightningLoraName: string,
  _clipRef: [string, number] | null,
): string {
  // LightX2V official templates use LoraLoaderModelOnly — applying Lightning
  // LoRA to CLIP (strength_clip=1) produces swirly/worm artifacts.
  const loraId = nextWorkflowNodeId(workflow);
  workflow[loraId] = {
    class_type: "LoraLoaderModelOnly",
    inputs: {
      model: [modelSourceId, 0],
      lora_name: lightningLoraName,
      strength_model: 1,
    },
    _meta: { title: "Prompt Studio — Lightning LoRA" },
  };
  return loraId;
}

function ensureAuraAndLightningLoraOnModelLink(
  workflow: Record<string, WorkflowNodeRecord>,
  consumer: WorkflowNodeRecord,
  modelLink: string,
  lightningLoraName: string | null,
  loraFilenames: Record<string, string>,
  clipRef: [string, number] | null,
): void {
  if (!consumer.inputs) {
    return;
  }

  let chainIds = walkModelChainIds(workflow, modelLink);
  let auraId = chainHasAuraFlow(workflow, chainIds);

  if (!auraId) {
    auraId = nextWorkflowNodeId(workflow);
    workflow[auraId] = {
      class_type: AURA_FLOW_TYPE,
      inputs: {
        model: [modelLink, 0],
        shift: QWEN_LIGHTNING_SHIFT_DEFAULT,
      },
      _meta: { title: "Prompt Studio — Lightning AuraFlow" },
    };
    consumer.inputs.model = [auraId, 0];
    chainIds = walkModelChainIds(workflow, auraId);
  } else {
    const aura = workflow[auraId];
    if (aura?.inputs) {
      const current = Number(aura.inputs.shift);
      // Keep native LightX2V shift (~3). Only repair clearly wrong defaults.
      if (!Number.isFinite(current) || current < 2.5 || current > 4) {
        aura.inputs.shift = QWEN_LIGHTNING_SHIFT_DEFAULT;
      }
    }
  }

  if (!lightningLoraName) {
    return;
  }

  if (chainHasLightningLora(workflow, chainIds, loraFilenames)) {
    return;
  }

  const aura = workflow[auraId];
  if (!aura?.inputs) {
    return;
  }

  const modelSource = getLinkedNodeId(aura.inputs.model) ?? modelLink;
  const existingLoraId = findLightningLoraNodeId(workflow, loraFilenames);
  if (existingLoraId) {
    const existing = workflow[existingLoraId];
    if (existing?.inputs) {
      existing.inputs.model = [modelSource, 0];
      if (
        typeof existing.inputs.lora_name !== "string" ||
        !existing.inputs.lora_name.trim() ||
        /^\{\{[A-Z0-9_]+\}\}$/.test(existing.inputs.lora_name.trim())
      ) {
        existing.inputs.lora_name = lightningLoraName;
      }
      if ("strength_model" in existing.inputs) {
        existing.inputs.strength_model = 1;
      }
      if ("strength" in existing.inputs) {
        existing.inputs.strength = 1;
      }
    }
    aura.inputs.model = [existingLoraId, 0];
    return;
  }

  const loraId = insertLightningLoraNode(
    workflow,
    modelSource,
    lightningLoraName,
    clipRef,
  );
  aura.inputs.model = [loraId, 0];
}

/**
 * Distilled Lightning needs UNET → Lightning LoRA → AuraFlow (shift ~3) → KSampler.
 * Missing LoRA or bypassed AuraFlow produces soft, malformed anatomy.
 */
export function ensureLightningModelChainInWorkflow(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const lightningLoraName = resolveLightningLoraName(loraFilenames);
  const clipRef = findClipSourceRef(next);

  for (const node of Object.values(next)) {
    if (!node?.inputs) {
      continue;
    }
    // KSampler / Guider path (model on the node itself).
    if (isSamplerNode(node.class_type, node.inputs)) {
      if (!isMainGenerateSampler(node.inputs)) {
        continue;
      }
      const modelLink = getLinkedNodeId(node.inputs.model);
      if (!modelLink) {
        continue;
      }
      ensureAuraAndLightningLoraOnModelLink(
        next,
        node,
        modelLink,
        lightningLoraName,
        loraFilenames,
        clipRef,
      );
      continue;
    }

    // SamplerCustom-style graphs: model often sits on BasicGuider / CFGGuider only.
    const classLower = (node.class_type ?? "").toLowerCase();
    if (!classLower.includes("guider")) {
      continue;
    }
    const modelLink = getLinkedNodeId(node.inputs.model);
    if (!modelLink) {
      continue;
    }
    ensureAuraAndLightningLoraOnModelLink(
      next,
      node,
      modelLink,
      lightningLoraName,
      loraFilenames,
      clipRef,
    );
  }

  // Fallback for graphs with no sampler/guider model link (or only SamplerCustom):
  // insert LoRA + AuraFlow between the primary loader and its model consumers.
  if (lightningLoraName && !workflowHasLightningLora(next, loraFilenames)) {
    const loaderId = findPrimaryModelLoaderId(next);
    if (loaderId) {
      const consumers = listModelConsumerEntries(next, loaderId);
      if (consumers.length > 0) {
        const loraId = insertLightningLoraNode(
          next,
          loaderId,
          lightningLoraName,
          clipRef,
        );
        const auraId = nextWorkflowNodeId(next);
        next[auraId] = {
          class_type: AURA_FLOW_TYPE,
          inputs: {
            model: [loraId, 0],
            shift: QWEN_LIGHTNING_SHIFT_DEFAULT,
          },
          _meta: { title: "Prompt Studio — Lightning AuraFlow" },
        };
        for (const { node } of consumers) {
          if (node.inputs) {
            node.inputs.model = [auraId, 0];
          }
        }
      } else if (!workflowHasLoraLoader(next)) {
        // No consumers found — still add a wired LoRA so preflight/queue see it.
        insertLightningLoraNode(next, loaderId, lightningLoraName, clipRef);
      }
    }
  }

  return next;
}

export function workflowHasLoraLoader(workflow: Record<string, unknown>): boolean {
  return Object.values(workflow).some((node) => {
    if (!node || typeof node !== "object") {
      return false;
    }
    return isLoraLoaderClassType(
      (node as { class_type?: string }).class_type,
    );
  });
}

export function workflowHasLightningLora(
  workflow: Record<string, unknown>,
  loraFilenames: Record<string, string> = {},
): boolean {
  return Object.values(workflow).some((node) => {
    if (!node || typeof node !== "object") {
      return false;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    if (!record.inputs || !isLoraLoaderClassType(record.class_type)) {
      return false;
    }
    if (loraNameImpliesLightning(record.inputs.lora_name, loraFilenames)) {
      return true;
    }
    if (record.class_type === "Power Lora Loader (rgthree)") {
      for (const [key, value] of Object.entries(record.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== "object") {
          continue;
        }
        const slot = value as { on?: boolean; lora?: unknown };
        if (slot.on === false) {
          continue;
        }
        if (loraNameImpliesLightning(slot.lora, loraFilenames)) {
          return true;
        }
      }
    }
    return false;
  });
}

/** Keep ModelSamplingAuraFlow for Lightning (official LightX2V shift ~3). */
/**
 * Intentionally a no-op: Lightning must keep ModelSamplingAuraFlow (shift ~3).
 * Do not "bypass"/remove AuraFlow here — that softens anatomy.
 */
export function bypassModelSamplingAuraFlowForLightning(
  workflow: Record<string, unknown>,
  model?: string,
): {
  workflow: Record<string, unknown>;
  bypassedNodeIds: string[];
} {
  void model;
  return { workflow, bypassedNodeIds: [] };
}

/** Strip imported upscale/sharpen after decode. Keep Prompt Studio Final/Max quality enrich. */
export function stripLightningOutputPostProcess(
  workflow: Record<string, unknown>,
  model?: string,
): {
  workflow: Record<string, unknown>;
  strippedNodeIds: string[];
} {
  if (!isQwenLightningModel(model)) {
    return { workflow, strippedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const strippedNodeIds = new Set<string>();

  for (const node of Object.values(next)) {
    if (node?.class_type !== "SaveImage" || !node.inputs) {
      continue;
    }

    let link = getLinkedNodeId(node.inputs.images);
    while (link) {
      const upstream = next[link];
      if (!upstream) {
        break;
      }
      if (VAE_DECODE_TYPES.has(upstream.class_type ?? "")) {
        node.inputs.images = [link, 0];
        break;
      }
      if (!OUTPUT_POST_PROCESS_TYPES.has(upstream.class_type ?? "")) {
        break;
      }
      // Preserve queue quality-profile upscale inserted by Prompt Studio.
      if (isPromptStudioOutputUpscaleNode(upstream)) {
        break;
      }
      strippedNodeIds.add(link);
      link = getLinkedNodeId(upstream.inputs?.image);
    }
  }

  return {
    workflow: next,
    strippedNodeIds: [...strippedNodeIds],
  };
}

/** Drop stale latent hires second pass (soft denoise) left from older Final/Max enrich. */
export function stripLightningHiresPass(
  workflow: Record<string, unknown>,
  model?: string,
): {
  workflow: Record<string, unknown>;
  strippedNodeIds: string[];
} {
  if (!isQwenLightningModel(model)) {
    return { workflow, strippedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const strippedNodeIds = new Set<string>();

  for (const decodeNode of Object.values(next)) {
    if (!decodeNode?.inputs || !VAE_DECODE_TYPES.has(decodeNode.class_type ?? "")) {
      continue;
    }

    const samplerId = getLinkedNodeId(decodeNode.inputs.samples);
    if (!samplerId) {
      continue;
    }

    const sampler = next[samplerId];
    if (!sampler?.inputs || !isSamplerNode(sampler.class_type, sampler.inputs)) {
      continue;
    }

    if (isMainGenerateSampler(sampler.inputs)) {
      continue;
    }

    const latentId = getLinkedNodeId(sampler.inputs.latent_image);
    if (!latentId) {
      continue;
    }

    const latent = next[latentId];
    const latentType = latent?.class_type ?? "";
    if (latentType !== "LatentUpscale" && latentType !== "LatentUpscaleBy") {
      continue;
    }

    const baseSamples = getLinkedNodeId(latent?.inputs?.samples);
    if (!baseSamples) {
      continue;
    }

    decodeNode.inputs.samples = [baseSamples, 0];
    strippedNodeIds.add(samplerId);
    strippedNodeIds.add(latentId);
  }

  return {
    workflow: next,
    strippedNodeIds: [...strippedNodeIds],
  };
}

function loraStrengthIsActive(value: unknown): boolean {
  const strength = Number(value);
  return !Number.isFinite(strength) || strength > 0;
}

/** Disable style/NSFW LoRAs stacked on Lightning workflows — they cause banding and soft output. */
export function neutralizeNonLightningLoras(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
): {
  workflow: Record<string, unknown>;
  neutralizedNodeIds: string[];
} {
  if (!isQwenLightningModel(model)) {
    return { workflow, neutralizedNodeIds: [] };
  }

  if (!workflowHasLightningLora(workflow, loraFilenames)) {
    return { workflow, neutralizedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  const neutralizedNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(next)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }

    if (node.class_type === "Power Lora Loader (rgthree)") {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== "object") {
          continue;
        }
        const slot = value as {
          on?: boolean;
          lora?: unknown;
          strength?: number;
          strengthTwo?: number | null;
        };
        if (slot.on === false) {
          continue;
        }
        if (loraNameImpliesLightning(slot.lora, loraFilenames)) {
          continue;
        }
        const hasLora =
          typeof slot.lora === "string" && slot.lora.trim().length > 0;
        if (!hasLora && slot.on !== true) {
          continue;
        }
        slot.on = false;
        if ("strength" in slot) {
          slot.strength = 0;
        }
        if ("strengthTwo" in slot && slot.strengthTwo != null) {
          slot.strengthTwo = 0;
        }
        neutralizedNodeIds.push(`${nodeId}:${key}`);
      }
      continue;
    }

    if (loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)) {
      continue;
    }

    const active =
      loraStrengthIsActive(node.inputs.strength_model) ||
      loraStrengthIsActive(node.inputs.strength_clip) ||
      loraStrengthIsActive(node.inputs.strength);
    if (!active) {
      continue;
    }

    if ("strength_model" in node.inputs) {
      node.inputs.strength_model = 0;
    }
    if ("strength_clip" in node.inputs) {
      node.inputs.strength_clip = 0;
    }
    if ("strength" in node.inputs) {
      node.inputs.strength = 0;
    }
    neutralizedNodeIds.push(nodeId);
  }

  // Pack graphs often bake Lightning once in a LoraLoader|pysssss chain and again as
  // LoraLoaderModelOnly — keep only the sampler-nearest Lightning loader at strength.
  const samplerModelLink = (() => {
    for (const node of Object.values(next)) {
      const classType = node?.class_type ?? "";
      if (
        classType !== "KSampler" &&
        classType !== "KSamplerAdvanced" &&
        classType !== "SamplerCustom" &&
        classType !== "SamplerCustomAdvanced" &&
        classType !== "ModelSamplingAuraFlow"
      ) {
        continue;
      }
      const link = getLinkedNodeId(node?.inputs?.model);
      if (link) {
        return link;
      }
    }
    return null;
  })();
  if (samplerModelLink) {
    const lightningOnChain: string[] = [];
    const seen = new Set<string>();
    let cursor: string | null = samplerModelLink;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const node = next[cursor];
      if (!node?.inputs) {
        break;
      }
      if (
        isLoraLoaderClassType(node.class_type) &&
        node.class_type !== "Power Lora Loader (rgthree)" &&
        loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)
      ) {
        lightningOnChain.push(cursor);
      }
      cursor = getLinkedNodeId(node.inputs.model);
    }
    for (const nodeId of lightningOnChain.slice(1)) {
      const node = next[nodeId];
      if (!node?.inputs) {
        continue;
      }
      if ("strength_model" in node.inputs) {
        node.inputs.strength_model = 0;
      }
      if ("strength_clip" in node.inputs) {
        node.inputs.strength_clip = 0;
      }
      if ("strength" in node.inputs) {
        node.inputs.strength = 0;
      }
      if (!neutralizedNodeIds.includes(nodeId)) {
        neutralizedNodeIds.push(nodeId);
      }
    }
  }

  return { workflow: next, neutralizedNodeIds };
}

/** Ensure Lightning LoRA runs at full model strength. */
export function normalizeLightningLoraStrengths(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  for (const node of Object.values(next)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    if (node.class_type === "Power Lora Loader (rgthree)") {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== "object") {
          continue;
        }
        const slot = value as {
          on?: boolean;
          lora?: unknown;
          strength?: number;
        };
        if (!loraNameImpliesLightning(slot.lora, loraFilenames)) {
          continue;
        }
        slot.on = true;
        if ("strength" in slot) {
          slot.strength = 1;
        }
      }
      continue;
    }
    if (!loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)) {
      continue;
    }

    if ("strength_model" in node.inputs) {
      node.inputs.strength_model = 1;
    }
    // Official LightX2V recipes keep CLIP at 0 (model-only adaptation).
    if ("strength_clip" in node.inputs) {
      node.inputs.strength_clip = 0;
    }
    if ("strength" in node.inputs) {
      node.inputs.strength = 1;
    }
  }

  return next;
}

/** Always apply queue width/height on latent nodes — imported workflows often keep 1024.
 * Also convert EmptyFlux2LatentImage → EmptySD3LatentImage: Edit packs sometimes ship
 * Flux2 empty latents; with Qwen VAE those decode at ~½ spatial size (1328→664→996 with Lanczos). */
export function forceLightningLatentSizeInWorkflow(
  workflow: Record<string, unknown>,
  params: Pick<WorkflowParamValues, "width" | "height"> | undefined,
  model?: string,
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const width = Number(params?.width);
  const height = Number(params?.height);
  // Trust queue params (already orientation-aware). Only fall back when missing.
  let resolvedWidth = Number.isFinite(width) && width > 0 ? width : undefined;
  let resolvedHeight = Number.isFinite(height) && height > 0 ? height : undefined;
  if (resolvedWidth == null || resolvedHeight == null) {
    const resolved = ensureLightningNativeResolutionParams(
      {},
      model ?? "qwen-image-2512-lightning-8",
      DEFAULT_RESOLUTION_ORIENTATION,
      DEFAULT_RESOLUTION_SIZE_TIER,
    );
    resolvedWidth = Number(resolved.width);
    resolvedHeight = Number(resolved.height);
  }
  if (
    resolvedWidth == null ||
    resolvedHeight == null ||
    !Number.isFinite(resolvedWidth) ||
    !Number.isFinite(resolvedHeight)
  ) {
    return workflow;
  }

  const normalized = normalizeEmptyLatentForModel(workflow, model).workflow;
  const next = structuredClone(normalized) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  for (const node of Object.values(next)) {
    const inputs = node?.inputs;
    if (!inputs || !isLatentSizeNode(node.class_type ?? "", inputs)) {
      continue;
    }
    inputs.width = resolvedWidth;
    inputs.height = resolvedHeight;
  }

  return next;
}

/** fp8 weight_dtype on bf16 UNET causes grid/grain artifacts on Lightning. */
export function normalizeLightningUnetWeightDtype(
  workflow: Record<string, unknown>,
  model?: string,
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  for (const node of Object.values(next)) {
    if (!node?.inputs || !UNET_LOADER_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    const dtype = node.inputs.weight_dtype;
    if (typeof dtype !== "string") {
      continue;
    }
    if (/fp8|e4m3fn|fp16|float16/i.test(dtype)) {
      node.inputs.weight_dtype = "default";
    }
  }

  return next;
}

const LOADER_FILENAME_FIELDS = [
  "unet_name",
  "ckpt_name",
  // Do not rewrite CLIP here — official LightX2V keeps fp8_scaled CLIP with bf16 UNET.
] as const;

function rewriteFp8FilenameToBf16(filename: string, model?: string): string | undefined {
  if (precisionHintFromFilename(filename) !== "fp8") {
    return undefined;
  }
  const lower = filename.toLowerCase();
  if (/clip|qwen_2\.5_vl|text_encoder/.test(lower)) {
    return undefined;
  }
  // Prefer the concrete filename's family — never swap 2512↔edit from model id alone.
  const family = qwenUnetFamilyFromFilename(filename);
  if (family === "edit-2511") {
    return qwenEdit2511UnetFilename("bf16");
  }
  if (family === "edit-2509") {
    return qwenEdit2509UnetFilename("bf16");
  }
  if (family === "t2i") {
    return qwen2512UnetFilename("bf16");
  }
  if (model?.includes("edit-2511")) {
    return qwenEdit2511UnetFilename("bf16");
  }
  if (model?.includes("edit-2509")) {
    return qwenEdit2509UnetFilename("bf16");
  }
  return qwen2512UnetFilename("bf16");
}

/** Rewrite concrete fp8 UNET/CLIP filenames to bf16 — Lightning must not run mixed fp8. */
export function forceLightningBf16FilenamesInWorkflow(
  workflow: Record<string, unknown>,
  model?: string,
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  for (const node of Object.values(next)) {
    const inputs = node?.inputs;
    if (!inputs) {
      continue;
    }
    for (const field of LOADER_FILENAME_FIELDS) {
      const value = inputs[field];
      if (typeof value !== "string" || !value.trim()) {
        continue;
      }
      const rewritten = rewriteFp8FilenameToBf16(value, model);
      if (rewritten) {
        inputs[field] = rewritten;
      }
    }
  }

  return next;
}

export function resolveLightningBf16Loaders(
  model?: string,
  loaders?: ModelLoaderFilenames,
): ModelLoaderFilenames {
  const next: ModelLoaderFilenames = { ...(loaders ?? {}) };
  const preferredUnet = model?.includes("edit-2511")
    ? qwenEdit2511UnetFilename("bf16")
    : model?.includes("edit-2509")
      ? qwenEdit2509UnetFilename("bf16")
      : qwen2512UnetFilename("bf16");
  const existingUnet =
    typeof next.unet === "string" && next.unet.trim() && !filenameLooksLikeCheckpointOnly(next.unet)
      ? next.unet.trim()
      : undefined;
  if (existingUnet) {
    const rewritten = rewriteFp8FilenameToBf16(existingUnet, model);
    // Keep the workflow/map UNET family — only lift fp8→bf16 within that family.
    next.unet = rewritten ?? existingUnet;
  } else {
    next.unet = preferredUnet;
  }
  if (
    !next.checkpoint ||
    precisionHintFromFilename(next.checkpoint) === "fp8" ||
    filenameLooksLikeCheckpointOnly(next.checkpoint)
  ) {
    next.checkpoint = next.unet;
  }
  // Keep caller CLIP when set — LightX2V official uses fp8_scaled CLIP with bf16 UNET.
  if (!next.dualClip?.trim()) {
    next.dualClip = qwenDualClipFilename("bf16");
  }
  if (!next.vae?.trim()) {
    next.vae = "qwen_image_vae.safetensors";
  }
  return next;
}

export function alignLightningBf16LoadersInWorkflow(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames | undefined,
  model?: string,
  options?: { syncLoadersToModel?: boolean },
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }
  const bf16 = resolveLightningBf16Loaders(model, loaders);
  // LightX2V official pairs bf16 UNET with fp8_scaled CLIP. Never precision-align
  // CLIP unless the user explicitly syncs loaders to the selected model.
  const patchLoaders: ModelLoaderFilenames = {
    unet: bf16.unet,
    checkpoint: bf16.checkpoint,
    vae: bf16.vae,
  };
  if (options?.syncLoadersToModel === true) {
    patchLoaders.dualClip = bf16.dualClip;
  }
  return patchLoaderNodesInWorkflow(workflow, patchLoaders, {
    syncLoadersToModel: options?.syncLoadersToModel === true,
  }).workflow;
}

/** Detect imported Lightning graphs that already match the native LightX2V recipe. */
export function isNativeLightningWorkflowReady(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
): boolean {
  if (!isQwenLightningModel(model)) {
    return false;
  }

  const graph = workflow as Record<string, WorkflowNodeRecord>;

  for (const node of Object.values(graph)) {
    if (!node?.inputs || !isSamplerNode(node.class_type, node.inputs)) {
      continue;
    }
    if (!isMainGenerateSampler(node.inputs)) {
      continue;
    }

    const modelLink = getLinkedNodeId(node.inputs.model);
    // SamplerCustom graphs often put the model on the guider instead.
    if (!modelLink) {
      continue;
    }

    // Also accept guider-held model links (SamplerCustom).
    const classLower = (node.class_type ?? "").toLowerCase();
    if (classLower.includes("samplercustom")) {
      // Walk guiders separately below.
    }

    const chainIds = walkModelChainIds(graph, modelLink);
    if (
      chainHasLightningLora(graph, chainIds, loraFilenames) &&
      chainHasAuraFlow(graph, chainIds)
    ) {
      const auraId = chainHasAuraFlow(graph, chainIds);
      if (!auraId) {
        continue;
      }
      const shift = Number(graph[auraId]?.inputs?.shift);
      if (Number.isFinite(shift) && shift >= 2.5 && shift <= 4) {
        return true;
      }
    }
  }

  // Guider-based graphs: model sits on BasicGuider / CFGGuider.
  for (const node of Object.values(graph)) {
    if (!node?.inputs) {
      continue;
    }
    const classLower = (node.class_type ?? "").toLowerCase();
    if (!classLower.includes("guider")) {
      continue;
    }
    const modelLink = getLinkedNodeId(node.inputs.model);
    if (!modelLink) {
      continue;
    }
    const chainIds = walkModelChainIds(graph, modelLink);
    if (
      !chainHasLightningLora(graph, chainIds, loraFilenames) ||
      !chainHasAuraFlow(graph, chainIds)
    ) {
      continue;
    }
    const auraId = chainHasAuraFlow(graph, chainIds);
    if (!auraId) {
      continue;
    }
    const shift = Number(graph[auraId]?.inputs?.shift);
    if (Number.isFinite(shift) && shift >= 2.5 && shift <= 4) {
      return true;
    }
  }

  return false;
}

/**
 * Pure T2I with TextEncodeQwenImageEditPlus requires image1/2/3 disconnected.
 * A baked-in or placeholder LoadImage wired into encode produces mosaic/shard
 * artifacts on Generate when no reference was uploaded.
 * Also drops LoadImage nodes from the submitted graph — ComfyUI still executes
 * unused LoadImage nodes and fails on missing {{INPUT_IMAGE}} / stale files.
 */
export function disconnectQwenEditReferenceImagesForTxt2Img(
  workflow: Record<string, unknown>,
  options?: { hasInputImage?: boolean; model?: string },
): {
  workflow: Record<string, unknown>;
  disconnectedNodeIds: string[];
} {
  if (options?.hasInputImage) {
    return { workflow, disconnectedNodeIds: [] };
  }
  const modelId = options?.model?.trim() ?? "";
  if (modelId && !isEditCapableModel(modelId) && !/edit/i.test(modelId)) {
    return { workflow, disconnectedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const disconnectedNodeIds: string[] = [];
  const removedLoadImageIds = new Set<string>();

  for (const [nodeId, node] of Object.entries(next)) {
    if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    let changed = false;
    for (const key of QWEN_EDIT_IMAGE_INPUT_KEYS) {
      if (key in node.inputs) {
        const linked = getLinkedNodeId(node.inputs[key]);
        if (linked && next[linked]?.class_type === "LoadImage") {
          removedLoadImageIds.add(linked);
        }
        delete node.inputs[key];
        changed = true;
      }
    }
    if (changed) {
      disconnectedNodeIds.push(nodeId);
    }
  }

  // Drop LoadImage nodes that only existed for edit refs (still validated by ComfyUI).
  for (const [nodeId, node] of Object.entries(next)) {
    if (node?.class_type !== "LoadImage") {
      continue;
    }
    const stillReferenced = Object.values(next).some((other) => {
      if (!other?.inputs || other === node) {
        return false;
      }
      return Object.values(other.inputs).some(
        (value) => getLinkedNodeId(value) === nodeId,
      );
    });
    if (!stillReferenced || removedLoadImageIds.has(nodeId)) {
      if (!stillReferenced) {
        delete next[nodeId];
        disconnectedNodeIds.push(nodeId);
      }
    }
  }
  for (const nodeId of removedLoadImageIds) {
    if (next[nodeId]) {
      delete next[nodeId];
      if (!disconnectedNodeIds.includes(nodeId)) {
        disconnectedNodeIds.push(nodeId);
      }
    }
  }

  return { workflow: next, disconnectedNodeIds };
}

/** When a reference image is queued, ensure EditPlus encode nodes receive it. */
export function ensureQwenEditReferenceImagesForImg2Img(
  workflow: Record<string, unknown>,
  options?: {
    hasInputImage?: boolean;
    inputImageFilename?: string;
    inputImageFilenames?: string[];
    /**
     * When true (default), overwrite existing encode→LoadImage links so stale
     * pack refs adopt Figure 1–N from the queue.
     */
    forceRewire?: boolean;
  },
): {
  workflow: Record<string, unknown>;
  wiredNodeIds: string[];
} {
  if (!options?.hasInputImage) {
    return { workflow, wiredNodeIds: [] };
  }

  const filenames = normalizeInputImageFilenames(
    options.inputImageFilename,
    options.inputImageFilenames,
  );

  if (filenames.length === 0) {
    return { workflow, wiredNodeIds: [] };
  }

  const forceRewire = options.forceRewire !== false;
  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const encodeImageKeys = ["image1", "image2", "image3", "image4"] as const;

  const findOrCreateFigureLoader = (figureIndex: number, filename: string): string => {
    const title = `Figure ${figureIndex}`;
    const existing = Object.entries(next).find(([, node]) => {
      if (node?.class_type !== "LoadImage" && node?.class_type !== "LoadImageOutput") {
        return false;
      }
      const nodeTitle = node._meta?.title?.trim() ?? "";
      return (
        nodeTitle === title ||
        new RegExp(`\\b(?:figure|image|ref|reference|photo|picture)\\s*${figureIndex}\\b`, "i").test(
          nodeTitle,
        )
      );
    });
    if (existing) {
      const [id, node] = existing;
      if (node?.inputs) {
        node.inputs.image = filename;
      }
      if (node && !node._meta?.title) {
        node._meta = { ...(node._meta ?? {}), title };
      }
      return id;
    }

    // Prefer reusing the first untitled LoadImage for Figure 1 only.
    if (figureIndex === 1) {
      const first = Object.entries(next).find(
        ([, node]) => node?.class_type === "LoadImage" || node?.class_type === "LoadImageOutput",
      );
      if (first) {
        const [id, node] = first;
        if (node?.inputs) {
          node.inputs.image = filename;
        }
        if (node) {
          node._meta = { ...(node._meta ?? {}), title };
        }
        return id;
      }
    }

    const loadImageId = String(
      Math.max(0, ...Object.keys(next).map((id) => Number(id) || 0)) + 1,
    );
    next[loadImageId] = {
      class_type: "LoadImage",
      inputs: { image: filename },
      _meta: { title },
    };
    return loadImageId;
  };

  const loaderIds = filenames.map((filename, index) =>
    findOrCreateFigureLoader(index + 1, filename),
  );

  const shouldWireSlot = (current: unknown): boolean => {
    if (forceRewire) {
      return true;
    }
    return current == null || typeof current === "string";
  };

  const wiredNodeIds: string[] = [];
  for (const [nodeId, node] of Object.entries(next)) {
    if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    if (node.class_type === "TextEncodeQwenImageEdit") {
      const current = node.inputs.image;
      if (shouldWireSlot(current)) {
        node.inputs.image = [loaderIds[0]!, 0];
        wiredNodeIds.push(nodeId);
      }
      continue;
    }

    let changed = false;
    for (let i = 0; i < loaderIds.length && i < encodeImageKeys.length; i += 1) {
      const key = encodeImageKeys[i]!;
      const current = node.inputs[key];
      if (shouldWireSlot(current)) {
        node.inputs[key] = [loaderIds[i]!, 0];
        changed = true;
      }
    }
    // Clear leftover higher image slots when queueing fewer figures than the pack had.
    if (forceRewire) {
      for (let i = loaderIds.length; i < encodeImageKeys.length; i += 1) {
        const key = encodeImageKeys[i]!;
        if (key in node.inputs) {
          delete node.inputs[key];
          changed = true;
        }
      }
    }
    if (changed) {
      wiredNodeIds.push(nodeId);
    }
  }

  return { workflow: next, wiredNodeIds };
}

/**
 * Ensure / disconnect Qwen edit encode refs for any edit-capable model
 * (Lightning and non-Lightning packs/scaffolds).
 */
export function prepareQwenEditReferenceImagesForQueue(
  workflow: Record<string, unknown>,
  model?: string,
  params?: Pick<WorkflowParamValues, "inputImageFilename" | "inputImageFilenames">,
  options?: { forceRewire?: boolean },
): Record<string, unknown> {
  const modelId = model?.trim() ?? "";
  if (!modelId) {
    return workflow;
  }
  if (!isEditCapableModel(modelId) && !/edit/i.test(modelId)) {
    return workflow;
  }

  const hasInputImage = Boolean(
    params?.inputImageFilename?.toString().trim() ||
      params?.inputImageFilenames?.some((name) => Boolean(name?.toString().trim())),
  );

  if (hasInputImage) {
    return ensureQwenEditReferenceImagesForImg2Img(workflow, {
      hasInputImage: true,
      inputImageFilename: params?.inputImageFilename?.toString(),
      inputImageFilenames: params?.inputImageFilenames,
      forceRewire: options?.forceRewire,
    }).workflow;
  }

  return disconnectQwenEditReferenceImagesForTxt2Img(workflow, {
    hasInputImage: false,
    model: modelId,
  }).workflow;
}

export function prepareLightningWorkflowForQueue(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
  options?: {
    params?: WorkflowParamValues;
    loaders?: ModelLoaderFilenames;
    syncLoadersToModel?: boolean;
  },
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const refsPrepared = prepareQwenEditReferenceImagesForQueue(
    workflow,
    model,
    options?.params,
  );

  const loraPatch = patchLoraNodesInWorkflow(refsPrepared, loraFilenames);
  const familyAligned = alignLightningLoraFamilyInWorkflow(
    loraPatch.workflow,
    model,
    loraFilenames,
  );

  // If a Lightning LoRA is already present, repair LoRA wiring/strengths and
  // still force queue latent size — extreme leftover sizes cause mosaic melt.
  if (workflowHasLightningLora(familyAligned.workflow, loraFilenames)) {
    const chainEnsured = isNativeLightningWorkflowReady(
      familyAligned.workflow,
      model,
      loraFilenames,
    )
      ? familyAligned.workflow
      : ensureLightningModelChainInWorkflow(
          familyAligned.workflow,
          model,
          loraFilenames,
        );
    const normalizedLoras = normalizeLightningLoraStrengths(
      chainEnsured,
      model,
      loraFilenames,
    );
    const latentSized = forceLightningLatentSizeInWorkflow(
      normalizedLoras,
      options?.params,
      model,
    );
    const fp8Rewritten = forceLightningBf16FilenamesInWorkflow(latentSized, model);
    const weightDtype = normalizeLightningUnetWeightDtype(fp8Rewritten, model);
    const hiresStripped = stripLightningHiresPass(weightDtype, model);
    const stripped = stripLightningOutputPostProcess(hiresStripped.workflow, model);
    return neutralizeNonLightningLoras(stripped.workflow, model, loraFilenames).workflow;
  }

  const chainEnsured = ensureLightningModelChainInWorkflow(
    familyAligned.workflow,
    model,
    loraFilenames,
  );
  const normalizedLoras = normalizeLightningLoraStrengths(
    chainEnsured,
    model,
    loraFilenames,
  );
  const latentSized = forceLightningLatentSizeInWorkflow(
    normalizedLoras,
    options?.params,
    model,
  );
  const fp8Rewritten = forceLightningBf16FilenamesInWorkflow(latentSized, model);
  const loadersAligned = alignLightningBf16LoadersInWorkflow(
    fp8Rewritten,
    options?.loaders,
    model,
    { syncLoadersToModel: options?.syncLoadersToModel },
  );
  const weightDtype = normalizeLightningUnetWeightDtype(loadersAligned, model);
  const samplingKept = bypassModelSamplingAuraFlowForLightning(weightDtype, model);
  const hiresStripped = stripLightningHiresPass(samplingKept.workflow, model);
  const stripped = stripLightningOutputPostProcess(hiresStripped.workflow, model);
  return neutralizeNonLightningLoras(stripped.workflow, model, loraFilenames).workflow;
}

export type LightningWorkflowAuditIssue = {
  severity: "error" | "warn";
  message: string;
};

export function auditLightningWorkflowIssues(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  model?: string;
  loraFilenames?: Record<string, string>;
  /** When true, graph was already run through prepareLightningWorkflowForQueue. */
  alreadyPrepared?: boolean;
}): LightningWorkflowAuditIssue[] {
  if (!isQwenLightningModel(input.model)) {
    return [];
  }

  type LightningNode = {
    class_type?: string;
    inputs?: Record<string, unknown>;
  };
  let parsed: Record<string, LightningNode> | null = null;
  if (input.workflow && typeof input.workflow === "object") {
    parsed = input.workflow as Record<string, LightningNode>;
  } else if (input.workflowJson?.trim()) {
    try {
      parsed = JSON.parse(input.workflowJson) as Record<string, LightningNode>;
    } catch {
      return [];
    }
  }
  if (!parsed) {
    return [];
  }

  // Audit the post-prep graph so missing LoRA nodes that queue injection would add
  // are not false errors when {{LORA_LIGHTNING}} is already mapped in Settings.
  // Queue path passes alreadyPrepared after inject — skip a second full prep.
  const prepared = (
    input.alreadyPrepared
      ? parsed
      : prepareLightningWorkflowForQueue(
          parsed,
          input.model,
          input.loraFilenames ?? {},
        )
  ) as typeof parsed;

  const issues: LightningWorkflowAuditIssue[] = [];

  if (!workflowHasLoraLoader(prepared)) {
    issues.push({
      severity: "error",
      message:
        "Lightning model queued without a LoraLoader — set {{LORA_LIGHTNING}} on this workflow’s token overrides (or in Settings → LoRA library as ID “LIGHTNING”). Missing LoRA causes soft, malformed hands/faces.",
    });
  } else if (!workflowHasLightningLora(prepared, input.loraFilenames ?? {})) {
    issues.push({
      severity: "error",
      message:
        "Lightning workflow has no Lightning LoRA mapped — set {{LORA_LIGHTNING}} on this workflow’s token overrides (or LoRA library) to your 8-step LightX2V .safetensors.",
    });
  } else {
    const modelId = String(input.model ?? "");
    const wantsEdit = /edit/i.test(modelId);
    for (const node of Object.values(prepared)) {
      if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
        continue;
      }
      const filename = resolveLoraLoaderFilename(
        node.inputs.lora_name,
        input.loraFilenames ?? {},
      );
      if (!filename || !loraFilenameImpliesLightning(filename)) {
        continue;
      }
      const loraIsEdit = /edit/i.test(filename);
      if (wantsEdit !== loraIsEdit) {
        issues.push({
          severity: "error",
          message: wantsEdit
            ? `Edit-2511 Lightning is paired with a T2I Lightning LoRA (${filename}). Set this workflow’s {{LORA_LIGHTNING}} to an Edit-2511 LightX2V file (name contains “Edit”) — T2I LoRA on Edit UNET causes worm/melt artifacts.`
            : `T2I Lightning is paired with an Edit Lightning LoRA (${filename}). Set this workflow’s {{LORA_LIGHTNING}} to a Qwen-Image Lightning file (not Edit) — Edit LoRA on 2512 UNET causes worm/melt artifacts.`,
        });
        break;
      }
    }
  }

  let hasAuraFlow = false;
  let hasMainSampler = false;
  let samplerUsesAuraFlow = false;
  for (const node of Object.values(prepared)) {
    if (!node) {
      continue;
    }
    if (node.class_type === AURA_FLOW_TYPE) {
      hasAuraFlow = true;
    }
    if (node.inputs && isSamplerNode(node.class_type, node.inputs) && isMainGenerateSampler(node.inputs)) {
      hasMainSampler = true;
      const chain = walkModelChainIds(prepared, getLinkedNodeId(node.inputs.model));
      if (chainHasAuraFlow(prepared, chain)) {
        samplerUsesAuraFlow = true;
      }
    }
  }
  if (hasMainSampler && (!hasAuraFlow || !samplerUsesAuraFlow)) {
    issues.push({
      severity: "error",
      message:
        "Lightning KSampler is missing ModelSamplingAuraFlow (shift ~3) on the model chain — without it, output is soft and anatomy drifts. Queue prep normally inserts this; check the workflow graph.",
    });
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    if (loraNameImpliesLightning(node.inputs.lora_name, input.loraFilenames ?? {})) {
      continue;
    }
    const filename = resolveLoraLoaderFilename(
      node.inputs.lora_name,
      input.loraFilenames ?? {},
    );
    if (
      filename &&
      !loraFilenameImpliesLightning(filename) &&
      (loraStrengthIsActive(node.inputs.strength_model) ||
        loraStrengthIsActive(node.inputs.strength_clip) ||
        loraStrengthIsActive(node.inputs.strength))
    ) {
      issues.push({
        severity: "warn",
        message:
          "Workflow stacks non-Lightning LoRAs (style/NSFW) on a Lightning model — Prompt Studio disables them at queue time. Remove them in ComfyUI or use a Lightning-only workflow for clean output.",
      });
      break;
    }
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs) {
      continue;
    }
    if (
      isLatentSizeNode(node.class_type ?? "", node.inputs) &&
      Number(node.inputs.width) === 1024 &&
      Number(node.inputs.height) === 1024
    ) {
      issues.push({
        severity: "warn",
        message:
          "Lightning workflow latent is still 1024×1024 — queue should patch to 1328×1328 native. Restart the dev server and check Advanced queue params are not pinned to 1024.",
      });
      break;
    }
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs) {
      continue;
    }
    for (const value of Object.values(node.inputs)) {
      if (typeof value !== "string") {
        continue;
      }
      if (/fp8|e4m3fn|fp8_scaled/i.test(value)) {
        issues.push({
          severity: "warn",
          message:
            "Workflow still references fp8 weights — Prompt Studio will prefer bf16 for Lightning at queue time to reduce banding.",
        });
        return issues;
      }
    }
  }

  return issues;
}
