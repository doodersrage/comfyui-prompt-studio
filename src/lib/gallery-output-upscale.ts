import { DEFAULT_INPUT_IMAGE_TOKEN } from "./comfyui-config";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { buildComfyViewPath } from "./comfyui-outputs";
import {
  lanczosPolishScaleAfterNeural,
  neuralUpscaleTileSizeForProfile,
  profileUsesNeuralUpscalePolish,
  profileUsesSharpenAfterUpscale,
  sharpenAlphaForProfile,
  upscaleScaleForProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";
import { IMAGE_SCALE_BY_NODE_TYPE } from "./workflow-direct-patch";

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
};

export type BuildGalleryUpscaleWorkflowInput = {
  qualityProfile: Extract<QueueQualityProfile, "final" | "max">;
  upscaleModelFilename?: string;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
};

export function resolveGalleryOutputImageUrl(
  entry: Pick<ComfyGalleryEntry, "comfyUrl" | "images" | "sourceImageUrl">,
): string | undefined {
  const comfyUrl = entry.comfyUrl?.replace(/\/+$/, "") ?? "";
  if (entry.images[0] && comfyUrl) {
    return buildComfyViewPath(comfyUrl, entry.images[0]);
  }
  if (entry.sourceImageUrl?.trim()) {
    return entry.sourceImageUrl.trim();
  }
  return undefined;
}

export function buildGalleryUpscaleWorkflow(
  input: BuildGalleryUpscaleWorkflowInput,
): Record<string, WorkflowNode> {
  let nextId = 1;
  const id = () => String(nextId++);

  const loadId = id();
  const workflow: Record<string, WorkflowNode> = {
    [loadId]: {
      class_type: "LoadImage",
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: "Prompt Studio — gallery output" },
    },
  };

  let outputNodeId = loadId;
  const modelName = input.upscaleModelFilename?.trim();
  const useNeural = input.qualityProfile === "max" && Boolean(modelName);

  if (useNeural && modelName) {
    const loaderId = id();
    workflow[loaderId] = {
      class_type: "UpscaleModelLoader",
      inputs: { model_name: modelName },
      _meta: { title: "Prompt Studio — upscale model" },
    };

    const upscaleId = id();
    const tileSize = neuralUpscaleTileSizeForProfile(input.qualityProfile);
    const upscaleInputs: Record<string, unknown> = {
      upscale_model: [loaderId, 0],
      image: [outputNodeId, 0],
    };
    if (tileSize > 0) {
      upscaleInputs.tile_size = tileSize;
    }
    workflow[upscaleId] = {
      class_type: "ImageUpscaleWithModel",
      inputs: upscaleInputs,
      _meta: { title: "Prompt Studio — neural upscale" },
    };
    outputNodeId = upscaleId;

    const usePolish =
      input.enrichNeuralPolish !== false &&
      profileUsesNeuralUpscalePolish(input.qualityProfile);
    if (usePolish) {
      const polishId = id();
      workflow[polishId] = {
        class_type: IMAGE_SCALE_BY_NODE_TYPE,
        inputs: {
          image: [outputNodeId, 0],
          upscale_method: "lanczos",
          scale_by: lanczosPolishScaleAfterNeural(),
        },
        _meta: { title: "Prompt Studio — Lanczos polish" },
      };
      outputNodeId = polishId;
    }
  } else {
    const scaleId = id();
    workflow[scaleId] = {
      class_type: IMAGE_SCALE_BY_NODE_TYPE,
      inputs: {
        image: [outputNodeId, 0],
        upscale_method: "lanczos",
        scale_by: upscaleScaleForProfile(input.qualityProfile),
      },
      _meta: { title: "Prompt Studio — output upscale" },
    };
    outputNodeId = scaleId;
  }

  if (
    input.enrichSharpen === true &&
    profileUsesSharpenAfterUpscale(input.qualityProfile)
  ) {
    const sharpenId = id();
    workflow[sharpenId] = {
      class_type: "ImageSharpen",
      inputs: {
        image: [outputNodeId, 0],
        sharpen_radius: 1,
        sigma: 0.45,
        alpha: sharpenAlphaForProfile(input.qualityProfile),
      },
      _meta: { title: "Prompt Studio — output sharpen" },
    };
    outputNodeId = sharpenId;
  }

  const saveId = id();
  workflow[saveId] = {
    class_type: "SaveImage",
    inputs: {
      filename_prefix: "PromptStudio-upscale",
      images: [outputNodeId, 0],
    },
    _meta: { title: "Prompt Studio — save" },
  };

  return workflow;
}
