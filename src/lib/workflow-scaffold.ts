import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
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
import {
  DEFAULT_UNET_TOKEN,
  resolveLoaderFilenamesForModel,
  SUGGESTED_MODEL_VAE_MAP,
} from "./model-checkpoint-map";
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

const DEFAULT_FLUX_CLIP_L = "clip_l.safetensors";
const DEFAULT_FLUX_CLIP_T5 = "t5xxl_fp16.safetensors";

function isFluxKleinModel(model?: ComfyImageModel | string): boolean {
  return typeof model === "string" && /flux-2-klein/i.test(model);
}

/** Klein text encoder — official Comfy uses Qwen3 CLIPLoader type flux2 (not DualCLIP type flux). */
export function fluxKleinDualClipFilename(model?: ComfyImageModel | string): string {
  if (!model) {
    return "qwen_3_4b.safetensors";
  }
  const loaders = resolveLoaderFilenamesForModel(String(model));
  if (loaders.dualClip?.trim()) {
    return loaders.dualClip.trim();
  }
  if (/9b/i.test(String(model))) {
    return "qwen_3_8b_fp8mixed.safetensors";
  }
  return "qwen_3_4b.safetensors";
}

function fluxVaeFilename(model?: ComfyImageModel | string): string {
  if (model && SUGGESTED_MODEL_VAE_MAP[model as ComfyImageModel]) {
    return SUGGESTED_MODEL_VAE_MAP[model as ComfyImageModel]!;
  }
  if (typeof model === "string" && /klein|flux.?2/i.test(model)) {
    return "flux2-vae.safetensors";
  }
  return "ae.safetensors";
}

function fluxDiffusionLoaders(model?: ComfyImageModel | string): {
  unetToken: string;
  clipL: string;
  clipT5: string;
  vaeName: string;
} {
  if (isFluxKleinModel(model)) {
    const dual = fluxKleinDualClipFilename(model);
    return {
      unetToken: DEFAULT_UNET_TOKEN,
      clipL: dual,
      clipT5: dual,
      vaeName: fluxVaeFilename(model),
    };
  }
  return {
    unetToken: DEFAULT_UNET_TOKEN,
    clipL: DEFAULT_FLUX_CLIP_L,
    clipT5: DEFAULT_FLUX_CLIP_T5,
    vaeName: fluxVaeFilename(model),
  };
}

/** Klein: CLIPLoader type flux2. Classic FLUX: DualCLIP clip_l + t5xxl type flux. */
function fluxTextEncoderNode(
  model: ComfyImageModel | string | undefined,
  loaders: ReturnType<typeof fluxDiffusionLoaders>,
): Record<string, unknown> {
  if (isFluxKleinModel(model)) {
    return {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: loaders.clipL,
        type: "flux2",
      },
      _meta: { title: "CLIPLoader (FLUX.2 Klein)" },
    };
  }
  return {
    class_type: "DualCLIPLoader",
    inputs: {
      clip_name1: loaders.clipL,
      clip_name2: loaders.clipT5,
      type: "flux",
    },
    _meta: { title: "DualCLIPLoader" },
  };
}

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
    initImage: tokens?.initImage?.trim() || DEFAULT_INIT_IMAGE_TOKEN,
    videoFrames: tokens?.videoFrames?.trim() || DEFAULT_VIDEO_FRAMES_TOKEN,
    videoFps: tokens?.videoFps?.trim() || DEFAULT_VIDEO_FPS_TOKEN,
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

function fluxScaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string,
): Record<string, unknown> {
  const loaders = fluxDiffusionLoaders(model);
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: loaders.unetToken, weight_dtype: "default" },
      _meta: { title: "Load UNET" },
    },
    "2": fluxTextEncoderNode(model, loaders),
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: "Load VAE" },
    },
    "4": {
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
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["2", 0] },
      _meta: { title: "Positive Prompt" },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["2", 0] },
      _meta: { title: "Negative Prompt" },
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
        model: ["4", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["7", 0],
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
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["1", 0],
        lora_name: LIGHTNING_LORA_TOKEN,
        strength_model: 1,
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

function qwenEditLightningScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string,
): Record<string, unknown> {
  const encodeClass = resolveQwenEditEncoderClass(model);
  const loaders = qwenLoaderFilenames();

  // Encode image1–4 stay disconnected for pure T2I (Generate). Figure LoadImages
  // are present with INPUT_IMAGE tokens for Compose/Refine soft-bind; queue
  // ensureQwenEditReferenceImagesForImg2Img wires encode slots when files exist,
  // and disconnectQwenEdit strips unused LoadImages for txt2img.
  const positiveEncode = {
    prompt: tokens.positive,
    clip: ["2", 0] as [string, number],
    vae: ["3", 0] as [string, number],
  };
  const negativeEncode = {
    prompt: tokens.negative,
    clip: ["2", 0] as [string, number],
    vae: ["3", 0] as [string, number],
  };

  const figureTokens = [
    tokens.inputImage?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    DEFAULT_INPUT_IMAGE_2_TOKEN,
    DEFAULT_INPUT_IMAGE_3_TOKEN,
    DEFAULT_INPUT_IMAGE_4_TOKEN,
  ];

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
      class_type: encodeClass,
      inputs: positiveEncode,
      _meta: { title: "Qwen Edit Encode (+)" },
    },
    "5": {
      class_type: encodeClass,
      inputs: negativeEncode,
      _meta: { title: "Qwen Edit Encode (−)" },
    },
    "6": {
      class_type: "EmptySD3LatentImage",
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: "Empty Latent" },
    },
    "7": {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["1", 0],
        lora_name: LIGHTNING_LORA_TOKEN,
        strength_model: 1,
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
    "900": {
      class_type: "LoadImage",
      inputs: { image: figureTokens[0] },
      _meta: { title: "Figure 1" },
    },
    "901": {
      class_type: "LoadImage",
      inputs: { image: figureTokens[1] },
      _meta: { title: "Figure 2" },
    },
    "902": {
      class_type: "LoadImage",
      inputs: { image: figureTokens[2] },
      _meta: { title: "Figure 3" },
    },
    "903": {
      class_type: "LoadImage",
      inputs: { image: figureTokens[3] },
      _meta: { title: "Figure 4" },
    },
  };
}

function qwenEditImg2imgScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string,
): Record<string, unknown> {
  // Lightning edit uses EmptyLatent + denoise 1; refs go through TextEncode*.
  if (isQwenLightningModel(model)) {
    return qwenEditLightningScaffold(tokens, model);
  }
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

function fluxInpaintScaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string,
): Record<string, unknown> {
  const loaders = fluxDiffusionLoaders(model);
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: loaders.unetToken, weight_dtype: "default" },
      _meta: { title: "Load UNET" },
    },
    "2": fluxTextEncoderNode(model, loaders),
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: "Load VAE" },
    },
    "4": {
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
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["2", 0] },
      _meta: { title: "Positive Prompt" },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["2", 0] },
      _meta: { title: "Negative Prompt" },
    },
    "903": {
      class_type: "InpaintModelConditioning",
      inputs: {
        positive: ["5", 0],
        negative: ["6", 0],
        vae: ["3", 0],
        pixels: ["900", 0],
        mask: ["902", 0],
      },
      _meta: { title: "Inpaint Conditioning" },
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
        model: ["4", 0],
        positive: ["903", 0],
        negative: ["903", 1],
        latent_image: ["903", 2],
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

function fluxImg2imgScaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string,
): Record<string, unknown> {
  const loaders = fluxDiffusionLoaders(model);
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: loaders.unetToken, weight_dtype: "default" },
      _meta: { title: "Load UNET" },
    },
    "2": fluxTextEncoderNode(model, loaders),
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: "Load VAE" },
    },
    "4": {
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
      inputs: { pixels: ["900", 0], vae: ["3", 0] },
      _meta: { title: "VAE Encode Input" },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.positive, clip: ["2", 0] },
      _meta: { title: "Positive Prompt" },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: tokens.negative, clip: ["2", 0] },
      _meta: { title: "Negative Prompt" },
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
        model: ["4", 0],
        positive: ["5", 0],
        negative: ["6", 0],
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

function editScaffold(
  tokens: WorkflowPlaceholderTokens,
  category: ComfyModelCategory | "generic",
  model: ComfyImageModel | string,
): Record<string, unknown> {
  if (isQwenEditModel(model)) {
    return qwenEditImg2imgScaffold(tokens, model);
  }
  if (model === "flux-inpaint") {
    return fluxInpaintScaffold(tokens, model);
  }
  if (category === "flux") {
    return fluxImg2imgScaffold(tokens, model);
  }

  const base =
    category === "qwen"
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

/**
 * FaceDetailer-ready scaffold: checkpoint + encode + LoadImage + SaveImage with
 * portable tokens. Insert Impact FaceDetailer / ReActor between image load and
 * save (bbox detector + FaceDetailer node), then pin `faceDetailer=<workflowId>`.
 */
export function buildFaceDetailerWorkflowScaffold(): WorkflowScaffoldResult {
  const workflow = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
      _meta: { title: "Load Checkpoint (face detail)" },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{POSITIVE}}", clip: ["1", 1] },
      _meta: { title: "Positive (optional FaceDetailer guide)" },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{NEGATIVE}}", clip: ["1", 1] },
      _meta: { title: "Negative (optional FaceDetailer guide)" },
    },
    "4": {
      class_type: "LoadImage",
      inputs: { image: "{{FACE_DETAIL_IMAGE}}" },
      _meta: { title: "Face detail input" },
    },
    "5": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "PromptStudio-face-detail",
        images: ["4", 0],
      },
      _meta: {
        title:
          "Save — insert Impact FaceDetailer/ReActor before this; keep {{FACE_DETAIL_IMAGE}} / {{FACE_DETAIL_DENOISE}}",
      },
    },
  };
  return {
    json: JSON.stringify(workflow, null, 2),
    source: "template",
    model: "sdxl-base",
    category: "sdxl",
    bindingChanges: 0,
    notes: [
      "FaceDetailer scaffold: Checkpoint + CLIP encodes + {{FACE_DETAIL_IMAGE}} + SaveImage.",
      "In ComfyUI, insert UltralyticsDetectorProvider (or bbox) + FaceDetailer between LoadImage and SaveImage; wire model/clip/vae from node 1 and denoise from {{FACE_DETAIL_DENOISE}}.",
      "Pin faceDetailer=<workflowId> in Settings → model workflow map after saving.",
    ],
  };
}

/**
 * InstantID / PuLID bring-your-own scaffold — LoadImage identity ref + save stub.
 * Replace the middle with your InstantID/PuLID node pack, then import into the library.
 */
export function buildIdentityWorkflowScaffold(
  kind: "instantid" | "pulid" = "instantid",
): WorkflowScaffoldResult {
  const label = kind === "pulid" ? "PuLID" : "InstantID";
  const workflow = {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
      _meta: { title: `Load Checkpoint (${label})` },
    },
    "2": {
      class_type: "LoadImage",
      inputs: { image: "{{IPADAPTER_IMAGE}}" },
      _meta: { title: `${label} identity reference` },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{POSITIVE}}", clip: ["1", 1] },
      _meta: { title: "Positive Prompt" },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: "{{NEGATIVE}}", clip: ["1", 1] },
      _meta: { title: "Negative Prompt" },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: "{{WIDTH}}",
        height: "{{HEIGHT}}",
        batch_size: 1,
      },
      _meta: { title: "Empty Latent" },
    },
    "6": {
      class_type: "KSampler",
      inputs: {
        seed: "{{SEED}}",
        steps: "{{STEPS}}",
        cfg: "{{CFG}}",
        sampler_name: "{{SAMPLER}}",
        scheduler: "{{SCHEDULER}}",
        denoise: "{{DENOISE}}",
        model: ["1", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["5", 0],
      },
      _meta: {
        title: `KSampler — insert ${label} apply between checkpoint and sampler`,
      },
    },
    "7": {
      class_type: "VAEDecode",
      inputs: { samples: ["6", 0], vae: ["1", 2] },
      _meta: { title: "VAE Decode" },
    },
    "8": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: `PromptStudio-${kind}`,
        images: ["7", 0],
      },
      _meta: { title: "Save Image" },
    },
  };
  return {
    json: JSON.stringify(workflow, null, 2),
    source: "template",
    model: "sdxl-base",
    category: "sdxl",
    bindingChanges: 0,
    notes: [
      `${label} BYO scaffold — identity image uses {{IPADAPTER_IMAGE}}. At queue time Studio may also auto-insert InstantID/PuLID when IP-Adapter Plus is absent and those nodes are installed.`,
      `Wire your ComfyUI ${label} apply node between checkpoint and KSampler, keep the identity LoadImage, then import this JSON into the workflow library.`,
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

type VideoLatentClass =
  | "EmptyHunyuanLatentVideo"
  | "EmptyLTXVLatentVideo"
  | "EmptyMochiLatentVideo";

function resolveVideoLatentClass(model: ComfyImageModel | string): VideoLatentClass {
  if (model === "ltx-video" || /ltx/i.test(String(model))) {
    return "EmptyLTXVLatentVideo";
  }
  if (/mochi/i.test(String(model))) {
    return "EmptyMochiLatentVideo";
  }
  // WAN and Hunyuan both commonly use EmptyHunyuanLatentVideo in stock Comfy graphs.
  return "EmptyHunyuanLatentVideo";
}

/**
 * Starter T2V graph for video models. Node "900" (LoadImage, title "Init Image")
 * is recognized by queue-time `patchVideoImageToVideoWiringInWorkflow` for WAN/Hunyuan I2V.
 * LTX scaffolds use EmptyLTXVLatentVideo; I2V auto-splice stays WAN/Hunyuan-only.
 */
function videoScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string = "wan-video",
): Record<string, unknown> {
  const latentClass = resolveVideoLatentClass(model);
  const i2vHint =
    latentClass === "EmptyLTXVLatentVideo"
      ? "Init Image (optional — import an LTX I2V graph for image-to-video; auto-splice is WAN/Hunyuan only)"
      : "Init Image (optional — auto-wired into WanImageToVideo/HunyuanImageToVideo at queue time)";

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
    "900": {
      class_type: "LoadImage",
      inputs: { image: tokens.initImage },
      _meta: { title: i2vHint },
    },
    "4": {
      class_type: latentClass,
      inputs: {
        width: tokens.width,
        height: tokens.height,
        length: tokens.videoFrames,
        batch_size: 1,
      },
      _meta: { title: "Empty Video Latent" },
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
      class_type: "SaveAnimatedWEBP",
      inputs: {
        images: ["6", 0],
        filename_prefix: "PromptStudio",
        fps: tokens.videoFps,
        lossless: false,
        quality: 90,
        method: "default",
      },
      _meta: { title: "Save Video (WEBP)" },
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
      ? fluxScaffold(resolvedTokens, model)
      : useLightningScaffold
        ? qwenLightningScaffold(resolvedTokens)
        : category === "qwen"
          ? qwenScaffold(resolvedTokens)
          : category === "video"
            ? videoScaffold(resolvedTokens, model)
            : genericScaffold(resolvedTokens);
  const videoLatentClass =
    category === "video" ? resolveVideoLatentClass(model) : null;
  const notes = [
    "Starter graph with app placeholders — verify loader filenames match your ComfyUI models folder.",
    useEditScaffold
      ? isQwenEditModel(model)
        ? isQwenLightningModel(model)
          ? "Lightning edit scaffold uses TextEncodeQwenImageEditPlus + EmptyLatent + Lightning LoRA (denoise 1). Figure 1–4 LoadImages use {{INPUT_IMAGE}}…{{INPUT_IMAGE_4}} but encode slots stay empty for Generate; Compose/Refine queue wires refs when you upload sources."
          : "Qwen Edit scaffold wires LoadImage → VAEEncode → KSampler with denoise — upload an image from Refine, Compose, or Image → Prompt before queueing."
        : model === "flux-inpaint"
          ? "FLUX inpaint scaffold wires LoadImage + LoadImageMask → InpaintModelConditioning — upload source image and mask before queueing."
          : "Edit scaffold includes LoadImage + denoise — wire VAEEncode in ComfyUI if you use the generic edit template."
      : category === "qwen"
        ? useLightningScaffold
          ? "Lightning scaffold uses UNETLoader + Lightning LoRA ({{LORA_LIGHTNING}}) + ModelSamplingAuraFlow (shift ~3). Map your 4/8-step bf16 Lightning LoRA in Settings → LoRA library."
          : "Qwen scaffold uses UNETLoader + CLIPLoader (type qwen_image, bf16 by default) + VAELoader with {{UNET}}; edit clip/vae names if your pack differs."
        : category === "flux"
          ? isFluxKleinModel(model)
            ? "FLUX Klein scaffold uses UNETLoader + CLIPLoader (type flux2, Qwen3-8B for 9B / Qwen3-4B for 4B) + VAELoader with {{UNET}} — soft-bound from Comfy inventory when available."
            : "FLUX scaffold uses UNETLoader + DualCLIPLoader (clip_l + t5xxl) + VAELoader with {{UNET}} — soft-bound from Comfy inventory when available."
          : category === "video"
            ? `Video scaffold uses ${videoLatentClass} ({{VIDEO_FRAMES}} length) + SaveAnimatedWEBP ({{VIDEO_FPS}}). Prefer importing a pack-accurate WAN/Hunyuan/LTX workflow when you have one. {{INIT_IMAGE}} is optional — WAN/Hunyuan queues with an init image auto-wire WanImageToVideo/HunyuanImageToVideo; LTX I2V needs a custom pack with LTXVImgToVideo.`
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
  const resolvedTokens = resolveBindingTokens(tokens);
  const prepared = prepareWorkflowJsonImport(sourceJson, resolvedTokens);
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
