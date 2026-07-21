import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  type WorkflowPlaceholderTokens,
} from "./comfyui-config";
import {
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models";
import { isEditCapableModel, isQwenEditModel } from "./model-denoise-defaults";
import { isQwenLightningModel } from "./model-sampling-patch";
import { DEFAULT_UNET_TOKEN } from "./model-checkpoint-map";
import {
  defaultLoaderPrecisionTier,
  qwenDualClipFilename,
} from "./model-loader-precision";
import { applyWorkflowNodeBindings } from "./workflow-apply-bindings";
import { prepareWorkflowJsonImport } from "./workflow-import";
import { suggestWorkflowNodeMappings } from "./workflow-node-mapper";

export type WorkflowScaffoldSource = "template" | "clone";

export type WorkflowScaffoldResult = {
  json: string;
  source: WorkflowScaffoldSource;
  model: ComfyImageModel | string;
  category: ComfyModelCategory | "generic";
  bindingChanges: number;
  notes: string[];
};

function resolveBindingTokens(
  tokens?: Partial<WorkflowPlaceholderTokens>,
): WorkflowPlaceholderTokens {
  return {
    positive: tokens?.positive?.trim() || DEFAULT_POSITIVE_TOKEN,
    negative: tokens?.negative?.trim() || DEFAULT_NEGATIVE_TOKEN,
    seed: tokens?.seed?.trim() || DEFAULT_SEED_TOKEN,
    width: tokens?.width?.trim() || DEFAULT_WIDTH_TOKEN,
    height: tokens?.height?.trim() || DEFAULT_HEIGHT_TOKEN,
    cfg: tokens?.cfg?.trim() || DEFAULT_CFG_TOKEN,
    steps: tokens?.steps?.trim() || DEFAULT_STEPS_TOKEN,
    sampler: tokens?.sampler?.trim() || DEFAULT_SAMPLER_TOKEN,
    scheduler: tokens?.scheduler?.trim() || DEFAULT_SCHEDULER_TOKEN,
    shift: tokens?.shift?.trim() || DEFAULT_SHIFT_TOKEN,
    fluxMaxShift: tokens?.fluxMaxShift?.trim() || DEFAULT_FLUX_MAX_SHIFT_TOKEN,
    fluxBaseShift: tokens?.fluxBaseShift?.trim() || DEFAULT_FLUX_BASE_SHIFT_TOKEN,
    denoise: tokens?.denoise?.trim() || DEFAULT_DENOISE_TOKEN,
    inputImage: tokens?.inputImage?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    maskImage: tokens?.maskImage?.trim() || DEFAULT_MASK_IMAGE_TOKEN,
  };
}

function bindScaffoldJson(
  workflowJson: string,
  tokens: WorkflowPlaceholderTokens,
): { json: string; bindingChanges: number } {
  const mappings = suggestWorkflowNodeMappings(workflowJson);
  const bound = applyWorkflowNodeBindings(workflowJson, mappings, tokens);
  return { json: bound.json, bindingChanges: bound.changes.length };
}

function fluxScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      class_type: "ModelSamplingFlux",
      inputs: {
        model: ["1", 0],
        max_shift: tokens.fluxMaxShift,
        base_shift: tokens.fluxBaseShift,
        width: tokens.width,
        height: tokens.height,
      },
      _meta: { title: "ModelSamplingFlux" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["1", 1] },
      _meta: { title: "Positive Prompt" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["1", 1] },
      _meta: { title: "Negative Prompt" },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: "Empty Latent" },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ["2", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
      },
      _meta: { title: "KSampler" },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
      _meta: { title: "VAE Decode" },
    },
    "8": {
      class_type: "SaveImage",
      inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      _meta: { title: "Save Image" },
    },
  };
}

function qwenLoaderFilenames(): {
  unetToken: string;
  clipName: string;
  vaeName: string;
} {
  const tier = defaultLoaderPrecisionTier();
  return {
    unetToken: DEFAULT_UNET_TOKEN,
    clipName: qwenDualClipFilename(tier),
    vaeName: "qwen_image_vae.safetensors",
  };
}

function qwenScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  const loaders = qwenLoaderFilenames();
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: loaders.unetToken, weight_dtype: "default" },
      _meta: { title: "Load UNET" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: loaders.clipName,
        type: "qwen_image",
      },
      _meta: { title: "Load CLIP" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: "Load VAE" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["2", 0] },
      _meta: { title: "Positive Prompt" },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["2", 0] },
      _meta: { title: "Negative Prompt" },
    },
    "6": {
      class_type: "EmptySD3LatentImage",
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: "Empty Latent" },
    },
    "7": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: tokens.shift },
      _meta: { title: "ModelSamplingAuraFlow" },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ["7", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
      },
      _meta: { title: "KSampler" },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["3", 0] },
      _meta: { title: "VAE Decode" },
    },
    "10": {
      class_type: "SaveImage",
      inputs: { images: ["9", 0], filename_prefix: "PromptStudio" },
      _meta: { title: "Save Image" },
    },
  };
}

const LIGHTNING_LORA_TOKEN = "{{LORA_LIGHTNING}}";

function qwenLightningScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  const loaders = qwenLoaderFilenames();
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: loaders.unetToken, weight_dtype: "default" },
      _meta: { title: "Load UNET" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: loaders.clipName,
        type: "qwen_image",
      },
      _meta: { title: "Load CLIP" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: "Load VAE" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["2", 0] },
      _meta: { title: "Positive Prompt" },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["2", 0] },
      _meta: { title: "Negative Prompt" },
    },
    "6": {
      class_type: "EmptySD3LatentImage",
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: "Empty Latent" },
    },
    "7": {
      class_type: "LoraLoader",
      inputs: {
        model: ["1", 0],
        clip: ["2", 0],
        lora_name: LIGHTNING_LORA_TOKEN,
        strength_model: 1,
        strength_clip: 1,
      },
      _meta: { title: "Lightning LoRA" },
    },
    "11": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["7", 0], shift: tokens.shift },
      _meta: { title: "ModelSamplingAuraFlow" },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ["11", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
      },
      _meta: { title: "KSampler" },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["3", 0] },
      _meta: { title: "VAE Decode" },
    },
    "10": {
      class_type: "SaveImage",
      inputs: { images: ["9", 0], filename_prefix: "PromptStudio" },
      _meta: { title: "Save Image" },
    },
  };
}

function resolveQwenEditEncoderClass(model: ComfyImageModel | string): string {
  const def = getComfyModelDefinition(model);
  if (def?.comfyNode === "TextEncodeQwenImageEdit") {
    return "TextEncodeQwenImageEdit";
  }
  return "TextEncodeQwenImageEditPlus";
}

function usesQwenCheckpointLoader(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  return (
    model.startsWith("qwen-rapid-aio") || def?.comfyNode === "Load Checkpoint"
  );
}

function buildQwenEditEncoderInputs(
  encodeClass: string,
  tokens: WorkflowPlaceholderTokens,
  clipRef: [string, number],
  vaeRef: [string, number],
  imageRef: [string, number],
): Record<string, unknown> {
  if (encodeClass === "TextEncodeQwenImageEdit") {
    return {
      prompt: tokens.positive,
      clip: clipRef,
      vae: vaeRef,
      image: imageRef,
    };
  }
  return {
    prompt: tokens.positive,
    clip: clipRef,
    vae: vaeRef,
    image1: imageRef,
  };
}

function qwenEditImg2imgScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string,
): Record<string, unknown> {
  const encodeClass = resolveQwenEditEncoderClass(model);

  if (usesQwenCheckpointLoader(model)) {
    return {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "{{CHECKPOINT}}" },
        _meta: { title: "Load Checkpoint" },
      },
      "900": {
        class_type: "LoadImage",
        inputs: { image: tokens.inputImage },
        _meta: { title: "Input Image" },
      },
      "901": {
        class_type: "VAEEncode",
        inputs: { pixels: ["900", 0], vae: ["1", 2] },
        _meta: { title: "VAE Encode Input" },
      },
      "4": {
        class_type: encodeClass,
        inputs: buildQwenEditEncoderInputs(
          encodeClass,
          tokens,
          ["1", 1],
          ["1", 2],
          ["900", 0],
        ),
        _meta: { title: "Qwen Edit Encode" },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: tokens.seed,
          steps: tokens.steps,
          cfg: tokens.cfg,
          sampler_name: tokens.sampler,
          scheduler: tokens.scheduler,
          denoise: tokens.denoise,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["4", 0],
          latent_image: ["901", 0],
        },
        _meta: { title: "KSampler" },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["8", 0], vae: ["1", 2] },
        _meta: { title: "VAE Decode" },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["9", 0], filename_prefix: "PromptStudio" },
        _meta: { title: "Save Image" },
      },
    };
  }

  const loaders = qwenLoaderFilenames();
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: loaders.unetToken, weight_dtype: "default" },
      _meta: { title: "Load UNET" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: loaders.clipName,
        type: "qwen_image",
      },
      _meta: { title: "Load CLIP" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: "Load VAE" },
    },
    "900": {
      class_type: "LoadImage",
      inputs: { image: tokens.inputImage },
      _meta: { title: "Input Image" },
    },
    "901": {
      class_type: "VAEEncode",
      inputs: { pixels: ["900", 0], vae: ["3", 0] },
      _meta: { title: "VAE Encode Input" },
    },
    "4": {
      class_type: encodeClass,
      inputs: buildQwenEditEncoderInputs(
        encodeClass,
        tokens,
        ["2", 0],
        ["3", 0],
        ["900", 0],
      ),
      _meta: { title: "Qwen Edit Encode" },
    },
    "7": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: tokens.shift },
      _meta: { title: "ModelSamplingAuraFlow" },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ["7", 0],
        positive: ["4", 0],
        negative: ["4", 0],
        latent_image: ["901", 0],
      },
      _meta: { title: "KSampler" },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["3", 0] },
      _meta: { title: "VAE Decode" },
    },
    "10": {
      class_type: "SaveImage",
      inputs: { images: ["9", 0], filename_prefix: "PromptStudio" },
      _meta: { title: "Save Image" },
    },
  };
}

function fluxInpaintScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      class_type: "ModelSamplingFlux",
      inputs: {
        model: ["1", 0],
        max_shift: tokens.fluxMaxShift,
        base_shift: tokens.fluxBaseShift,
        width: tokens.width,
        height: tokens.height,
      },
      _meta: { title: "ModelSamplingFlux" },
    },
    "900": {
      class_type: "LoadImage",
      inputs: { image: tokens.inputImage },
      _meta: { title: "Input Image" },
    },
    "902": {
      class_type: "LoadImageMask",
      inputs: { image: tokens.maskImage },
      _meta: { title: "Inpaint Mask" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["1", 1] },
      _meta: { title: "Positive Prompt" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["1", 1] },
      _meta: { title: "Negative Prompt" },
    },
    "903": {
      class_type: "InpaintModelConditioning",
      inputs: {
        positive: ["3", 0],
        negative: ["4", 0],
        vae: ["1", 2],
        pixels: ["900", 0],
        mask: ["902", 0],
      },
      _meta: { title: "Inpaint Conditioning" },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ["2", 0],
        positive: ["903", 0],
        negative: ["903", 1],
        latent_image: ["903", 2],
      },
      _meta: { title: "KSampler" },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
      _meta: { title: "VAE Decode" },
    },
    "8": {
      class_type: "SaveImage",
      inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      _meta: { title: "Save Image" },
    },
  };
}

function fluxImg2imgScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      class_type: "ModelSamplingFlux",
      inputs: {
        model: ["1", 0],
        max_shift: tokens.fluxMaxShift,
        base_shift: tokens.fluxBaseShift,
        width: tokens.width,
        height: tokens.height,
      },
      _meta: { title: "ModelSamplingFlux" },
    },
    "900": {
      class_type: "LoadImage",
      inputs: { image: tokens.inputImage },
      _meta: { title: "Input Image" },
    },
    "901": {
      class_type: "VAEEncode",
      inputs: { pixels: ["900", 0], vae: ["1", 2] },
      _meta: { title: "VAE Encode Input" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["1", 1] },
      _meta: { title: "Positive Prompt" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["1", 1] },
      _meta: { title: "Negative Prompt" },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ["2", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["901", 0],
      },
      _meta: { title: "KSampler" },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
      _meta: { title: "VAE Decode" },
    },
    "8": {
      class_type: "SaveImage",
      inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      _meta: { title: "Save Image" },
    },
  };
}

function editScaffold(
  tokens: WorkflowPlaceholderTokens,
  category: ComfyModelCategory | "generic",
  model: ComfyImageModel | string,
): Record<string, unknown> {
  if (isQwenEditModel(model)) {
    return qwenEditImg2imgScaffold(tokens, model);
  }
  if (model === "flux-inpaint") {
    return fluxInpaintScaffold(tokens);
  }
  if (category === "flux") {
    return fluxImg2imgScaffold(tokens);
  }

  const base =
    category === "flux"
      ? fluxScaffold(tokens)
      : category === "qwen"
        ? qwenScaffold(tokens)
        : genericScaffold(tokens);

  return {
    ...base,
    "900": {
      class_type: "LoadImage",
      inputs: { image: tokens.inputImage },
      _meta: { title: "Input Image" },
    },
  };
}

function controlNetScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["1", 1] },
      _meta: { title: "Positive Prompt" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["1", 1] },
      _meta: { title: "Negative Prompt" },
    },
    "4": {
      class_type: "ControlNetLoader",
      inputs: { control_net_name: "{{CONTROLNET_MODEL}}" },
      _meta: { title: "ControlNet Loader" },
    },
    "5": {
      class_type: "LoadImage",
      inputs: { image: "{{CONTROL_IMAGE}}" },
      _meta: { title: "Control Image" },
    },
    "6": {
      class_type: "ControlNetApply",
      inputs: {
        strength: 1,
        start_percent: 0,
        end_percent: 1,
        positive: ["2", 0],
        negative: ["3", 0],
        control_net: ["4", 0],
        image: ["5", 0],
      },
      _meta: { title: "Apply ControlNet" },
    },
    "7": {
      class_type: "EmptyLatentImage",
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: "Empty Latent" },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ["1", 0],
        positive: ["6", 0],
        negative: ["6", 1],
        latent_image: ["7", 0],
      },
      _meta: { title: "KSampler" },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["1", 2] },
      _meta: { title: "VAE Decode" },
    },
    "10": {
      class_type: "SaveImage",
      inputs: { images: ["9", 0], filename_prefix: "PromptStudio" },
      _meta: { title: "Save Image" },
    },
  };
}

export function buildControlNetWorkflowScaffold(
  tokens?: Partial<WorkflowPlaceholderTokens>,
): WorkflowScaffoldResult {
  const resolvedTokens = resolveBindingTokens(tokens);
  const bound = bindScaffoldJson(JSON.stringify(controlNetScaffold(resolvedTokens), null, 2), resolvedTokens);
  return {
    json: bound.json,
    source: "template",
    model: "sdxl-base",
    category: "sdxl",
    bindingChanges: bound.bindingChanges,
    notes: [
      "ControlNet scaffold with {{CONTROLNET_MODEL}} and {{CONTROL_IMAGE}} placeholders.",
      "Map ControlNet filenames in Settings → ControlNet model map, upload a control image from the ControlNet tool before queueing.",
    ],
  };
}

function genericScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
      _meta: { title: "Load Checkpoint" },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["1", 1] },
      _meta: { title: "Positive Prompt" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["1", 1] },
      _meta: { title: "Negative Prompt" },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: "Empty Latent" },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
      _meta: { title: "KSampler" },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
      _meta: { title: "VAE Decode" },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "PromptStudio" },
      _meta: { title: "Save Image" },
    },
  };
}

function resolveScaffoldCategory(
  model: ComfyImageModel | string,
): ComfyModelCategory | "generic" {
  const def = getComfyModelDefinition(model);
  if (!def) {
    return "generic";
  }
  if (def.category === "flux") {
    return "flux";
  }
  if (def.category === "qwen") {
    return "qwen";
  }
  return def.category;
}

export function buildWorkflowScaffoldForModel(
  model: ComfyImageModel | string,
  tokens?: Partial<WorkflowPlaceholderTokens>,
): WorkflowScaffoldResult {
  const resolvedTokens = resolveBindingTokens(tokens);
  const category = resolveScaffoldCategory(model);
  const useEditScaffold = isEditCapableModel(model);
  const useLightningScaffold = category === "qwen" && isQwenLightningModel(model);
  const graph = useEditScaffold
    ? editScaffold(resolvedTokens, category, model)
    : category === "flux"
      ? fluxScaffold(resolvedTokens)
      : useLightningScaffold
        ? qwenLightningScaffold(resolvedTokens)
        : category === "qwen"
          ? qwenScaffold(resolvedTokens)
          : genericScaffold(resolvedTokens);
  const notes = [
    "Starter graph with app placeholders — verify loader filenames match your ComfyUI models folder.",
    useEditScaffold
      ? isQwenEditModel(model)
        ? "Qwen Edit scaffold wires LoadImage → VAEEncode → KSampler with denoise — upload an image from Refine or Image → Prompt before queueing."
        : model === "flux-inpaint"
          ? "FLUX inpaint scaffold wires LoadImage + LoadImageMask → InpaintModelConditioning — upload source image and mask before queueing."
          : "Edit scaffold includes LoadImage + denoise — wire VAEEncode in ComfyUI if you use the generic edit template."
      : category === "qwen"
        ? useLightningScaffold
          ? "Lightning scaffold uses UNETLoader + Lightning LoRA ({{LORA_LIGHTNING}}) + ModelSamplingAuraFlow (shift ~3). Map your 4/8-step bf16 Lightning LoRA in Settings → LoRA library."
          : "Qwen scaffold uses UNETLoader + CLIPLoader (type qwen_image, bf16 by default) + VAELoader with {{UNET}}; edit clip/vae names if your pack differs."
        : "Use Settings → model checkpoint map so Send to ComfyUI can patch loader nodes automatically.",
  ];

  return {
    json: JSON.stringify(graph, null, 2),
    source: "template",
    model,
    category,
    bindingChanges: 0,
    notes,
  };
}

export function cloneWorkflowWithBindings(
  sourceJson: string,
  tokens?: Partial<WorkflowPlaceholderTokens>,
): WorkflowScaffoldResult {
  const prepared = prepareWorkflowJsonImport(sourceJson, tokens);
  if (!prepared.ok || !prepared.workflowJson) {
    return {
      json: sourceJson,
      source: "clone",
      model: "generic",
      category: "generic",
      bindingChanges: 0,
      notes: [prepared.error ?? "Could not parse workflow JSON for cloning."],
    };
  }
  const resolvedTokens = resolveBindingTokens(tokens);
  const bound = bindScaffoldJson(prepared.workflowJson, resolvedTokens);

  return {
    json: bound.json,
    source: "clone",
    model: "generic",
    category: "generic",
    bindingChanges: bound.bindingChanges + (prepared.autoAppliedBindings ?? 0),
    notes: prepared.notice ? [prepared.notice] : [],
  };
}

export function scaffoldWorkflowForModel(
  model: ComfyImageModel | string,
  options?: {
    sourceJson?: string;
    tokens?: Partial<WorkflowPlaceholderTokens>;
  },
): WorkflowScaffoldResult {
  if (options?.sourceJson?.trim()) {
    const cloned = cloneWorkflowWithBindings(options.sourceJson, options.tokens);
    return { ...cloned, model, category: resolveScaffoldCategory(model) };
  }
  return buildWorkflowScaffoldForModel(model, options?.tokens);
}

export function suggestedScaffoldName(
  model: ComfyImageModel | string,
  source: WorkflowScaffoldSource,
): string {
  const def = getComfyModelDefinition(model);
  const label = def?.label ?? model;
  return source === "clone" ? `${label} (bound clone)` : `${label} scaffold`;
}
