import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
} from "./comfyui-config";
import {
  getComfyModelDefinition,
  normalizeComfyModel,
  type ComfyImageModel,
} from "./comfy-models";
import {
  defaultLoaderPrecisionTier,
  qwenDualClipFilename,
} from "./model-loader-precision";
import type { QueueQualityProfile } from "./queue-quality-profile";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

export const GALLERY_REFINE_DENOISE: Record<"final" | "max", number> = {
  final: 0.22,
  max: 0.26,
};

export const GALLERY_REFINE_PORTRAIT_DENOISE: Record<"final" | "max", number> = {
  final: 0.18,
  max: 0.22,
};

const PORTRAIT_REFINE_PATTERN =
  /\b(portrait|face|skin|headshot|close-?up|selfie|beauty|model\s+face)\b/i;

export function isPortraitRefinePrompt(prompt: string | undefined): boolean {
  return PORTRAIT_REFINE_PATTERN.test(prompt?.trim() ?? "");
}

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
};

export function galleryRefineDenoiseForProfile(
  profile: Extract<QueueQualityProfile, "final" | "max"> | undefined,
  prompt?: string,
): number {
  const key = profile === "max" ? "max" : "final";
  const table = isPortraitRefinePrompt(prompt)
    ? GALLERY_REFINE_PORTRAIT_DENOISE
    : GALLERY_REFINE_DENOISE;
  return table[key];
}

export function galleryRefineDenoiseForEntry(
  entry: Pick<ComfyGalleryEntry, "prompt">,
  profile: Extract<QueueQualityProfile, "final" | "max"> | undefined,
): number {
  return galleryRefineDenoiseForProfile(profile, entry.prompt);
}

function buildCheckpointGalleryRefineWorkflow(
  options?: { useAuraFlow?: boolean },
): Record<string, WorkflowNode> {
  const modelNodeId = "1";
  const loadImageId = "2";
  const vaeEncodeId = "3";
  const positiveId = "4";
  const negativeId = "5";
  const samplingId = "6";
  const samplerId = "7";
  const decodeId = "8";
  const saveId = "9";

  const workflow: Record<string, WorkflowNode> = {
    [modelNodeId]: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: "{{CHECKPOINT}}" },
      _meta: { title: "Prompt Studio — checkpoint" },
    },
    [loadImageId]: {
      class_type: "LoadImage",
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: "Prompt Studio — gallery output" },
    },
    [vaeEncodeId]: {
      class_type: "VAEEncode",
      inputs: {
        pixels: [loadImageId, 0],
        vae: [modelNodeId, 2],
      },
      _meta: { title: "Prompt Studio — encode input" },
    },
    [positiveId]: {
      class_type: "CLIPTextEncode",
      inputs: { text: DEFAULT_POSITIVE_TOKEN, clip: [modelNodeId, 1] },
      _meta: { title: "Prompt Studio — positive" },
    },
    [negativeId]: {
      class_type: "CLIPTextEncode",
      inputs: { text: DEFAULT_NEGATIVE_TOKEN, clip: [modelNodeId, 1] },
      _meta: { title: "Prompt Studio — negative" },
    },
  };

  const samplerModelRef: [string, number] = options?.useAuraFlow
    ? (() => {
        workflow[samplingId] = {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: [modelNodeId, 0], shift: DEFAULT_SHIFT_TOKEN },
          _meta: { title: "Prompt Studio — sampling" },
        };
        return [samplingId, 0] as [string, number];
      })()
    : [modelNodeId, 0];

  workflow[samplerId] = {
    class_type: "KSampler",
    inputs: {
      seed: DEFAULT_SEED_TOKEN,
      steps: DEFAULT_STEPS_TOKEN,
      cfg: DEFAULT_CFG_TOKEN,
      sampler_name: DEFAULT_SAMPLER_TOKEN,
      scheduler: DEFAULT_SCHEDULER_TOKEN,
      denoise: DEFAULT_DENOISE_TOKEN,
      model: samplerModelRef,
      positive: [positiveId, 0],
      negative: [negativeId, 0],
      latent_image: [vaeEncodeId, 0],
    },
    _meta: { title: "Prompt Studio — refine sampler" },
  };
  workflow[decodeId] = {
    class_type: "VAEDecode",
    inputs: { samples: [samplerId, 0], vae: [modelNodeId, 2] },
    _meta: { title: "Prompt Studio — decode" },
  };
  workflow[saveId] = {
    class_type: "SaveImage",
    inputs: {
      filename_prefix: "PromptStudio-refine",
      images: [decodeId, 0],
    },
    _meta: { title: "Prompt Studio — save" },
  };

  return workflow;
}

function buildQwenGalleryRefineWorkflow(): Record<string, WorkflowNode> {
  const tier = defaultLoaderPrecisionTier();
  const clipName = qwenDualClipFilename(tier);

  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: "default" },
      _meta: { title: "Prompt Studio — UNET" },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: clipName,
        clip_name2: clipName,
        type: "qwen_image",
      },
      _meta: { title: "Prompt Studio — CLIP" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: DEFAULT_VAE_TOKEN },
      _meta: { title: "Prompt Studio — VAE" },
    },
    "4": {
      class_type: "LoadImage",
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: "Prompt Studio — gallery output" },
    },
    "5": {
      class_type: "VAEEncode",
      inputs: { pixels: ["4", 0], vae: ["3", 0] },
      _meta: { title: "Prompt Studio — encode input" },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: DEFAULT_POSITIVE_TOKEN, clip: ["2", 0] },
      _meta: { title: "Prompt Studio — positive" },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: DEFAULT_NEGATIVE_TOKEN, clip: ["2", 0] },
      _meta: { title: "Prompt Studio — negative" },
    },
    "8": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: DEFAULT_SHIFT_TOKEN },
      _meta: { title: "Prompt Studio — sampling" },
    },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed: DEFAULT_SEED_TOKEN,
        steps: DEFAULT_STEPS_TOKEN,
        cfg: DEFAULT_CFG_TOKEN,
        sampler_name: DEFAULT_SAMPLER_TOKEN,
        scheduler: DEFAULT_SCHEDULER_TOKEN,
        denoise: DEFAULT_DENOISE_TOKEN,
        model: ["8", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
      _meta: { title: "Prompt Studio — refine sampler" },
    },
    "10": {
      class_type: "VAEDecode",
      inputs: { samples: ["9", 0], vae: ["3", 0] },
      _meta: { title: "Prompt Studio — decode" },
    },
    "11": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "PromptStudio-refine",
        images: ["10", 0],
      },
      _meta: { title: "Prompt Studio — save" },
    },
  };
}

export function buildGalleryRefineWorkflow(
  model: ComfyImageModel | string = "qwen-image-2512",
): Record<string, WorkflowNode> {
  const definition = getComfyModelDefinition(normalizeComfyModel(model));
  if (definition.category === "qwen") {
    return buildQwenGalleryRefineWorkflow();
  }
  if (definition.category === "flux") {
    return buildCheckpointGalleryRefineWorkflow({ useAuraFlow: true });
  }
  return buildCheckpointGalleryRefineWorkflow();
}

export function galleryRefineQueueParams(input: {
  inputImageFilename: string;
  profile?: Extract<QueueQualityProfile, "final" | "max">;
  prompt?: string;
  queueParams?: {
    seed?: string;
    width?: string;
    height?: string;
    cfg?: string;
    steps?: string;
    sampler?: string;
    scheduler?: string;
  };
}): Record<string, string> {
  const params: Record<string, string> = {
    inputImageFilename: input.inputImageFilename,
    denoise: String(galleryRefineDenoiseForProfile(input.profile, input.prompt)),
  };

  for (const key of ["seed", "width", "height", "cfg", "steps", "sampler", "scheduler"] as const) {
    const value = input.queueParams?.[key];
    if (value?.trim()) {
      params[key] = value.trim();
    }
  }

  return params;
}
