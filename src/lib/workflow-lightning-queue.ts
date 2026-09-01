import { isQwenLightningModel, QWEN_LIGHTNING_SHIFT_DEFAULT } from './model-sampling-patch';
import { isBooguTurboModel } from './model-denoise-defaults';
import {
  filenameLooksLikeCheckpointOnly,
  isVaeFilenameIncompatibleWithModel,
  type ModelLoaderFilenames,
} from './model-checkpoint-map';
import type { WorkflowParamValues } from './comfyui-config';
import { isLockLatentSizeParams } from './comfyui-config';
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  ensureLightningNativeResolutionParams,
} from './model-resolution-defaults';
import {
  precisionHintFromFilename,
  qwen2512UnetFilename,
  qwenDualClipFilename,
  qwenEdit2509UnetFilename,
  qwenEdit2511UnetFilename,
  qwenUnetFamilyFromFilename,
} from './model-loader-precision';
import { isLightningModelId, shouldNeutralizeStyleLorasAtQueue } from './model-sampler-defaults';
import {
  isLatentSizeNode,
  normalizeEmptyLatentForModel,
  patchLoaderNodesInWorkflow,
} from './workflow-direct-patch';
import { isPromptStudioOutputUpscaleNode } from './workflow-enrich-markers';
import {
  isLoraLoaderClassType,
  loraFilenameImpliesLightning,
  loraNameImpliesLightning,
  loraNameIsLightningSlot,
  LIGHTNING_LORA_TOKEN,
  alignLightningLoraFamilyInWorkflow,
  patchLoraNodesInWorkflow,
  resolveLoraLoaderFilename,
} from './workflow-lora-patch';
import {
  prepareQwenEditReferenceImagesForQueue,
  ensureQwenReferenceLatentWiringInWorkflow,
  scaleQwenEditReferenceImagesToLatentSize,
  pruneUnresolvedQwenEditFigureLoaders,
  nextLightningWorkflowNodeId,
} from './workflow-lightning-qwen-edit-queue';

const VAE_DECODE_TYPES = new Set(['VAEDecode']);
const OUTPUT_POST_PROCESS_TYPES = new Set([
  'ImageScaleBy',
  'ImageScale',
  'ImageScaleToTotalPixels',
  'ImageResize',
  'ImageResize+',
  'ImageSharpen',
  'ImageBlur',
  'ImageUpscaleWithModel',
  'UltimateSDUpscale',
  'LatentUpscale',
  'LatentUpscaleBy',
]);

const OUTPUT_POST_PROCESS_IMAGE_KEYS = [
  'image',
  'images',
  'pixels',
  'src_image',
  'input_image',
  'source',
] as const;

function isOutputPostProcessClass(classType: string | undefined): boolean {
  const type = classType?.trim() ?? '';
  if (!type) {
    return false;
  }
  if (OUTPUT_POST_PROCESS_TYPES.has(type)) {
    return true;
  }
  const lower = type.toLowerCase();
  if (/vae|latent|loader|encode|decode|save|preview|ksampler/i.test(lower)) {
    return false;
  }
  return /upscale|sharpen|resize|scale.?by|scale.?to/i.test(lower);
}

function getImageChainLink(inputs?: Record<string, unknown>): string | null {
  if (!inputs) {
    return null;
  }
  for (const key of OUTPUT_POST_PROCESS_IMAGE_KEYS) {
    const link = getLinkedNodeId(inputs[key]);
    if (link) {
      return link;
    }
  }
  return null;
}

export const QWEN_EDIT_ENCODE_TYPES = new Set([
  'TextEncodeQwenImageEdit',
  'TextEncodeQwenImageEditPlus',
  'TextEncodeBooguEdit',
]);

export const QWEN_EDIT_IMAGE_INPUT_KEYS = [
  'image',
  'image1',
  'image2',
  'image3',
  'image4',
] as const;

const QWEN_REF_LATENT_SCALE_TITLE = 'Prompt Studio — ref → latent size';

const VAE_LOADER_TYPES = new Set(['VAELoader']);
export const LOAD_IMAGE_TYPES = new Set(['LoadImage', 'LoadImageOutput']);
const VAE_ENCODE_TYPES = new Set(['VAEEncode']);
const EMPTY_LATENT_TYPES = new Set([
  'EmptyLatentImage',
  'EmptySD3LatentImage',
  'EmptyFlux2LatentImage',
]);

const UNET_LOADER_TYPES = new Set(['UNETLoader', 'UnetLoaderGGUF']);
const CHECKPOINT_LOADER_TYPES = new Set(['CheckpointLoaderSimple', 'CheckpointLoader']);
const CLIP_LOADER_TYPES = new Set(['CLIPLoader', 'DualCLIPLoader', 'CLIPLoaderGGUF']);
const AURA_FLOW_TYPE = 'ModelSamplingAuraFlow';

export type WorkflowNodeRecord = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export function getLinkedNodeId(value: unknown): string | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }
  const id = value[0];
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

export function isNodeOutputRef(value: unknown): value is [string, number] {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'number';
}

export function findVaeSourceRef(
  workflow: Record<string, WorkflowNodeRecord>
): [string, number] | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type && VAE_LOADER_TYPES.has(node.class_type)) {
      return [nodeId, 0];
    }
  }
  for (const node of Object.values(workflow)) {
    if (!node?.inputs) {
      continue;
    }
    if (
      (QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '') || node.class_type === 'VAEEncode') &&
      isNodeOutputRef(node.inputs.vae)
    ) {
      return node.inputs.vae;
    }
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type && CHECKPOINT_LOADER_TYPES.has(node.class_type)) {
      return [nodeId, 2];
    }
  }
  return null;
}

export function findPrimarySampler(
  workflow: Record<string, WorkflowNodeRecord>
): { samplerId: string; inputs: Record<string, unknown> } | null {
  for (const [samplerId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !('latent_image' in node.inputs)) {
      continue;
    }
    if (!('positive' in node.inputs)) {
      continue;
    }
    return { samplerId, inputs: node.inputs };
  }
  return null;
}

function workflowHasReferenceLatent(workflow: Record<string, WorkflowNodeRecord>): boolean {
  return Object.values(workflow).some(node => node?.class_type === 'ReferenceLatent');
}

/** Remove VAE from Qwen encode nodes — latents come from external VAEEncode + ReferenceLatent. */
export function disconnectQwenEditEncodeVae(workflow: Record<string, WorkflowNodeRecord>): void {
  for (const node of Object.values(workflow)) {
    const classType = node?.class_type ?? '';
    if (!node?.inputs || classType === 'TextEncodeBooguEdit') {
      continue;
    }
    if (!QWEN_EDIT_ENCODE_TYPES.has(classType)) {
      continue;
    }
    if ('vae' in node.inputs) {
      delete node.inputs.vae;
    }
  }
}

export function wireQwenEditEncodeVisionImages(
  workflow: Record<string, WorkflowNodeRecord>,
  loaderIds: string[]
): string[] {
  const encodeImageKeys = ['image1', 'image2', 'image3', 'image4'] as const;
  const wiredNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    let changed = false;
    if (node.class_type === 'TextEncodeQwenImageEdit') {
      if (loaderIds[0]) {
        node.inputs.image = [loaderIds[0], 0];
        changed = true;
      }
    } else {
      for (let i = 0; i < loaderIds.length && i < encodeImageKeys.length; i += 1) {
        const key = encodeImageKeys[i]!;
        node.inputs[key] = [loaderIds[i]!, 0];
        changed = true;
      }
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
  return wiredNodeIds;
}

export function peelQwenReferenceLatentChain(
  workflow: Record<string, WorkflowNodeRecord>,
  positiveRef: [string, number]
): [string, number] {
  if (!workflowHasReferenceLatent(workflow)) {
    return positiveRef;
  }
  let cursor: string | null = positiveRef[0];
  const visited = new Set<string>();
  let textCond: [string, number] = positiveRef;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node: WorkflowNodeRecord | undefined = workflow[cursor];
    if (node?.class_type !== 'ReferenceLatent') {
      textCond = [cursor, 0];
      break;
    }
    const prev: unknown = node.inputs?.conditioning;
    cursor = isNodeOutputRef(prev) ? prev[0] : null;
  }
  for (const nodeId of visited) {
    if (workflow[nodeId]?.class_type === 'ReferenceLatent') {
      delete workflow[nodeId];
    }
  }
  return textCond;
}

export function ensureRefImageScaleNode(
  workflow: Record<string, WorkflowNodeRecord>,
  loaderId: string,
  width: number,
  height: number,
  insertedNodeIds: string[]
): string {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node?.class_type !== 'ImageScale' && node?.class_type !== 'ResizeImage') {
      continue;
    }
    if (node._meta?.title !== QWEN_REF_LATENT_SCALE_TITLE) {
      continue;
    }
    const imageRef = getLinkedNodeId(node.inputs?.image);
    if (imageRef !== loaderId) {
      continue;
    }
    if (node.inputs) {
      node.inputs.width = width;
      node.inputs.height = height;
      if (node.class_type === 'ImageScale') {
        node.inputs.upscale_method = node.inputs.upscale_method ?? 'lanczos';
        node.inputs.crop = 'center';
      }
    }
    if (node._meta?.title !== QWEN_REF_LATENT_SCALE_TITLE) {
      node._meta = { ...(node._meta ?? {}), title: QWEN_REF_LATENT_SCALE_TITLE };
    }
    return nodeId;
  }

  const scaleId = nextLightningWorkflowNodeId(workflow);
  workflow[scaleId] = {
    class_type: 'ImageScale',
    inputs: {
      image: [loaderId, 0],
      upscale_method: 'lanczos',
      width,
      height,
      crop: 'center',
    },
    _meta: { title: QWEN_REF_LATENT_SCALE_TITLE },
  };
  insertedNodeIds.push(scaleId);
  return scaleId;
}

/** ReferenceLatent edits start from EmptySD3Latent, not classic img2img VAEEncode. */
export function ensureQwenEmptyLatentForReferenceEdit(
  workflow: Record<string, WorkflowNodeRecord>,
  width: number,
  height: number,
  insertedNodeIds: string[]
): void {
  const sampler = findPrimarySampler(workflow);
  if (!sampler) {
    return;
  }
  const samplerNode = workflow[sampler.samplerId];
  if (!samplerNode?.inputs) {
    return;
  }

  const latentRef = samplerNode.inputs.latent_image;
  const latentId = isNodeOutputRef(latentRef) ? latentRef[0] : null;
  const latentNode = latentId ? workflow[latentId] : null;

  const patchEmptyLatentNode = (nodeId: string, node: WorkflowNodeRecord): void => {
    if (node.class_type !== 'EmptySD3LatentImage') {
      node.class_type = 'EmptySD3LatentImage';
    }
    if (node.inputs) {
      node.inputs.width = width;
      node.inputs.height = height;
      node.inputs.batch_size = node.inputs.batch_size ?? 1;
    }
    samplerNode.inputs!.latent_image = [nodeId, 0];
  };

  if (latentNode?.class_type && EMPTY_LATENT_TYPES.has(latentNode.class_type) && latentId) {
    patchEmptyLatentNode(latentId, latentNode);
    return;
  }

  const existingEmpty = Object.entries(workflow).find(
    ([, node]) => node?.class_type && EMPTY_LATENT_TYPES.has(node.class_type)
  );
  if (existingEmpty) {
    const [nodeId, node] = existingEmpty;
    patchEmptyLatentNode(nodeId, node!);
    return;
  }

  const emptyId = nextLightningWorkflowNodeId(workflow);
  workflow[emptyId] = {
    class_type: 'EmptySD3LatentImage',
    inputs: { width, height, batch_size: 1 },
    _meta: { title: 'Empty Latent' },
  };
  insertedNodeIds.push(emptyId);
  samplerNode.inputs.latent_image = [emptyId, 0];

  // Drop stale img2img VAEEncode when it only fed the sampler (not ReferenceLatent).
  if (latentId && latentNode?.class_type && VAE_ENCODE_TYPES.has(latentNode.class_type)) {
    const stillReferenced = Object.values(workflow).some(other => {
      if (!other?.inputs || other === latentNode) {
        return false;
      }
      return Object.values(other.inputs).some(value => getLinkedNodeId(value) === latentId);
    });
    if (!stillReferenced) {
      delete workflow[latentId];
    }
  }
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
  const classLower = (classType ?? '').toLowerCase();
  if (
    classLower.includes('ksampler') ||
    classLower.includes('samplercustom') ||
    classLower.includes('guider')
  ) {
    return true;
  }
  return 'seed' in inputs && ('steps' in inputs || 'cfg' in inputs);
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
  startId: string | null
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
  if (mapped && !/^\{\{[A-Z0-9_]+\}\}$/.test(mapped) && mapped.length > 0) {
    return mapped;
  }
  for (const value of Object.values(loraFilenames)) {
    const trimmed = value?.trim();
    if (trimmed && !/^\{\{[A-Z0-9_]+\}\}$/.test(trimmed) && loraFilenameImpliesLightning(trimmed)) {
      return trimmed;
    }
  }
  // Never insert the unresolved placeholder into the graph — that false-fails
  // preflight as "Unresolved {{LORA_LIGHTNING}}" even when the real issue is
  // a missing token/map entry.
  return null;
}

function findClipSourceRef(workflow: Record<string, WorkflowNodeRecord>): [string, number] | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || !CHECKPOINT_LOADER_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    return [nodeId, 1];
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node || !CLIP_LOADER_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    return [nodeId, 0];
  }
  return null;
}

function chainHasLightningLora(
  workflow: Record<string, WorkflowNodeRecord>,
  chainIds: string[],
  loraFilenames: Record<string, string>
): boolean {
  return chainIds.some(id => {
    const node = workflow[id];
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      return false;
    }
    return loraNameIsLightningSlot(node.inputs.lora_name, loraFilenames);
  });
}

function chainHasAuraFlow(
  workflow: Record<string, WorkflowNodeRecord>,
  chainIds: string[]
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
  loraFilenames: Record<string, string>
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

function findPrimaryModelLoaderId(workflow: Record<string, WorkflowNodeRecord>): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node && UNET_LOADER_TYPES.has(node.class_type ?? '')) {
      return nodeId;
    }
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node && CHECKPOINT_LOADER_TYPES.has(node.class_type ?? '')) {
      return nodeId;
    }
  }
  return null;
}

function listModelConsumerEntries(
  workflow: Record<string, WorkflowNodeRecord>,
  loaderId: string
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
  _clipRef: [string, number] | null
): string {
  // LightX2V official templates use LoraLoaderModelOnly — applying Lightning
  // LoRA to CLIP (strength_clip=1) produces swirly/worm artifacts.
  const loraId = nextWorkflowNodeId(workflow);
  workflow[loraId] = {
    class_type: 'LoraLoaderModelOnly',
    inputs: {
      model: [modelSourceId, 0],
      lora_name: lightningLoraName,
      strength_model: 1,
    },
    _meta: { title: 'Prompt Studio — Lightning LoRA' },
  };
  return loraId;
}

function ensureAuraAndLightningLoraOnModelLink(
  workflow: Record<string, WorkflowNodeRecord>,
  consumer: WorkflowNodeRecord,
  modelLink: string,
  lightningLoraName: string | null,
  loraFilenames: Record<string, string>,
  clipRef: [string, number] | null
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
      _meta: { title: 'Prompt Studio — Lightning AuraFlow' },
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
        typeof existing.inputs.lora_name !== 'string' ||
        !existing.inputs.lora_name.trim() ||
        /^\{\{[A-Z0-9_]+\}\}$/.test(existing.inputs.lora_name.trim())
      ) {
        existing.inputs.lora_name = lightningLoraName;
      }
      if ('strength_model' in existing.inputs) {
        existing.inputs.strength_model = 1;
      }
      if ('strength' in existing.inputs) {
        existing.inputs.strength = 1;
      }
    }
    aura.inputs.model = [existingLoraId, 0];
    return;
  }

  const loraId = insertLightningLoraNode(workflow, modelSource, lightningLoraName, clipRef);
  aura.inputs.model = [loraId, 0];
}

/**
 * Distilled Lightning needs UNET → Lightning LoRA → AuraFlow (shift ~3) → KSampler.
 * Missing LoRA or bypassed AuraFlow produces soft, malformed anatomy.
 */
export function ensureLightningModelChainInWorkflow(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {}
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
        clipRef
      );
      continue;
    }

    // SamplerCustom-style graphs: model often sits on BasicGuider / CFGGuider only.
    const classLower = (node.class_type ?? '').toLowerCase();
    if (!classLower.includes('guider')) {
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
      clipRef
    );
  }

  // Fallback for graphs with no sampler/guider model link (or only SamplerCustom):
  // insert LoRA + AuraFlow between the primary loader and its model consumers.
  if (lightningLoraName && !workflowHasLightningLora(next, loraFilenames)) {
    const loaderId = findPrimaryModelLoaderId(next);
    if (loaderId) {
      const consumers = listModelConsumerEntries(next, loaderId);
      if (consumers.length > 0) {
        const loraId = insertLightningLoraNode(next, loaderId, lightningLoraName, clipRef);
        const auraId = nextWorkflowNodeId(next);
        next[auraId] = {
          class_type: AURA_FLOW_TYPE,
          inputs: {
            model: [loraId, 0],
            shift: QWEN_LIGHTNING_SHIFT_DEFAULT,
          },
          _meta: { title: 'Prompt Studio — Lightning AuraFlow' },
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
  return Object.values(workflow).some(node => {
    if (!node || typeof node !== 'object') {
      return false;
    }
    return isLoraLoaderClassType((node as { class_type?: string }).class_type);
  });
}

export function workflowHasLightningLora(
  workflow: Record<string, unknown>,
  loraFilenames: Record<string, string> = {}
): boolean {
  return Object.values(workflow).some(node => {
    if (!node || typeof node !== 'object') {
      return false;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    if (!record.inputs || !isLoraLoaderClassType(record.class_type)) {
      return false;
    }
    if (loraNameImpliesLightning(record.inputs.lora_name, loraFilenames)) {
      return true;
    }
    if (record.class_type === 'Power Lora Loader (rgthree)') {
      for (const [key, value] of Object.entries(record.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== 'object') {
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
  model?: string
): {
  workflow: Record<string, unknown>;
  bypassedNodeIds: string[];
} {
  void model;
  return { workflow, bypassedNodeIds: [] };
}

/** Drop SaveImage ImageScale that squashes AR or downscales below EmptyLatent (figure pixel lock). */
export function bypassMismatchedSaveImageScaleToLatent(
  workflow: Record<string, unknown>,
  latentSize?: { width: number; height: number } | null
): { workflow: Record<string, unknown>; bypassedNodeIds: string[] } {
  if (!latentSize || latentSize.width <= 0 || latentSize.height <= 0) {
    return { workflow, bypassedNodeIds: [] };
  }
  const latentRatio = latentSize.width / latentSize.height;
  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  const bypassedNodeIds: string[] = [];

  for (const node of Object.values(next)) {
    if (
      (node?.class_type !== 'SaveImage' && node?.class_type !== 'SaveImageAdvanced') ||
      !node.inputs
    ) {
      continue;
    }
    const scaleId = getLinkedNodeId(node.inputs.images);
    if (!scaleId) {
      continue;
    }
    const scaleNode = next[scaleId];
    if (
      !scaleNode?.inputs ||
      (scaleNode.class_type !== 'ImageScale' && scaleNode.class_type !== 'ResizeImage') ||
      isPromptStudioOutputUpscaleNode(scaleNode)
    ) {
      continue;
    }
    const width = Number(scaleNode.inputs.width);
    const height = Number(scaleNode.inputs.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue;
    }
    const scaleRatio = width / height;
    const aspectMismatch = Math.abs(Math.log(scaleRatio / latentRatio)) > 0.02;
    const downscaleBelowLatent =
      width <= latentSize.width * 0.95 && height <= latentSize.height * 0.95;
    if (!aspectMismatch && !downscaleBelowLatent) {
      continue;
    }
    const upstream = getLinkedNodeId(scaleNode.inputs.image);
    if (!upstream) {
      continue;
    }
    node.inputs.images = [upstream, 0];
    bypassedNodeIds.push(scaleId);
  }

  return { workflow: next, bypassedNodeIds };
}

/**
 * Strip post-decode upscale/sharpen (community UltraSharp, UltimateSD, leftover
 * Prompt Studio Lanczos). 2512 Lightning CFG-1 already looks hard; enlarging it
 * makes wet streets and skin crunch. Optimizer may re-insert a blur-only polish.
 */
export function stripLightningOutputPostProcess(
  workflow: Record<string, unknown>,
  model?: string
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
    if (
      (node?.class_type !== 'SaveImage' && node?.class_type !== 'SaveImageAdvanced') ||
      !node.inputs
    ) {
      continue;
    }

    let link = getLinkedNodeId(node.inputs.images);
    const seenImageLinks = new Set<string>();
    while (link && !seenImageLinks.has(link)) {
      seenImageLinks.add(link);
      const upstream = next[link];
      if (!upstream) {
        break;
      }
      if (VAE_DECODE_TYPES.has(upstream.class_type ?? '')) {
        node.inputs.images = [link, 0];
        break;
      }
      if (!isOutputPostProcessClass(upstream.class_type)) {
        break;
      }
      strippedNodeIds.add(link);
      link = getImageChainLink(upstream.inputs);
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
  model?: string
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
    if (!decodeNode?.inputs || !VAE_DECODE_TYPES.has(decodeNode.class_type ?? '')) {
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
    const latentType = latent?.class_type ?? '';
    if (latentType !== 'LatentUpscale' && latentType !== 'LatentUpscaleBy') {
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

/** Disable style/NSFW LoRAs stacked on CFG-1 distilled workflows — they cause banding and melt. */
export function neutralizeNonLightningLoras(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {}
): {
  workflow: Record<string, unknown>;
  neutralizedNodeIds: string[];
} {
  if (!shouldNeutralizeStyleLorasAtQueue(model)) {
    return { workflow, neutralizedNodeIds: [] };
  }

  if (isQwenLightningModel(model) && !workflowHasLightningLora(workflow, loraFilenames)) {
    return { workflow, neutralizedNodeIds: [] };
  }

  if (
    isLightningModelId(String(model ?? '')) &&
    !isQwenLightningModel(model) &&
    !workflowHasLoraLoader(workflow)
  ) {
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

    if (node.class_type === 'Power Lora Loader (rgthree)') {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== 'object') {
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
        const hasLora = typeof slot.lora === 'string' && slot.lora.trim().length > 0;
        if (!hasLora && slot.on !== true) {
          continue;
        }
        slot.on = false;
        if ('strength' in slot) {
          slot.strength = 0;
        }
        if ('strengthTwo' in slot && slot.strengthTwo != null) {
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

    if ('strength_model' in node.inputs) {
      node.inputs.strength_model = 0;
    }
    if ('strength_clip' in node.inputs) {
      node.inputs.strength_clip = 0;
    }
    if ('strength' in node.inputs) {
      node.inputs.strength = 0;
    }
    neutralizedNodeIds.push(nodeId);
  }

  // Pack graphs often bake Lightning once in a LoraLoader|pysssss chain and again as
  // LoraLoaderModelOnly — keep only the sampler-nearest Lightning loader at strength.
  const samplerModelLink = (() => {
    for (const node of Object.values(next)) {
      const classType = node?.class_type ?? '';
      if (
        classType !== 'KSampler' &&
        classType !== 'KSamplerAdvanced' &&
        classType !== 'SamplerCustom' &&
        classType !== 'SamplerCustomAdvanced' &&
        classType !== 'ModelSamplingAuraFlow'
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
        node.class_type !== 'Power Lora Loader (rgthree)' &&
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
      if ('strength_model' in node.inputs) {
        node.inputs.strength_model = 0;
      }
      if ('strength_clip' in node.inputs) {
        node.inputs.strength_clip = 0;
      }
      if ('strength' in node.inputs) {
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
  loraFilenames: Record<string, string> = {}
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
    if (node.class_type === 'Power Lora Loader (rgthree)') {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== 'object') {
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
        if ('strength' in slot) {
          slot.strength = 1;
        }
      }
      continue;
    }
    if (!loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)) {
      continue;
    }

    if ('strength_model' in node.inputs) {
      node.inputs.strength_model = 1;
    }
    // Official LightX2V recipes keep CLIP at 0 (model-only adaptation).
    if ('strength_clip' in node.inputs) {
      node.inputs.strength_clip = 0;
    }
    if ('strength' in node.inputs) {
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
  params: Pick<WorkflowParamValues, 'width' | 'height' | 'lockLatentSize'> | undefined,
  model?: string
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const width = Number(params?.width);
  const height = Number(params?.height);
  const lockExact = isLockLatentSizeParams(params);
  // Prefer queue params when present, but always snap oversized / extreme leftovers
  // (raw Compose uploads, stale gallery dims) to Lightning-safe presets.
  let resolvedWidth = Number.isFinite(width) && width > 0 ? width : undefined;
  let resolvedHeight = Number.isFinite(height) && height > 0 ? height : undefined;
  if (resolvedWidth != null && resolvedHeight != null && !lockExact) {
    const clamped = ensureLightningNativeResolutionParams(
      { width: resolvedWidth, height: resolvedHeight },
      model ?? 'qwen-image-2512-lightning-8',
      DEFAULT_RESOLUTION_ORIENTATION,
      DEFAULT_RESOLUTION_SIZE_TIER,
      { preserveInputAspect: true }
    );
    resolvedWidth = Number(clamped.width);
    resolvedHeight = Number(clamped.height);
  }
  if (resolvedWidth == null || resolvedHeight == null) {
    const resolved = ensureLightningNativeResolutionParams(
      {},
      model ?? 'qwen-image-2512-lightning-8',
      DEFAULT_RESOLUTION_ORIENTATION,
      DEFAULT_RESOLUTION_SIZE_TIER
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
    if (!inputs || !isLatentSizeNode(node.class_type ?? '', inputs)) {
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
  model?: string
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;

  for (const node of Object.values(next)) {
    if (!node?.inputs || !UNET_LOADER_TYPES.has(node.class_type ?? '')) {
      continue;
    }
    const dtype = node.inputs.weight_dtype;
    if (typeof dtype !== 'string') {
      continue;
    }
    if (/fp8|e4m3fn|fp16|float16/i.test(dtype)) {
      node.inputs.weight_dtype = 'default';
    }
  }

  return next;
}

const LOADER_FILENAME_FIELDS = [
  'unet_name',
  'ckpt_name',
  // Do not rewrite CLIP here — official LightX2V keeps fp8_scaled CLIP with bf16 UNET.
] as const;

function rewriteFp8FilenameToBf16(filename: string, model?: string): string | undefined {
  if (precisionHintFromFilename(filename) !== 'fp8') {
    return undefined;
  }
  const lower = filename.toLowerCase();
  if (/clip|qwen_2\.5_vl|text_encoder/.test(lower)) {
    return undefined;
  }
  // Prefer the concrete filename's family — never swap 2512↔edit from model id alone.
  const family = qwenUnetFamilyFromFilename(filename);
  if (family === 'edit-2511') {
    return qwenEdit2511UnetFilename('bf16');
  }
  if (family === 'edit-2509') {
    return qwenEdit2509UnetFilename('bf16');
  }
  if (family === 't2i') {
    return qwen2512UnetFilename('bf16');
  }
  if (model?.includes('edit-2511')) {
    return qwenEdit2511UnetFilename('bf16');
  }
  if (model?.includes('edit-2509')) {
    return qwenEdit2509UnetFilename('bf16');
  }
  return qwen2512UnetFilename('bf16');
}

/** Rewrite concrete fp8 UNET/CLIP filenames to bf16 — Lightning must not run mixed fp8. */
export function forceLightningBf16FilenamesInWorkflow(
  workflow: Record<string, unknown>,
  model?: string
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
      if (typeof value !== 'string' || !value.trim()) {
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
  loaders?: ModelLoaderFilenames
): ModelLoaderFilenames {
  const next: ModelLoaderFilenames = { ...(loaders ?? {}) };
  const preferredUnet = model?.includes('edit-2511')
    ? qwenEdit2511UnetFilename('bf16')
    : model?.includes('edit-2509')
      ? qwenEdit2509UnetFilename('bf16')
      : qwen2512UnetFilename('bf16');
  const existingUnet =
    typeof next.unet === 'string' && next.unet.trim() && !filenameLooksLikeCheckpointOnly(next.unet)
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
    precisionHintFromFilename(next.checkpoint) === 'fp8' ||
    filenameLooksLikeCheckpointOnly(next.checkpoint)
  ) {
    next.checkpoint = next.unet;
  }
  // Keep caller CLIP when set — LightX2V official uses fp8_scaled CLIP with bf16 UNET.
  if (!next.dualClip?.trim()) {
    next.dualClip = qwenDualClipFilename('bf16');
  }
  // Sticky Flux ae.safetensors / wrong Settings VAE maps mosaic Qwen Edit Lightning.
  if (!next.vae?.trim() || (model && isVaeFilenameIncompatibleWithModel(model, next.vae))) {
    next.vae = 'qwen_image_vae.safetensors';
  }
  return next;
}

/** Rewrite Flux/SD VAEs on Lightning graphs to qwen_image_vae (decode mismatch → gray mosaic). */
export function forceQwenVaeInLightningWorkflow(
  workflow: Record<string, unknown>,
  model?: string
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }
  const next = structuredClone(workflow) as Record<string, WorkflowNodeRecord>;
  for (const node of Object.values(next)) {
    if (node?.class_type !== 'VAELoader' || !node.inputs) {
      continue;
    }
    const current = node.inputs.vae_name;
    if (typeof current !== 'string' || !current.trim()) {
      node.inputs.vae_name = 'qwen_image_vae.safetensors';
      continue;
    }
    if (isVaeFilenameIncompatibleWithModel(model ?? '', current)) {
      node.inputs.vae_name = 'qwen_image_vae.safetensors';
    }
  }
  return next;
}

export function alignLightningBf16LoadersInWorkflow(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames | undefined,
  model?: string,
  options?: { syncLoadersToModel?: boolean }
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
  loraFilenames: Record<string, string> = {}
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
    const classLower = (node.class_type ?? '').toLowerCase();
    if (classLower.includes('samplercustom')) {
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
    const classLower = (node.class_type ?? '').toLowerCase();
    if (!classLower.includes('guider')) {
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
// Qwen Edit reference-image wiring for the queue path lives in
// workflow-lightning-qwen-edit-queue.ts; re-exported here unchanged so
// existing external imports from './workflow-lightning-queue' keep working.
export {
  disconnectQwenEditReferenceImagesForTxt2Img,
  ensureQwenEditReferenceImagesForImg2Img,
  scaleQwenEditReferenceImagesToLatentSize,
  ensureQwenReferenceLatentWiringInWorkflow,
  pruneUnresolvedQwenEditFigureLoaders,
  prepareQwenEditReferenceImagesForQueue,
} from './workflow-lightning-qwen-edit-queue';

export function prepareLightningWorkflowForQueue(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
  options?: {
    params?: WorkflowParamValues;
    loaders?: ModelLoaderFilenames;
    syncLoadersToModel?: boolean;
  }
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }

  let working = workflow;
  if (isLockLatentSizeParams(options?.params)) {
    working = forceLightningLatentSizeInWorkflow(working, options?.params, model);
  }

  const refsPrepared = prepareQwenEditReferenceImagesForQueue(working, model, options?.params);

  const loraPatch = patchLoraNodesInWorkflow(refsPrepared, loraFilenames);
  const familyAligned = alignLightningLoraFamilyInWorkflow(
    loraPatch.workflow,
    model,
    loraFilenames
  );

  const finishLightningGraph = (
    workflowAfterLatent: Record<string, unknown>
  ): Record<string, unknown> => {
    // Sticky Flux ae.safetensors on Qwen Edit Lightning → gray mosaic decode.
    const vaeFixed = forceQwenVaeInLightningWorkflow(workflowAfterLatent, model);
    const latentSize = readEmptyLatentSize(vaeFixed) ?? options?.params;
    const hasInputImage = Boolean(
      options?.params?.inputImageFilename?.toString().trim() ||
      options?.params?.inputImageFilenames?.some(name => Boolean(name?.toString().trim()))
    );
    const sized = hasInputImage
      ? ensureQwenReferenceLatentWiringInWorkflow(vaeFixed, {
          inputImageFilename: options?.params?.inputImageFilename?.toString(),
          inputImageFilenames: options?.params?.inputImageFilenames,
          width: latentSize?.width,
          height: latentSize?.height,
        }).workflow
      : scaleQwenEditReferenceImagesToLatentSize(vaeFixed, latentSize ?? options?.params).workflow;
    const resolvedLatentSize = readEmptyLatentSize(sized);
    const saveBypass = bypassMismatchedSaveImageScaleToLatent(sized, resolvedLatentSize).workflow;
    return pruneUnresolvedQwenEditFigureLoaders(saveBypass).workflow;
  };

  // If a Lightning LoRA is already present, repair LoRA wiring/strengths and
  // still force queue latent size — extreme leftover sizes cause mosaic melt.
  if (workflowHasLightningLora(familyAligned.workflow, loraFilenames)) {
    const chainEnsured = isNativeLightningWorkflowReady(
      familyAligned.workflow,
      model,
      loraFilenames
    )
      ? familyAligned.workflow
      : ensureLightningModelChainInWorkflow(familyAligned.workflow, model, loraFilenames);
    const normalizedLoras = normalizeLightningLoraStrengths(chainEnsured, model, loraFilenames);
    const latentSized = forceLightningLatentSizeInWorkflow(normalizedLoras, options?.params, model);
    const fp8Rewritten = forceLightningBf16FilenamesInWorkflow(latentSized, model);
    const weightDtype = normalizeLightningUnetWeightDtype(fp8Rewritten, model);
    const hiresStripped = stripLightningHiresPass(weightDtype, model);
    const stripped = stripLightningOutputPostProcess(hiresStripped.workflow, model);
    const neutralized = neutralizeNonLightningLoras(
      stripped.workflow,
      model,
      loraFilenames
    ).workflow;
    return finishLightningGraph(neutralized);
  }

  const chainEnsured = ensureLightningModelChainInWorkflow(
    familyAligned.workflow,
    model,
    loraFilenames
  );
  const normalizedLoras = normalizeLightningLoraStrengths(chainEnsured, model, loraFilenames);
  const latentSized = forceLightningLatentSizeInWorkflow(normalizedLoras, options?.params, model);
  const fp8Rewritten = forceLightningBf16FilenamesInWorkflow(latentSized, model);
  const loadersAligned = alignLightningBf16LoadersInWorkflow(
    fp8Rewritten,
    options?.loaders,
    model,
    { syncLoadersToModel: options?.syncLoadersToModel }
  );
  const weightDtype = normalizeLightningUnetWeightDtype(loadersAligned, model);
  const samplingKept = bypassModelSamplingAuraFlowForLightning(weightDtype, model);
  const hiresStripped = stripLightningHiresPass(samplingKept.workflow, model);
  const stripped = stripLightningOutputPostProcess(hiresStripped.workflow, model);
  const neutralized = neutralizeNonLightningLoras(stripped.workflow, model, loraFilenames).workflow;
  return finishLightningGraph(neutralized);
}

const AURA_FLOW_CLASS = 'ModelSamplingAuraFlow';
const CONDITIONING_ZERO_OUT = 'ConditioningZeroOut';

/**
 * Official Boogu Turbo: CFG 1, empty negative via ConditioningZeroOut, no AuraFlow shift.
 * Pack/scaffold graphs that CLIP-encode negatives or insert ModelSamplingAuraFlow over-cook.
 */
export function prepareBooguTurboWorkflowForQueue(
  workflow: Record<string, unknown>,
  model?: string
): Record<string, unknown> {
  if (!isBooguTurboModel(model)) {
    return workflow;
  }

  const next = JSON.parse(JSON.stringify(workflow)) as Record<string, WorkflowNodeRecord>;

  for (const node of Object.values(next)) {
    if (node?.class_type === 'TextEncodeBooguEdit' && node.inputs) {
      node.inputs.negative_prompt = '';
    }
  }

  for (const node of Object.values(next)) {
    if (!node?.inputs || !isSamplerNode(node.class_type, node.inputs)) {
      continue;
    }
    if (!isMainGenerateSampler(node.inputs)) {
      continue;
    }

    const positiveRef = node.inputs.positive;
    if (Array.isArray(positiveRef) && positiveRef.length >= 2) {
      const zeroId = nextWorkflowNodeId(next);
      next[zeroId] = {
        class_type: CONDITIONING_ZERO_OUT,
        inputs: { conditioning: [String(positiveRef[0]), Number(positiveRef[1])] },
        _meta: { title: 'Boogu Turbo — zero negative' },
      };
      node.inputs.negative = [zeroId, 0];
    }

    const modelNodeId = getLinkedNodeId(node.inputs.model);
    if (!modelNodeId) {
      continue;
    }
    const modelNode = next[modelNodeId];
    if (modelNode?.class_type !== AURA_FLOW_CLASS) {
      continue;
    }
    const bypassRef = modelNode.inputs?.model;
    if (Array.isArray(bypassRef) && bypassRef.length >= 2) {
      node.inputs.model = [String(bypassRef[0]), Number(bypassRef[1])];
    }
  }

  return next;
}

export function readEmptyLatentSize(
  workflow: Record<string, unknown>
): { width: number; height: number } | null {
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs || !isLatentSizeNode(record.class_type ?? '', inputs)) {
      continue;
    }
    const width = Number(inputs.width);
    const height = Number(inputs.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  return null;
}

export type LightningWorkflowAuditIssue = {
  severity: 'error' | 'warn';
  message: string;
};

/** Native turbo stacks (Boogu / Z-Image) — warn on harmful Lightning LoRA stacking, validate UNET. */
export function auditDistilledTurboWorkflowIssues(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  model?: string;
  loraFilenames?: Record<string, string>;
}): LightningWorkflowAuditIssue[] {
  const modelId = String(input.model ?? '').trim();
  if (!/^boogu-image(?:-edit)?-turbo$|^z-image-turbo$/i.test(modelId)) {
    return [];
  }

  type TurboNode = {
    class_type?: string;
    inputs?: Record<string, unknown>;
  };
  let parsed: Record<string, TurboNode> | null = null;
  if (input.workflow && typeof input.workflow === 'object') {
    parsed = input.workflow as Record<string, TurboNode>;
  } else if (input.workflowJson?.trim()) {
    try {
      parsed = JSON.parse(input.workflowJson) as Record<string, TurboNode>;
    } catch {
      return [];
    }
  }
  if (!parsed) {
    return [];
  }

  const issues: LightningWorkflowAuditIssue[] = [];
  const loraFilenames = input.loraFilenames ?? {};

  for (const node of Object.values(parsed)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    const loraName = node.inputs.lora_name;
    const filename = resolveLoraLoaderFilename(loraName, loraFilenames)?.trim();
    if (!filename) {
      if (
        typeof loraName === 'string' &&
        /^\{\{LORA_.*(LIGHTNING|LIGHTX2V).*\}\}$/i.test(loraName.trim())
      ) {
        issues.push({
          severity: 'warn',
          message:
            'Native turbo model with unresolved {{LORA_LIGHTNING}} — turbo UNETs are already distilled; bypass or remove the LoRA loader instead of mapping a Lightning LoRA.',
        });
      }
      continue;
    }
    const lower = filename.toLowerCase();
    if (
      /lightx2v|qwen[-_.\s]*image[-_.\s]*lightning|lightning[-_.\s]*8\s*step|lightning[-_.\s]*4\s*step/.test(
        lower
      )
    ) {
      issues.push({
        severity: 'error',
        message: `Lightning acceleration LoRA (${filename}) stacked on ${modelId} — turbo models are natively distilled; remove this LoRA to avoid over-processing and anatomy melt.`,
      });
    }
  }

  for (const node of Object.values(parsed)) {
    if (node?.class_type !== 'UNETLoader' || typeof node.inputs?.unet_name !== 'string') {
      continue;
    }
    const unet = node.inputs.unet_name.trim().toLowerCase();
    if (!/boogu_image/.test(unet)) {
      continue;
    }
    const wantsTurbo = /turbo/i.test(modelId);
    const wantsEdit = /edit/i.test(modelId);
    if (wantsTurbo && !/turbo/.test(unet)) {
      issues.push({
        severity: 'error',
        message: `Boogu Turbo is loading non-turbo UNET “${node.inputs.unet_name}” — use boogu_image_turbo_bf16.safetensors (T2I) or boogu_image_edit_turbo_bf16.safetensors (Edit).`,
      });
    }
    if (wantsEdit && !/edit/.test(unet)) {
      issues.push({
        severity: 'error',
        message: `Boogu Edit Turbo is loading T2I UNET “${node.inputs.unet_name}” — use boogu_image_edit_turbo_bf16.safetensors.`,
      });
    }
    if (!wantsEdit && /edit/.test(unet) && wantsTurbo) {
      issues.push({
        severity: 'error',
        message: `Boogu Image Turbo is loading Edit UNET “${node.inputs.unet_name}” — use boogu_image_turbo_bf16.safetensors.`,
      });
    }
  }

  return issues;
}

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
  if (input.workflow && typeof input.workflow === 'object') {
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
      : prepareLightningWorkflowForQueue(parsed, input.model, input.loraFilenames ?? {})
  ) as typeof parsed;

  const issues: LightningWorkflowAuditIssue[] = [];

  if (!workflowHasLoraLoader(prepared)) {
    issues.push({
      severity: 'error',
      message:
        'Lightning model queued without a LoraLoader — set {{LORA_LIGHTNING}} on this workflow’s token overrides (or in Settings → LoRA library as ID “LIGHTNING”). Missing LoRA causes soft, malformed hands/faces.',
    });
  } else if (!workflowHasLightningLora(prepared, input.loraFilenames ?? {})) {
    issues.push({
      severity: 'error',
      message:
        'Lightning workflow has no Lightning LoRA mapped — set {{LORA_LIGHTNING}} on this workflow’s token overrides (or LoRA library) to your 8-step LightX2V .safetensors.',
    });
  } else {
    const modelId = String(input.model ?? '');
    const wantsEdit = /edit/i.test(modelId);
    for (const node of Object.values(prepared)) {
      if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
        continue;
      }
      const filename = resolveLoraLoaderFilename(node.inputs.lora_name, input.loraFilenames ?? {});
      if (!filename || !loraFilenameImpliesLightning(filename)) {
        continue;
      }
      const loraIsEdit = /edit/i.test(filename);
      if (wantsEdit !== loraIsEdit) {
        issues.push({
          severity: 'error',
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
    if (
      node.inputs &&
      isSamplerNode(node.class_type, node.inputs) &&
      isMainGenerateSampler(node.inputs)
    ) {
      hasMainSampler = true;
      const chain = walkModelChainIds(prepared, getLinkedNodeId(node.inputs.model));
      if (chainHasAuraFlow(prepared, chain)) {
        samplerUsesAuraFlow = true;
      }
    }
  }
  if (hasMainSampler && (!hasAuraFlow || !samplerUsesAuraFlow)) {
    issues.push({
      severity: 'error',
      message:
        'Lightning KSampler is missing ModelSamplingAuraFlow (shift ~3) on the model chain — without it, output is soft and anatomy drifts. Queue prep normally inserts this; check the workflow graph.',
    });
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    if (loraNameImpliesLightning(node.inputs.lora_name, input.loraFilenames ?? {})) {
      continue;
    }
    const filename = resolveLoraLoaderFilename(node.inputs.lora_name, input.loraFilenames ?? {});
    if (
      filename &&
      !loraFilenameImpliesLightning(filename) &&
      (loraStrengthIsActive(node.inputs.strength_model) ||
        loraStrengthIsActive(node.inputs.strength_clip) ||
        loraStrengthIsActive(node.inputs.strength))
    ) {
      issues.push({
        severity: 'warn',
        message:
          'Workflow stacks non-Lightning LoRAs (style/NSFW) on a Lightning model — Prompt Studio disables them at queue time. Remove them in ComfyUI or use a Lightning-only workflow for clean output.',
      });
      break;
    }
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs) {
      continue;
    }
    if (
      isLatentSizeNode(node.class_type ?? '', node.inputs) &&
      Number(node.inputs.width) === 1024 &&
      Number(node.inputs.height) === 1024
    ) {
      issues.push({
        severity: 'warn',
        message:
          'Lightning workflow latent is still 1024×1024 — queue should patch to 1328×1328 native. Restart the dev server and check Advanced queue params are not pinned to 1024.',
      });
      break;
    }
  }

  for (const node of Object.values(prepared)) {
    if (node?.class_type !== 'VAELoader' || !node.inputs) {
      continue;
    }
    const vaeName = node.inputs.vae_name;
    if (
      typeof vaeName === 'string' &&
      isVaeFilenameIncompatibleWithModel(String(input.model ?? ''), vaeName)
    ) {
      issues.push({
        severity: 'error',
        message: `Lightning graph VAE is “${vaeName}” — Qwen Image/Edit needs qwen_image_vae.safetensors. Flux ae.safetensors here decodes to gray mosaic. Queue prep should rewrite it; restart the app if this persists.`,
      });
      break;
    }
  }

  const latentSize = readEmptyLatentSize(prepared);
  if (latentSize && /edit/i.test(String(input.model ?? ''))) {
    let refSizeMismatch = false;
    const hasReferenceLatentChain = Object.values(prepared).some(
      node => node?.class_type === 'ReferenceLatent'
    );
    for (const node of Object.values(prepared)) {
      if (node?.class_type !== 'ReferenceLatent' || !node.inputs) {
        continue;
      }
      const latentRef = getLinkedNodeId(node.inputs.latent);
      if (!latentRef) {
        continue;
      }
      const encodeNode = prepared[latentRef];
      if (encodeNode?.class_type !== 'VAEEncode') {
        continue;
      }
      const pixelsRef = getLinkedNodeId(encodeNode.inputs?.pixels);
      if (!pixelsRef) {
        continue;
      }
      const scaleNode = prepared[pixelsRef];
      if (
        scaleNode?.class_type === 'ImageScale' &&
        (Number(scaleNode.inputs?.width) !== latentSize.width ||
          Number(scaleNode.inputs?.height) !== latentSize.height)
      ) {
        issues.push({
          severity: 'warn',
          message: `Edit Lightning ReferenceLatent ref scale is ${Number(scaleNode.inputs?.width)}×${Number(scaleNode.inputs?.height)} but EmptyLatent is ${latentSize.width}×${latentSize.height} — size mismatch mosaics CFG-1 Compose.`,
        });
        refSizeMismatch = true;
        break;
      }
    }
    if (!refSizeMismatch && !hasReferenceLatentChain) {
      for (const node of Object.values(prepared)) {
        if (!node?.inputs || !QWEN_EDIT_ENCODE_TYPES.has(node.class_type ?? '')) {
          continue;
        }
        if ('vae' in node.inputs) {
          issues.push({
            severity: 'warn',
            message:
              'Edit encode still has VAE wired — disconnect VAE and use VAEEncode + ReferenceLatent for appearance refs. Restart the app if queue prep did not apply.',
          });
          refSizeMismatch = true;
          break;
        }
      }
    }
  }

  for (const node of Object.values(prepared)) {
    if (!node?.inputs) {
      continue;
    }
    for (const value of Object.values(node.inputs)) {
      if (typeof value !== 'string') {
        continue;
      }
      if (/fp8|e4m3fn|fp8_scaled/i.test(value)) {
        issues.push({
          severity: 'warn',
          message:
            'Workflow still references fp8 weights — Prompt Studio will prefer bf16 for Lightning at queue time to reduce banding.',
        });
        return issues;
      }
    }
  }

  return issues;
}
