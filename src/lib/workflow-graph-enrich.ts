import type { WorkflowPlaceholderTokens } from "./comfyui-config";
import { getComfyModelDefinition, type ComfyImageModel } from "./comfy-models";
import {
  profileUsesNeuralUpscalePolish,
  profileUsesNeuralUpscaleEnrich,
  profileUsesSdxlRefinerEnrich,
  profileUsesSharpenAfterUpscale,
  profileUsesUpscaleEnrich,
  profileUsesLightningUpscalePolish,
  neuralUpscaleTileSizeForProfile,
  sdxlRefinerDenoiseForProfile,
  sdxlRefinerLatentScaleForProfile,
  lanczosPolishScaleAfterNeural,
  sharpenAlphaForProfile,
  lightningUpscalePolishAlpha,
  lightningUpscalePolishSigma,
  upscaleMethodForProfile,
  upscaleScaleForProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";
import {
  isModelSamplingFluxNode,
  isModelSamplingPatchNode,
  isQwenLightningModel,
  modelUsesFluxSamplingPatch,
  modelUsesShiftSamplingPatch,
  MODEL_SAMPLING_FLUX_NODE_TYPE,
} from "./model-sampling-patch";
import { IMAGE_SCALE_BY_NODE_TYPE } from "./workflow-direct-patch";
import { isUpscaleModelInstalled, pickUpscaleModelFromInventory } from "./model-upscale-map";
import { pickSdxlRefinerFromInventory } from "./model-checkpoint-map";
import type { WorkflowQueueOptimizeChange } from "./workflow-queue-optimizer";
import {
  isPromptStudioOutputUpscaleNode,
  PROMPT_STUDIO_META_PREFIX,
} from "./workflow-enrich-markers";

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

const LOADER_TYPES = new Set([
  "CheckpointLoaderSimple",
  "CheckpointLoader",
  "UNETLoader",
  "UnetLoaderGGUF",
]);

const MODEL_CHAIN_TYPES = new Set([
  "LoraLoader",
  "LoraLoaderModelOnly",
  "Power Lora Loader (rgthree)",
  "ControlNetApply",
  "ControlNetApplyAdvanced",
  "DiffControlNetApply",
]);

const UPSCALE_NODE_TYPES = new Set([
  "ImageScale",
  IMAGE_SCALE_BY_NODE_TYPE,
  "UpscaleModel",
  "ImageUpscaleWithModel",
  "Upscale",
]);

const VAE_DECODE_TYPES = new Set(["VAEDecode", "PreviewImage"]);

function parseNodeId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextWorkflowNodeId(workflow: Record<string, WorkflowNode>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = parseNodeId(key);
    if (parsed != null && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

function getLinkedNodeId(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

function isLoaderNode(classType: string | undefined): boolean {
  return LOADER_TYPES.has(classType ?? "");
}

function isSamplerNode(classType: string | undefined, inputs: Record<string, unknown>): boolean {
  const classLower = (classType ?? "").toLowerCase();
  if (
    classLower.includes("ksampler") ||
    classLower.includes("samplercustom") ||
    classLower.includes("guider") ||
    classLower.includes("basicscheduler")
  ) {
    return true;
  }
  return "seed" in inputs && ("steps" in inputs || "cfg" in inputs);
}

function resolveModelChainLoaderId(
  workflow: Record<string, WorkflowNode>,
  startNodeId: string,
): string | null {
  let current: string | null = startNodeId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = workflow[current];
    if (!node) {
      return null;
    }

    const classType = node.class_type ?? "";
    if (isLoaderNode(classType)) {
      return current;
    }
    if (
      isModelSamplingPatchNode(classType) ||
      isModelSamplingFluxNode(classType)
    ) {
      return null;
    }

    const classLower = classType.toLowerCase();
    const followsModelChain =
      MODEL_CHAIN_TYPES.has(classType) || classLower.includes("lora");
    if (!followsModelChain) {
      return null;
    }

    current = getLinkedNodeId(node.inputs?.model);
  }

  return null;
}

function shouldSkipUpscaleEnrich(
  workflow: Record<string, WorkflowNode>,
  qualityProfile?: QueueQualityProfile,
  model?: string,
): boolean {
  if (!profileUsesUpscaleEnrich(qualityProfile)) {
    return true;
  }

  const targetScale = upscaleScaleForProfile(qualityProfile, { model });
  for (const node of Object.values(workflow)) {
    if (!UPSCALE_NODE_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    if (isPromptStudioOutputUpscaleNode(node)) {
      return true;
    }
    const scaleBy = Number(node.inputs?.scale_by);
    if (Number.isFinite(scaleBy) && scaleBy >= targetScale * 0.85) {
      return true;
    }
  }
  return false;
}

function resolveSamplingPatchClassType(model: string | undefined): string | null {
  if (!model) {
    return null;
  }
  if (modelUsesFluxSamplingPatch(model)) {
    return MODEL_SAMPLING_FLUX_NODE_TYPE;
  }
  if (modelUsesShiftSamplingPatch(model)) {
    const category = getComfyModelDefinition(model as ComfyImageModel).category;
    if (category === "sd3") {
      return "ModelSamplingSD3";
    }
    return "ModelSamplingAuraFlow";
  }
  return null;
}

function enrichSamplingPatchNodes(input: {
  workflow: Record<string, WorkflowNode>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
}): WorkflowQueueOptimizeChange[] {
  const patchClassType = resolveSamplingPatchClassType(input.model);
  if (!patchClassType) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];

  for (const [samplerId, samplerNode] of Object.entries(input.workflow)) {
    if (!samplerNode?.inputs || !isSamplerNode(samplerNode.class_type, samplerNode.inputs)) {
      continue;
    }

    const modelLink = getLinkedNodeId(samplerNode.inputs.model);
    if (!modelLink) {
      continue;
    }

    const loaderId = resolveModelChainLoaderId(input.workflow, modelLink);
    if (!loaderId) {
      continue;
    }

    const upstream = input.workflow[modelLink];
    if (
      upstream &&
      (isModelSamplingPatchNode(upstream.class_type ?? "") ||
        isModelSamplingFluxNode(upstream.class_type ?? ""))
    ) {
      continue;
    }

    const patchNodeId = nextWorkflowNodeId(input.workflow);
    const patchInputs: Record<string, unknown> = {
      model: [modelLink, 0],
    };

    if (patchClassType === MODEL_SAMPLING_FLUX_NODE_TYPE) {
      patchInputs.max_shift = input.tokens.fluxMaxShift;
      patchInputs.base_shift = input.tokens.fluxBaseShift;
    } else {
      patchInputs.shift = input.tokens.shift;
    }

    input.workflow[patchNodeId] = {
      class_type: patchClassType,
      inputs: patchInputs,
      _meta: { title: `${PROMPT_STUDIO_META_PREFIX} model sampling patch` },
    };
    samplerNode.inputs.model = [patchNodeId, 0];

    changes.push({
      kind: "binding",
      severity: "info",
      message: `Inserted ${patchClassType} before KSampler node ${samplerId} for ${input.model ?? "model"} quality tuning.`,
    });
  }

  return changes;
}

const CHECKPOINT_LOADER_TYPES = new Set([
  "CheckpointLoaderSimple",
  "CheckpointLoader",
]);

function countSamplerNodes(workflow: Record<string, WorkflowNode>): number {
  return Object.values(workflow).filter(
    (node) => node?.inputs && isSamplerNode(node.class_type ?? "", node.inputs),
  ).length;
}

function workflowHasRefinerPass(workflow: Record<string, WorkflowNode>): boolean {
  for (const node of Object.values(workflow)) {
    const classType = node.class_type ?? "";
    const title = node._meta?.title?.toLowerCase() ?? "";
    if (/refiner/i.test(title)) {
      return true;
    }
    if (CHECKPOINT_LOADER_TYPES.has(classType)) {
      const ckpt = String(node.inputs?.ckpt_name ?? "");
      if (/refiner/i.test(ckpt)) {
        return true;
      }
    }
  }

  let checkpointLoaders = 0;
  for (const node of Object.values(workflow)) {
    if (CHECKPOINT_LOADER_TYPES.has(node.class_type ?? "")) {
      checkpointLoaders += 1;
    }
  }
  return checkpointLoaders >= 2;
}

type SdxlVaeDecodeChain = {
  vaeDecodeId: string;
  samplerId: string;
  loaderId: string;
};

function resolveCheckpointLoaderIdThroughModelChain(
  workflow: Record<string, WorkflowNode>,
  startNodeId: string,
): string | null {
  let current: string | null = startNodeId;
  const visited = new Set<string>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = workflow[current];
    if (!node) {
      return null;
    }

    const classType = node.class_type ?? "";
    if (CHECKPOINT_LOADER_TYPES.has(classType)) {
      return current;
    }

    const classLower = classType.toLowerCase();
    const followsModelChain =
      MODEL_CHAIN_TYPES.has(classType) ||
      classLower.includes("lora") ||
      isModelSamplingPatchNode(classType) ||
      isModelSamplingFluxNode(classType);
    if (!followsModelChain) {
      return null;
    }

    current = getLinkedNodeId(node.inputs?.model);
  }

  return null;
}

function findSdxlVaeDecodeChains(
  workflow: Record<string, WorkflowNode>,
): SdxlVaeDecodeChain[] {
  const chains: SdxlVaeDecodeChain[] = [];

  for (const [vaeDecodeId, decodeNode] of Object.entries(workflow)) {
    if (decodeNode.class_type !== "VAEDecode" || !decodeNode.inputs) {
      continue;
    }

    const samplerId = getLinkedNodeId(decodeNode.inputs.samples);
    if (!samplerId) {
      continue;
    }

    const sampler = workflow[samplerId];
    if (!sampler?.inputs || !isSamplerNode(sampler.class_type ?? "", sampler.inputs)) {
      continue;
    }

    const denoise = sampler.inputs.denoise;
    if (denoise != null && Number(denoise) < 0.95) {
      continue;
    }

    const modelLink = getLinkedNodeId(sampler.inputs.model);
    if (!modelLink) {
      continue;
    }

    const loaderId = resolveCheckpointLoaderIdThroughModelChain(workflow, modelLink);
    if (!loaderId) {
      continue;
    }

    chains.push({ vaeDecodeId, samplerId, loaderId });
  }

  return chains;
}

function enrichSdxlRefinerNodes(input: {
  workflow: Record<string, WorkflowNode>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
  qualityProfile?: QueueQualityProfile;
  refinerCheckpointFilename?: string;
  availableCheckpoints?: string[] | null;
}): WorkflowQueueOptimizeChange[] {
  if (!profileUsesSdxlRefinerEnrich(input.qualityProfile)) {
    return [];
  }

  if (!input.model) {
    return [];
  }

  const def = getComfyModelDefinition(input.model as ComfyImageModel);
  if (def.category !== "sdxl" || input.model.toLowerCase().includes("refiner")) {
    return [];
  }

  const refinerCkptMapped = input.refinerCheckpointFilename?.trim();
  let refinerCkpt = refinerCkptMapped;
  if (
    !refinerCkpt ||
    (input.availableCheckpoints &&
      input.availableCheckpoints.length > 0 &&
      !input.availableCheckpoints.includes(refinerCkpt))
  ) {
    const picked = pickSdxlRefinerFromInventory(input.availableCheckpoints);
    if (picked) {
      refinerCkpt = picked;
    }
  }

  if (!refinerCkpt) {
    return [
      {
        kind: "audit",
        severity: "warn",
        message:
          "SDXL Final/Max refiner skipped — map a refiner checkpoint in Settings (e.g. sd_xl_refiner_1.0.safetensors).",
      },
    ];
  }

  if (
    input.availableCheckpoints &&
    input.availableCheckpoints.length > 0 &&
    !input.availableCheckpoints.includes(refinerCkpt)
  ) {
    return [
      {
        kind: "audit",
        severity: "warn",
        message: `SDXL Final/Max refiner skipped — “${refinerCkpt}” not found in ComfyUI checkpoints.`,
      },
    ];
  }

  if (workflowHasRefinerPass(input.workflow) || countSamplerNodes(input.workflow) > 1) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];

  for (const chain of findSdxlVaeDecodeChains(input.workflow)) {
    const baseSampler = input.workflow[chain.samplerId];
    if (!baseSampler?.inputs) {
      continue;
    }

    const refinerLoaderId = nextWorkflowNodeId(input.workflow);
    input.workflow[refinerLoaderId] = {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: refinerCkpt },
      _meta: { title: "Prompt Studio — SDXL refiner" },
    };

    const refinerPositiveId = nextWorkflowNodeId(input.workflow);
    input.workflow[refinerPositiveId] = {
      class_type: "CLIPTextEncode",
      inputs: {
        text: input.tokens.positive,
        clip: [refinerLoaderId, 1],
      },
      _meta: { title: "Prompt Studio — refiner positive" },
    };

    const refinerNegativeId = nextWorkflowNodeId(input.workflow);
    input.workflow[refinerNegativeId] = {
      class_type: "CLIPTextEncode",
      inputs: {
        text: input.tokens.negative,
        clip: [refinerLoaderId, 1],
      },
      _meta: { title: "Prompt Studio — refiner negative" },
    };

    const latentUpscaleId = nextWorkflowNodeId(input.workflow);
    input.workflow[latentUpscaleId] = {
      class_type: "LatentUpscale",
      inputs: {
        samples: [chain.samplerId, 0],
        upscale_method: "bislerp",
        scale_by: sdxlRefinerLatentScaleForProfile(input.qualityProfile),
      },
      _meta: { title: "Prompt Studio — SDXL latent upscale" },
    };

    const refinerSamplerId = nextWorkflowNodeId(input.workflow);
    input.workflow[refinerSamplerId] = {
      class_type: "KSampler",
      inputs: {
        seed: baseSampler.inputs.seed ?? input.tokens.seed,
        steps: input.tokens.steps,
        cfg: "5.5",
        sampler_name: input.tokens.sampler,
        scheduler: input.tokens.scheduler,
        denoise: sdxlRefinerDenoiseForProfile(input.qualityProfile),
        model: [refinerLoaderId, 0],
        positive: [refinerPositiveId, 0],
        negative: [refinerNegativeId, 0],
        latent_image: [latentUpscaleId, 0],
      },
      _meta: { title: "Prompt Studio — SDXL refiner pass" },
    };

    const decodeNode = input.workflow[chain.vaeDecodeId];
    if (decodeNode?.inputs) {
      decodeNode.inputs.samples = [refinerSamplerId, 0];
    }

    changes.push({
      kind: "binding",
      severity: "info",
      message: `Inserted SDXL latent upscale (${sdxlRefinerLatentScaleForProfile(input.qualityProfile)}×) + refiner KSampler (${refinerCkpt}) before VAEDecode node ${chain.vaeDecodeId}.`,
    });
  }

  return changes;
}

function insertLanczosPolishAfterNode(input: {
  workflow: Record<string, WorkflowNode>;
  saveNode: WorkflowNode;
  sourceNodeId: string;
  scaleBy: number;
  title: string;
}): string {
  const polishNodeId = nextWorkflowNodeId(input.workflow);
  input.workflow[polishNodeId] = {
    class_type: IMAGE_SCALE_BY_NODE_TYPE,
    inputs: {
      image: [input.sourceNodeId, 0],
      upscale_method: "lanczos",
      scale_by: input.scaleBy,
    },
    _meta: { title: input.title },
  };
  input.saveNode.inputs!.images = [polishNodeId, 0];
  return polishNodeId;
}

function maybeInsertLightningUpscalePolish(input: {
  workflow: Record<string, WorkflowNode>;
  saveNode: WorkflowNode;
  sourceNodeId: string;
  qualityProfile?: QueueQualityProfile;
  saveId: string;
  model?: string;
}): WorkflowQueueOptimizeChange | null {
  if (!profileUsesLightningUpscalePolish(input.qualityProfile, { model: input.model })) {
    return null;
  }

  const alpha = lightningUpscalePolishAlpha(input.qualityProfile);
  const sigma = lightningUpscalePolishSigma(input.qualityProfile);
  const polishNodeId = nextWorkflowNodeId(input.workflow);
  input.workflow[polishNodeId] = {
    class_type: "ImageSharpen",
    inputs: {
      image: [input.sourceNodeId, 0],
      sharpen_radius: 1,
      sigma,
      alpha,
    },
    _meta: { title: "Prompt Studio — Lightning upscale polish" },
  };
  input.saveNode.inputs!.images = [polishNodeId, 0];

  return {
    kind: "binding",
    severity: "info",
    message: `Inserted Lightning upscale polish (ImageSharpen α${alpha}) before SaveImage node ${input.saveId} for ${input.qualityProfile} quality.`,
  };
}

function maybeInsertSharpenAfterUpscale(input: {
  workflow: Record<string, WorkflowNode>;
  saveNode: WorkflowNode;
  sourceNodeId: string;
  qualityProfile?: QueueQualityProfile;
  enrichSharpen?: boolean;
  saveId: string;
  model?: string;
}): WorkflowQueueOptimizeChange | null {
  if (
    input.enrichSharpen === false ||
    isQwenLightningModel(input.model) ||
    !profileUsesSharpenAfterUpscale(input.qualityProfile)
  ) {
    return null;
  }

  const sharpenNodeId = nextWorkflowNodeId(input.workflow);
  input.workflow[sharpenNodeId] = {
    class_type: "ImageSharpen",
    inputs: {
      image: [input.sourceNodeId, 0],
      sharpen_radius: 1,
      sigma: 0.45,
      alpha: sharpenAlphaForProfile(input.qualityProfile),
    },
    _meta: { title: "Prompt Studio — output sharpen" },
  };
  input.saveNode.inputs!.images = [sharpenNodeId, 0];

  return {
    kind: "binding",
    severity: "info",
    message: `Inserted subtle ImageSharpen after upscale before SaveImage node ${input.saveId} for ${input.qualityProfile} quality.`,
  };
}

function enrichLanczosUpscaleNodes(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
  enrichSharpen?: boolean;
  model?: string;
}): WorkflowQueueOptimizeChange[] {
  // Lightning Final/Max: Lanczos + light polish (neural/hires still amplify grain).
  if (!profileUsesUpscaleEnrich(input.qualityProfile)) {
    return [];
  }
  if (shouldSkipUpscaleEnrich(input.workflow, input.qualityProfile, input.model)) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];
  const scaleBy = upscaleScaleForProfile(input.qualityProfile, { model: input.model });
  const method = upscaleMethodForProfile(input.qualityProfile, { model: input.model });

  for (const [saveId, saveNode] of Object.entries(input.workflow)) {
    if (saveNode.class_type !== "SaveImage" || !saveNode.inputs) {
      continue;
    }

    const imageLink = getLinkedNodeId(saveNode.inputs.images);
    if (!imageLink) {
      continue;
    }

    const upstream = input.workflow[imageLink];
    if (!upstream || !VAE_DECODE_TYPES.has(upstream.class_type ?? "")) {
      continue;
    }

    const scaleNodeId = nextWorkflowNodeId(input.workflow);
    input.workflow[scaleNodeId] = {
      class_type: IMAGE_SCALE_BY_NODE_TYPE,
      inputs: {
        image: [imageLink, 0],
        upscale_method: method,
        scale_by: scaleBy,
      },
      _meta: { title: "Prompt Studio — output upscale" },
    };
    saveNode.inputs.images = [scaleNodeId, 0];

    changes.push({
      kind: "binding",
      severity: "info",
      message: `Inserted ImageScaleBy (${scaleBy}× ${method}) before SaveImage node ${saveId} for ${input.qualityProfile} quality.`,
    });

    const lightningPolish = maybeInsertLightningUpscalePolish({
      workflow: input.workflow,
      saveNode,
      sourceNodeId: scaleNodeId,
      qualityProfile: input.qualityProfile,
      saveId,
      model: input.model,
    });
    if (lightningPolish) {
      changes.push(lightningPolish);
      continue;
    }

    const sharpenChange = maybeInsertSharpenAfterUpscale({
      workflow: input.workflow,
      saveNode,
      sourceNodeId: scaleNodeId,
      qualityProfile: input.qualityProfile,
      enrichSharpen: input.enrichSharpen,
      saveId,
      model: input.model,
    });
    if (sharpenChange) {
      changes.push(sharpenChange);
    }
  }

  return changes;
}

function enrichNeuralUpscaleNodes(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
  upscaleModelFilename: string;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  model?: string;
  supportsNeuralUpscaleTileSize?: boolean;
}): WorkflowQueueOptimizeChange[] {
  if (isQwenLightningModel(input.model)) {
    return [];
  }
  if (!profileUsesUpscaleEnrich(input.qualityProfile)) {
    return [];
  }
  if (shouldSkipUpscaleEnrich(input.workflow, input.qualityProfile, input.model)) {
    return [];
  }

  const changes: WorkflowQueueOptimizeChange[] = [];
  const modelName = input.upscaleModelFilename.trim();

  for (const [saveId, saveNode] of Object.entries(input.workflow)) {
    if (saveNode.class_type !== "SaveImage" || !saveNode.inputs) {
      continue;
    }

    const imageLink = getLinkedNodeId(saveNode.inputs.images);
    if (!imageLink) {
      continue;
    }

    const upstream = input.workflow[imageLink];
    if (!upstream || !VAE_DECODE_TYPES.has(upstream.class_type ?? "")) {
      continue;
    }

    const loaderNodeId = nextWorkflowNodeId(input.workflow);
    input.workflow[loaderNodeId] = {
      class_type: "UpscaleModelLoader",
      inputs: {
        model_name: modelName,
      },
      _meta: { title: "Prompt Studio — upscale model" },
    };

    const upscaleNodeId = nextWorkflowNodeId(input.workflow);
    const tileSize =
      input.supportsNeuralUpscaleTileSize === true
        ? neuralUpscaleTileSizeForProfile(input.qualityProfile)
        : 0;
    const upscaleInputs: Record<string, unknown> = {
      upscale_model: [loaderNodeId, 0],
      image: [imageLink, 0],
    };
    if (tileSize > 0) {
      upscaleInputs.tile_size = tileSize;
    }
    input.workflow[upscaleNodeId] = {
      class_type: "ImageUpscaleWithModel",
      inputs: upscaleInputs,
      _meta: { title: "Prompt Studio — neural upscale" },
    };

    let outputNodeId = upscaleNodeId;
    saveNode.inputs.images = [outputNodeId, 0];

    const usePolish =
      input.enrichNeuralPolish !== false &&
      profileUsesNeuralUpscalePolish(input.qualityProfile, { model: input.model });
    if (usePolish) {
      const polishScale = lanczosPolishScaleAfterNeural({ model: input.model });
      if (polishScale > 1) {
        outputNodeId = insertLanczosPolishAfterNode({
          workflow: input.workflow,
          saveNode,
          sourceNodeId: outputNodeId,
          scaleBy: polishScale,
          title: "Prompt Studio — Lanczos polish",
        });
        changes.push({
          kind: "binding",
          severity: "info",
          message: `Chained ${polishScale}× Lanczos polish after neural upscale before SaveImage node ${saveId}.`,
        });
      }
    }

    const tileNote =
      tileSize > 0 ? ` (tile_size ${tileSize})` : "";
    changes.push({
      kind: "binding",
      severity: "info",
      message: `Inserted UpscaleModelLoader + ImageUpscaleWithModel (${modelName})${tileNote} before SaveImage node ${saveId} for ${input.qualityProfile} quality.`,
    });

    const sharpenChange = maybeInsertSharpenAfterUpscale({
      workflow: input.workflow,
      saveNode,
      sourceNodeId: outputNodeId,
      qualityProfile: input.qualityProfile,
      enrichSharpen: input.enrichSharpen,
      saveId,
      model: input.model,
    });
    if (sharpenChange) {
      changes.push(sharpenChange);
    }
  }

  return changes;
}

function enrichUpscaleNodes(input: {
  workflow: Record<string, WorkflowNode>;
  qualityProfile?: QueueQualityProfile;
  upscaleModelFilename?: string;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  model?: string;
  availableUpscaleModels?: string[] | null;
  supportsNeuralUpscaleTileSize?: boolean;
}): WorkflowQueueOptimizeChange[] {
  if (!profileUsesNeuralUpscaleEnrich(input.qualityProfile, { model: input.model })) {
    return enrichLanczosUpscaleNodes({
      workflow: input.workflow,
      qualityProfile: input.qualityProfile,
      enrichSharpen: input.enrichSharpen,
      model: input.model,
    });
  }

  const mapped = input.upscaleModelFilename?.trim();
  const picked = pickUpscaleModelFromInventory(input.availableUpscaleModels, mapped);
  const neuralAvailable =
    Boolean(picked) && isUpscaleModelInstalled(picked, input.availableUpscaleModels);

  if (neuralAvailable && picked) {
    const changes: WorkflowQueueOptimizeChange[] = [];
    if (mapped && picked !== mapped) {
      changes.push({
        kind: "audit",
        severity: "info",
        message: `Neural upscaler “${mapped}” missing — using installed “${picked}” from ComfyUI inventory.`,
      });
    }
    return [
      ...changes,
      ...enrichNeuralUpscaleNodes({
        workflow: input.workflow,
        qualityProfile: input.qualityProfile,
        upscaleModelFilename: picked,
        enrichNeuralPolish: input.enrichNeuralPolish,
        enrichSharpen: input.enrichSharpen,
        model: input.model,
        supportsNeuralUpscaleTileSize: input.supportsNeuralUpscaleTileSize,
      }),
    ];
  }

  const lanczosChanges = enrichLanczosUpscaleNodes({
    workflow: input.workflow,
    qualityProfile: input.qualityProfile,
    enrichSharpen: input.enrichSharpen,
    model: input.model,
  });

  if (mapped) {
    return [
      {
        kind: "audit",
        severity: "warn",
        message: `Neural upscaler “${mapped}” not installed in ComfyUI — using Lanczos Final/Max upscale instead.`,
      },
      ...lanczosChanges,
    ];
  }

  return lanczosChanges;
}

export function enrichWorkflowGraph(input: {
  workflow: Record<string, unknown>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
  qualityProfile?: QueueQualityProfile;
  upscaleModelFilename?: string;
  refinerCheckpointFilename?: string;
  enrichSampling?: boolean;
  enrichUpscale?: boolean;
  enrichSdxlRefiner?: boolean;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  availableUpscaleModels?: string[] | null;
  availableCheckpoints?: string[] | null;
  supportsNeuralUpscaleTileSize?: boolean;
}): {
  workflow: Record<string, unknown>;
  changes: WorkflowQueueOptimizeChange[];
} {
  const workflow = structuredClone(input.workflow) as Record<string, WorkflowNode>;
  const changes: WorkflowQueueOptimizeChange[] = [];

  if (input.enrichSampling !== false) {
    changes.push(
      ...enrichSamplingPatchNodes({
        workflow,
        tokens: input.tokens,
        model: input.model,
      }),
    );
  }

  if (input.enrichSdxlRefiner !== false) {
    changes.push(
      ...enrichSdxlRefinerNodes({
        workflow,
        tokens: input.tokens,
        model: input.model,
        qualityProfile: input.qualityProfile,
        refinerCheckpointFilename: input.refinerCheckpointFilename,
        availableCheckpoints: input.availableCheckpoints,
      }),
    );
  }

  if (input.enrichUpscale !== false) {
    changes.push(
      ...enrichUpscaleNodes({
        workflow,
        qualityProfile: input.qualityProfile,
        upscaleModelFilename: input.upscaleModelFilename,
        enrichNeuralPolish: input.enrichNeuralPolish,
        enrichSharpen: input.enrichSharpen,
        model: input.model,
        availableUpscaleModels: input.availableUpscaleModels,
        supportsNeuralUpscaleTileSize: input.supportsNeuralUpscaleTileSize,
      }),
    );
  }

  return { workflow, changes };
}
