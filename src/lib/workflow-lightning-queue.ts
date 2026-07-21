import {
  isQwenLightningModel,
  QWEN_LIGHTNING_SHIFT_DEFAULT,
} from "./model-sampling-patch";
import type { ModelLoaderFilenames } from "./model-checkpoint-map";
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
} from "./model-loader-precision";
import {
  isLatentSizeNode,
  patchLoaderNodesInWorkflow,
} from "./workflow-direct-patch";
import { isPromptStudioOutputUpscaleNode } from "./workflow-enrich-markers";
import {
  loraFilenameImpliesLightning,
  loraNameImpliesLightning,
  LIGHTNING_LORA_TOKEN,
  patchLoraNodesInWorkflow,
  resolveLoraLoaderFilename,
} from "./workflow-lora-patch";

const VAE_DECODE_TYPES = new Set(["VAEDecode"]);
const OUTPUT_POST_PROCESS_TYPES = new Set([
  "ImageScaleBy",
  "ImageScale",
  "ImageSharpen",
  "ImageUpscaleWithModel",
  "LatentUpscale",
  "LatentUpscaleBy",
]);

const LORA_LOADER_TYPES = new Set([
  "LoraLoader",
  "LoraLoaderModelOnly",
]);

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

function resolveLightningLoraName(loraFilenames: Record<string, string>): string {
  const mapped = loraFilenames[LIGHTNING_LORA_TOKEN]?.trim();
  if (mapped) {
    return mapped;
  }
  for (const value of Object.values(loraFilenames)) {
    if (value?.trim() && loraFilenameImpliesLightning(value)) {
      return value.trim();
    }
  }
  return LIGHTNING_LORA_TOKEN;
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
    if (!node?.inputs || !LORA_LOADER_TYPES.has(node.class_type ?? "")) {
      return false;
    }
    return loraNameImpliesLightning(node.inputs.lora_name, loraFilenames);
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
    if (!node?.inputs || !LORA_LOADER_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    if (loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)) {
      return nodeId;
    }
  }
  return null;
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

  for (const samplerNode of Object.values(next)) {
    if (!samplerNode?.inputs || !isSamplerNode(samplerNode.class_type, samplerNode.inputs)) {
      continue;
    }
    if (!isMainGenerateSampler(samplerNode.inputs)) {
      continue;
    }

    const modelLink = getLinkedNodeId(samplerNode.inputs.model);
    if (!modelLink) {
      continue;
    }

    let chainIds = walkModelChainIds(next, modelLink);
    let auraId = chainHasAuraFlow(next, chainIds);

    if (!auraId) {
      auraId = nextWorkflowNodeId(next);
      next[auraId] = {
        class_type: AURA_FLOW_TYPE,
        inputs: {
          model: [modelLink, 0],
          shift: QWEN_LIGHTNING_SHIFT_DEFAULT,
        },
        _meta: { title: "Prompt Studio — Lightning AuraFlow" },
      };
      samplerNode.inputs.model = [auraId, 0];
      chainIds = walkModelChainIds(next, auraId);
    } else {
      const aura = next[auraId];
      if (aura?.inputs) {
        aura.inputs.shift = QWEN_LIGHTNING_SHIFT_DEFAULT;
      }
    }

    if (chainHasLightningLora(next, chainIds, loraFilenames)) {
      continue;
    }

    const aura = next[auraId];
    if (!aura?.inputs) {
      continue;
    }

    const modelSource = getLinkedNodeId(aura.inputs.model) ?? modelLink;
    const existingLoraId = findLightningLoraNodeId(next, loraFilenames);
    if (existingLoraId) {
      const existing = next[existingLoraId];
      if (existing?.inputs) {
        existing.inputs.model = [modelSource, 0];
        if ("strength_model" in existing.inputs) {
          existing.inputs.strength_model = 1;
        }
        if ("strength_clip" in existing.inputs) {
          existing.inputs.strength_clip = 1;
        }
        if ("strength" in existing.inputs) {
          existing.inputs.strength = 1;
        }
      }
      aura.inputs.model = [existingLoraId, 0];
      continue;
    }

    const sourceNode = next[modelSource];
    const loraId = nextWorkflowNodeId(next);
    const loraInputs: Record<string, unknown> = {
      model: [modelSource, 0],
      lora_name: lightningLoraName,
      strength_model: 1,
    };

    if (sourceNode && CHECKPOINT_LOADER_TYPES.has(sourceNode.class_type ?? "")) {
      loraInputs.clip = [modelSource, 1];
      loraInputs.strength_clip = 1;
      next[loraId] = {
        class_type: "LoraLoader",
        inputs: loraInputs,
        _meta: { title: "Prompt Studio — Lightning LoRA" },
      };
    } else if (clipRef) {
      loraInputs.clip = clipRef;
      loraInputs.strength_clip = 1;
      next[loraId] = {
        class_type: "LoraLoader",
        inputs: loraInputs,
        _meta: { title: "Prompt Studio — Lightning LoRA" },
      };
    } else {
      next[loraId] = {
        class_type: "LoraLoaderModelOnly",
        inputs: loraInputs,
        _meta: { title: "Prompt Studio — Lightning LoRA" },
      };
    }

    aura.inputs.model = [loraId, 0];
  }

  return next;
}

export function workflowHasLoraLoader(workflow: Record<string, unknown>): boolean {
  return Object.values(workflow).some((node) => {
    if (!node || typeof node !== "object") {
      return false;
    }
    return LORA_LOADER_TYPES.has(
      (node as { class_type?: string }).class_type ?? "",
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
    if (!record.inputs || !LORA_LOADER_TYPES.has(record.class_type ?? "")) {
      return false;
    }
    return loraNameImpliesLightning(record.inputs.lora_name, loraFilenames);
  });
}

/** Keep ModelSamplingAuraFlow for Lightning (official LightX2V shift ~3). */
/**
 * Intentionally a no-op: Lightning must keep ModelSamplingAuraFlow (shift ~3.1).
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
    if (!node?.inputs || !LORA_LOADER_TYPES.has(node.class_type ?? "")) {
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

  return { workflow: next, neutralizedNodeIds };
}

/** Ensure Lightning LoRA runs at full strength — lower values look soft and crunchy. */
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
    if (!node?.inputs || !LORA_LOADER_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    if (!loraNameImpliesLightning(node.inputs.lora_name, loraFilenames)) {
      continue;
    }

    if ("strength_model" in node.inputs) {
      node.inputs.strength_model = 1;
    }
    if ("strength_clip" in node.inputs) {
      node.inputs.strength_clip = 1;
    }
    if ("strength" in node.inputs) {
      node.inputs.strength = 1;
    }
  }

  return next;
}

/** Always apply queue width/height on latent nodes — imported workflows often keep 1024. */
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

  const next = structuredClone(workflow) as Record<
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
  "clip_name",
  "clip_name1",
  "clip_name2",
] as const;

function rewriteFp8FilenameToBf16(filename: string, model?: string): string | undefined {
  if (precisionHintFromFilename(filename) !== "fp8") {
    return undefined;
  }
  const lower = filename.toLowerCase();
  if (/clip|qwen_2\.5_vl|text_encoder/.test(lower)) {
    return qwenDualClipFilename("bf16");
  }
  if (/edit_2511|edit-2511/.test(lower) || model?.includes("edit-2511")) {
    return qwenEdit2511UnetFilename("bf16");
  }
  if (/edit_2509|edit-2509/.test(lower) || model?.includes("edit-2509")) {
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
  const unet =
    (typeof next.unet === "string" && rewriteFp8FilenameToBf16(next.unet, model) === undefined
      ? next.unet
      : undefined) ??
    (model?.includes("edit-2511")
      ? qwenEdit2511UnetFilename("bf16")
      : model?.includes("edit-2509")
        ? qwenEdit2509UnetFilename("bf16")
        : qwen2512UnetFilename("bf16"));
  next.unet = unet;
  if (!next.checkpoint || precisionHintFromFilename(next.checkpoint) === "fp8") {
    next.checkpoint = unet;
  }
  next.dualClip = qwenDualClipFilename("bf16");
  if (!next.vae?.trim()) {
    next.vae = "qwen_image_vae.safetensors";
  }
  return next;
}

export function alignLightningBf16LoadersInWorkflow(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames | undefined,
  model?: string,
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }
  const bf16 = resolveLightningBf16Loaders(model, loaders);
  return patchLoaderNodesInWorkflow(workflow, bf16, { syncLoadersToModel: true }).workflow;
}

export function prepareLightningWorkflowForQueue(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
  options?: {
    params?: WorkflowParamValues;
    loaders?: ModelLoaderFilenames;
  },
): Record<string, unknown> {
  if (!isQwenLightningModel(model)) {
    return workflow;
  }
  const loraPatch = patchLoraNodesInWorkflow(workflow, loraFilenames);
  const chainEnsured = ensureLightningModelChainInWorkflow(
    loraPatch.workflow,
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
  model?: string;
}): LightningWorkflowAuditIssue[] {
  if (!isQwenLightningModel(input.model) || !input.workflowJson?.trim()) {
    return [];
  }

  let parsed: Record<string, { class_type?: string; inputs?: Record<string, unknown> }> = {};
  try {
    parsed = JSON.parse(input.workflowJson) as typeof parsed;
  } catch {
    return [];
  }

  const issues: LightningWorkflowAuditIssue[] = [];

  if (!workflowHasLoraLoader(parsed)) {
    issues.push({
      severity: "error",
      message:
        "Lightning model queued without a LoraLoader — map {{LORA_LIGHTNING}} in Settings → LoRA library (or install a LightX2V LoRA in ComfyUI). Missing LoRA causes soft, malformed hands/faces.",
    });
  } else if (!workflowHasLightningLora(parsed, {})) {
    issues.push({
      severity: "error",
      message:
        "Lightning workflow has no Lightning LoRA mapped — map {{LORA_LIGHTNING}} in Settings → LoRA library to your 8-step LightX2V .safetensors (wrong/missing LoRA causes soft, malformed hands and faces).",
    });
  }

  let hasAuraFlow = false;
  let hasMainSampler = false;
  let samplerUsesAuraFlow = false;
  for (const node of Object.values(parsed)) {
    if (!node) {
      continue;
    }
    if (node.class_type === AURA_FLOW_TYPE) {
      hasAuraFlow = true;
    }
    if (node.inputs && isSamplerNode(node.class_type, node.inputs) && isMainGenerateSampler(node.inputs)) {
      hasMainSampler = true;
      const chain = walkModelChainIds(parsed, getLinkedNodeId(node.inputs.model));
      if (chainHasAuraFlow(parsed, chain)) {
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

  for (const node of Object.values(parsed)) {
    if (!node?.inputs || !LORA_LOADER_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    if (loraNameImpliesLightning(node.inputs.lora_name, {})) {
      continue;
    }
    const filename = resolveLoraLoaderFilename(node.inputs.lora_name, {});
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

  for (const node of Object.values(parsed)) {
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

  for (const node of Object.values(parsed)) {
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
