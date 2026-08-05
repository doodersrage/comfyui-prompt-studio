/**
 * ComfyUI-Flux2Klein-Enhancer pack wiring:
 * - Compose / multi-reference: Multi ReferenceLatent + Identity Feature Transfer Final + Color Anchor
 * - Plain Klein T2I: Text Enhancer on positive conditioning
 * @see https://github.com/capitan01R/ComfyUI-Flux2Klein-Enhancer
 */

import { isFluxKleinModel } from './model-denoise-defaults';
import { FLUX_GUIDANCE_NODE_TYPE } from './flux-guidance-patch';
import { normalizeInputImageFilenames } from './workflow-load-image-bindings';

export const KLEIN_MULTI_REF_NODE = 'Flux2KleinMultiReferenceLatent';
export const KLEIN_IDENTITY_FINAL_NODE = 'IdentityFeatureTransferFinal';
export const KLEIN_TEXT_ENHANCER_NODE = 'Flux2KleinTextEnhancer';
export const KLEIN_COLOR_ANCHOR_NODE = 'Flux2KleinColorAnchor';

export type KleinEnhancerIdentityPreset = 'HARD_LOCK' | 'MID_LOCK' | 'SOFT_LOCK';

export const DEFAULT_KLEIN_TEXT_ENHANCER_MAGNITUDE = 1.08;
export const DEFAULT_KLEIN_TEXT_ENHANCER_CONTRAST = 0.1;
export const DEFAULT_KLEIN_COLOR_ANCHOR_STRENGTH = 0.45;

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export type KleinEnhancerPackWiringOptions = {
  model?: string;
  inputImageFilename?: string | null;
  inputImageFilenames?: Array<string | undefined | null> | null;
  availableNodeTypes?: Iterable<string> | null;
  /** When false, skip all enhancer wiring. Default true. */
  enabled?: boolean;
  identityPreset?: KleinEnhancerIdentityPreset;
  /** Compose identity-lock strength maps to HARD/MID/SOFT when preset is unset. */
  identityLockStrength?: number;
  /** Wire Flux2KleinTextEnhancer on positive conditioning (T2I + compose). Default true. */
  textEnhancerEnabled?: boolean;
  textEnhancerMagnitude?: number;
  textEnhancerContrast?: number;
  /** Wire Color Anchor on compose model path. Default true when references are queued. */
  colorAnchorEnabled?: boolean;
  colorAnchorStrength?: number;
};

export type KleinEnhancerPackWiringResult = {
  workflow: Record<string, unknown>;
  wired: boolean;
  insertedNodeIds: string[];
  /** True when Multi ReferenceLatent + Identity Feature Transfer Final were applied. */
  usedEnhancer: boolean;
  usedTextEnhancer?: boolean;
  usedColorAnchor?: boolean;
};

function toTypeSet(available?: Iterable<string> | null): Set<string> | undefined {
  if (!available) {
    return undefined;
  }
  return available instanceof Set ? available : new Set(available);
}

function nodeTypeAvailable(
  availableNodeTypes: Iterable<string> | null | undefined,
  classType: string
): boolean {
  const types = toTypeSet(availableNodeTypes);
  if (!types) {
    return true;
  }
  return types.has(classType);
}

/** Compose path: Multi ReferenceLatent + Identity Feature Transfer Final. */
export function kleinEnhancerPackAvailable(availableNodeTypes?: Iterable<string> | null): boolean {
  return (
    nodeTypeAvailable(availableNodeTypes, KLEIN_MULTI_REF_NODE) &&
    nodeTypeAvailable(availableNodeTypes, KLEIN_IDENTITY_FINAL_NODE)
  );
}

export function kleinTextEnhancerAvailable(availableNodeTypes?: Iterable<string> | null): boolean {
  return nodeTypeAvailable(availableNodeTypes, KLEIN_TEXT_ENHANCER_NODE);
}

export function kleinColorAnchorAvailable(availableNodeTypes?: Iterable<string> | null): boolean {
  return nodeTypeAvailable(availableNodeTypes, KLEIN_COLOR_ANCHOR_NODE);
}

export function resolveKleinEnhancerIdentityPreset(input: {
  preset?: KleinEnhancerIdentityPreset;
  identityLockStrength?: number;
}): KleinEnhancerIdentityPreset {
  if (
    input.preset === 'HARD_LOCK' ||
    input.preset === 'MID_LOCK' ||
    input.preset === 'SOFT_LOCK'
  ) {
    return input.preset;
  }
  const strength = Number(input.identityLockStrength);
  if (!Number.isFinite(strength)) {
    return 'MID_LOCK';
  }
  if (strength >= 0.75) {
    return 'HARD_LOCK';
  }
  if (strength >= 0.45) {
    return 'MID_LOCK';
  }
  return 'SOFT_LOCK';
}

function normalizeColorAnchorStrength(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_KLEIN_COLOR_ANCHOR_STRENGTH;
  }
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

function isNodeOutputRef(value: unknown): value is [string, number] {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'number';
}

function nextWorkflowNodeId(workflow: Record<string, WorkflowNode>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = Number(key);
    if (Number.isFinite(parsed) && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

function findPrimarySampler(
  workflow: Record<string, WorkflowNode>
): { samplerId: string; inputs: Record<string, unknown> } | null {
  for (const [samplerId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !('latent_image' in node.inputs) || !('positive' in node.inputs)) {
      continue;
    }
    return { samplerId, inputs: node.inputs };
  }
  return null;
}

function findCfgGuiderModelLink(
  workflow: Record<string, WorkflowNode>
): { guiderId: string; modelLinkId: string } | null {
  for (const [guiderId, node] of Object.entries(workflow)) {
    if (node?.class_type !== 'CFGGuider' || !node.inputs?.model) {
      continue;
    }
    const modelLink = node.inputs.model;
    if (Array.isArray(modelLink) && typeof modelLink[0] === 'string') {
      return { guiderId, modelLinkId: modelLink[0] };
    }
  }
  return null;
}

function findPrimaryModelLink(
  workflow: Record<string, WorkflowNode>
): { consumerId: string; modelLinkId: string; inputKey: 'model' } | null {
  const sampler = findPrimarySampler(workflow);
  if (sampler) {
    const modelLink = sampler.inputs.model;
    if (Array.isArray(modelLink) && typeof modelLink[0] === 'string') {
      return { consumerId: sampler.samplerId, modelLinkId: modelLink[0], inputKey: 'model' };
    }
  }
  const guider = findCfgGuiderModelLink(workflow);
  if (guider) {
    return { consumerId: guider.guiderId, modelLinkId: guider.modelLinkId, inputKey: 'model' };
  }
  return null;
}

function workflowHasEnhancerIdentity(workflow: Record<string, WorkflowNode>): boolean {
  return Object.values(workflow).some(
    node =>
      node?.class_type === KLEIN_IDENTITY_FINAL_NODE || node?.class_type === KLEIN_MULTI_REF_NODE
  );
}

function workflowHasTextEnhancer(workflow: Record<string, WorkflowNode>): boolean {
  return Object.values(workflow).some(node => node?.class_type === KLEIN_TEXT_ENHANCER_NODE);
}

function peelReferenceLatentChain(
  workflow: Record<string, WorkflowNode>,
  positiveRef: [string, number]
): {
  textCond: [string, number];
  latentEncodes: [string, number][];
  refNodeIds: string[];
} {
  let cursor = positiveRef[0];
  const latentEncodes: [string, number][] = [];
  const refNodeIds: string[] = [];
  const visited = new Set<string>();

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node = workflow[cursor];
    if (node?.class_type !== 'ReferenceLatent') {
      break;
    }
    const latent = node.inputs?.latent;
    if (isNodeOutputRef(latent)) {
      latentEncodes.unshift(latent);
    }
    refNodeIds.push(cursor);
    const prev = node.inputs?.conditioning;
    cursor = isNodeOutputRef(prev) ? prev[0] : '';
  }

  return {
    textCond: [cursor, positiveRef[1]],
    latentEncodes,
    refNodeIds,
  };
}

function insertTextEnhancerNode(
  workflow: Record<string, WorkflowNode>,
  conditioningSource: [string, number],
  magnitude: number,
  contrast: number
): string {
  const textEnhancerId = nextWorkflowNodeId(workflow);
  workflow[textEnhancerId] = {
    class_type: KLEIN_TEXT_ENHANCER_NODE,
    inputs: {
      conditioning: conditioningSource,
      magnitude,
      contrast,
      normalize_strength: 0,
      skip_bos: true,
      debug: false,
    },
    _meta: { title: 'Prompt Studio — Klein text enhancer' },
  };
  return textEnhancerId;
}

function positiveUsesComposeReferenceChain(
  workflow: Record<string, WorkflowNode>,
  positiveRef: [string, number]
): boolean {
  let cursor = positiveRef[0];
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const node = workflow[cursor];
    if (!node?.class_type) {
      break;
    }
    if (
      node.class_type === 'ReferenceLatent' ||
      node.class_type === KLEIN_MULTI_REF_NODE ||
      node.class_type === KLEIN_IDENTITY_FINAL_NODE
    ) {
      return true;
    }
    if (node.class_type === FLUX_GUIDANCE_NODE_TYPE) {
      const source = node.inputs?.conditioning;
      cursor = isNodeOutputRef(source) ? source[0] : '';
      continue;
    }
    break;
  }
  return false;
}

function resolveT2ITextEnhancerInsertPoint(
  workflow: Record<string, WorkflowNode>,
  sampler: { samplerId: string; inputs: Record<string, unknown> },
  positiveRef: [string, number]
): {
  conditioningSource: [string, number];
  consumers: Array<{ nodeId: string; inputKey: string }>;
} | null {
  const directId = positiveRef[0];
  const directNode = workflow[directId];
  if (!directNode?.class_type) {
    return null;
  }
  if (directNode.class_type === KLEIN_TEXT_ENHANCER_NODE) {
    return null;
  }
  if (directNode.class_type === FLUX_GUIDANCE_NODE_TYPE) {
    const source = directNode.inputs?.conditioning;
    if (!isNodeOutputRef(source)) {
      return null;
    }
    return {
      conditioningSource: source,
      consumers: [{ nodeId: directId, inputKey: 'conditioning' }],
    };
  }
  if (directNode.class_type === 'CLIPTextEncode') {
    return {
      conditioningSource: positiveRef,
      consumers: [{ nodeId: sampler.samplerId, inputKey: 'positive' }],
    };
  }
  return null;
}

function wireKleinT2ITextEnhancer(
  workflow: Record<string, unknown>,
  options: KleinEnhancerPackWiringOptions
): KleinEnhancerPackWiringResult {
  const empty: KleinEnhancerPackWiringResult = {
    workflow,
    wired: false,
    insertedNodeIds: [],
    usedEnhancer: false,
  };

  if (options.textEnhancerEnabled === false || !kleinTextEnhancerAvailable(options.availableNodeTypes)) {
    return empty;
  }

  const typed = workflow as Record<string, WorkflowNode>;
  if (workflowHasTextEnhancer(typed)) {
    return empty;
  }

  const sampler = findPrimarySampler(typed);
  if (!sampler) {
    return empty;
  }

  const positiveRef = sampler.inputs.positive;
  if (!isNodeOutputRef(positiveRef)) {
    return empty;
  }
  if (positiveUsesComposeReferenceChain(typed, positiveRef)) {
    return empty;
  }

  const insertPoint = resolveT2ITextEnhancerInsertPoint(typed, sampler, positiveRef);
  if (!insertPoint) {
    return empty;
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const magnitude = options.textEnhancerMagnitude ?? DEFAULT_KLEIN_TEXT_ENHANCER_MAGNITUDE;
  const contrast = options.textEnhancerContrast ?? DEFAULT_KLEIN_TEXT_ENHANCER_CONTRAST;
  const textEnhancerId = insertTextEnhancerNode(
    next,
    insertPoint.conditioningSource,
    magnitude,
    contrast
  );

  for (const consumer of insertPoint.consumers) {
    const node = next[consumer.nodeId];
    if (node?.inputs) {
      node.inputs[consumer.inputKey] = [textEnhancerId, 0];
    }
  }

  return {
    workflow: next,
    wired: true,
    insertedNodeIds: [textEnhancerId],
    usedEnhancer: false,
    usedTextEnhancer: true,
  };
}

function wireKleinComposeEnhancerPack(
  workflow: Record<string, unknown>,
  options: KleinEnhancerPackWiringOptions
): KleinEnhancerPackWiringResult {
  const empty: KleinEnhancerPackWiringResult = {
    workflow,
    wired: false,
    insertedNodeIds: [],
    usedEnhancer: false,
  };

  const typed = workflow as Record<string, WorkflowNode>;
  if (workflowHasEnhancerIdentity(typed)) {
    return empty;
  }

  const sampler = findPrimarySampler(typed);
  if (!sampler) {
    return empty;
  }

  const positiveRef = sampler.inputs.positive;
  if (!isNodeOutputRef(positiveRef)) {
    return empty;
  }

  const { textCond, latentEncodes, refNodeIds } = peelReferenceLatentChain(typed, positiveRef);
  if (latentEncodes.length === 0) {
    return empty;
  }

  const modelLink = findPrimaryModelLink(typed);
  if (!modelLink) {
    return empty;
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const insertedNodeIds: string[] = [];
  const preset = resolveKleinEnhancerIdentityPreset(options);

  let multiRefConditioning: [string, number] = textCond;
  let usedTextEnhancer = false;
  if (
    options.textEnhancerEnabled !== false &&
    kleinTextEnhancerAvailable(options.availableNodeTypes) &&
    !workflowHasTextEnhancer(next)
  ) {
    const textEnhancerId = insertTextEnhancerNode(
      next,
      textCond,
      options.textEnhancerMagnitude ?? DEFAULT_KLEIN_TEXT_ENHANCER_MAGNITUDE,
      options.textEnhancerContrast ?? DEFAULT_KLEIN_TEXT_ENHANCER_CONTRAST
    );
    insertedNodeIds.push(textEnhancerId);
    multiRefConditioning = [textEnhancerId, 0];
    usedTextEnhancer = true;
  }

  const multiRefId = nextWorkflowNodeId(next);
  const multiInputs: Record<string, unknown> = {
    conditioning: multiRefConditioning,
    latent_1: latentEncodes[0],
  };
  for (let index = 1; index < Math.min(latentEncodes.length, 8); index += 1) {
    multiInputs[`latent_${index + 1}`] = latentEncodes[index];
  }
  next[multiRefId] = {
    class_type: KLEIN_MULTI_REF_NODE,
    inputs: multiInputs,
    _meta: { title: 'Prompt Studio — Klein multi reference' },
  };
  insertedNodeIds.push(multiRefId);

  const identityId = nextWorkflowNodeId(next);
  next[identityId] = {
    class_type: KLEIN_IDENTITY_FINAL_NODE,
    inputs: {
      model: [modelLink.modelLinkId, 0],
      preset,
      enabled: true,
      reference_index: 0,
      reference_indices: 'all',
      similarity_floor: 0.04,
      softmax_temperature: 0.025,
      mask_threshold: 1,
      double_blocks: '0-7:mid_img=0.55',
      single_blocks: '0:mid_img=0.22; 1:mid_img=0.24; 3:mid_img=0.28',
      debug: false,
      mask_behavior: 'focus_only',
    },
    _meta: { title: 'Prompt Studio — Klein identity transfer' },
  };
  insertedNodeIds.push(identityId);

  for (const refId of refNodeIds) {
    delete next[refId];
  }

  const samplerNode = next[sampler.samplerId];
  if (samplerNode?.inputs) {
    samplerNode.inputs.positive = [multiRefId, 0];
  }

  let modelOutputRef: [string, number] = [identityId, 0];
  let usedColorAnchor = false;
  const colorStrength = normalizeColorAnchorStrength(options.colorAnchorStrength);
  if (
    options.colorAnchorEnabled !== false &&
    colorStrength > 0 &&
    kleinColorAnchorAvailable(options.availableNodeTypes)
  ) {
    const colorAnchorId = nextWorkflowNodeId(next);
    next[colorAnchorId] = {
      class_type: KLEIN_COLOR_ANCHOR_NODE,
      inputs: {
        model: [identityId, 0],
        conditioning: [multiRefId, 0],
        strength: colorStrength,
        ramp_curve: 1.5,
        ref_index: 0,
        channel_weights: 'uniform',
        debug: false,
      },
      _meta: { title: 'Prompt Studio — Klein color anchor' },
    };
    insertedNodeIds.push(colorAnchorId);
    modelOutputRef = [colorAnchorId, 0];
    usedColorAnchor = true;
  }

  const consumer = next[modelLink.consumerId];
  if (consumer?.inputs) {
    consumer.inputs[modelLink.inputKey] = modelOutputRef;
  }

  return {
    workflow: next,
    wired: true,
    insertedNodeIds,
    usedEnhancer: true,
    usedTextEnhancer,
    usedColorAnchor,
  };
}

/**
 * Apply Flux2 Klein Enhancer pack wiring for compose/multi-reference and plain T2I.
 */
export function ensureKleinEnhancerPackWiringInWorkflow(
  workflow: Record<string, unknown>,
  options: KleinEnhancerPackWiringOptions
): KleinEnhancerPackWiringResult {
  const empty: KleinEnhancerPackWiringResult = {
    workflow,
    wired: false,
    insertedNodeIds: [],
    usedEnhancer: false,
  };

  if (options.enabled === false || !isFluxKleinModel(options.model)) {
    return empty;
  }

  const figures = normalizeInputImageFilenames(
    options.inputImageFilename,
    options.inputImageFilenames ?? undefined
  );

  if (figures.length > 0 && kleinEnhancerPackAvailable(options.availableNodeTypes)) {
    const composeResult = wireKleinComposeEnhancerPack(workflow, options);
    if (composeResult.wired) {
      return composeResult;
    }
  }

  if (figures.length === 0) {
    return wireKleinT2ITextEnhancer(workflow, options);
  }

  return empty;
}

export function workflowUsesKleinEnhancerIdentity(
  workflow: Record<string, unknown> | null | undefined
): boolean {
  if (!workflow || typeof workflow !== 'object') {
    return false;
  }
  return workflowHasEnhancerIdentity(workflow as Record<string, WorkflowNode>);
}
