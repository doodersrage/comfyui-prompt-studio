import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { buildComfyViewPath } from "./comfyui-outputs";
import { isQwenLightningModel } from "./model-sampling-patch";
import {
  lanczosPolishScaleAfterNeural,
  neuralUpscaleTileSizeForProfile,
  profileUsesNeuralUpscalePolish,
  profileUsesSharpenAfterUpscale,
  rapidAioMoireBlurRadius,
  rapidAioMoireBlurSigma,
  rapidAioMoireDownscaleFactor,
  rapidAioMoireDownscaleMethod,
  rapidAioMoireRestoreScale,
  rapidAioMoireRestoreSharpenAlpha,
  profileUsesRapidAioMoireResample,
  sharpenAlphaForProfile,
  upscaleScaleForProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";
import { IMAGE_SCALE_BY_NODE_TYPE } from "./workflow-direct-patch";
import { DEFAULT_INPUT_IMAGE_TOKEN } from "./comfyui-config";
import { isUpscaleModelInstalled } from "./model-upscale-map";

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
  /** Lightning skips upscale reprocess entirely. */
  model?: string;
  availableUpscaleModels?: string[] | null;
  supportsNeuralUpscaleTileSize?: boolean;
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

/**
 * Lightning must not re-encode or resample gallery outputs — soft scale still looks mushy.
 * Pass-through LoadImage → SaveImage only.
 */
export function buildLightningGalleryUpscaleWorkflow(): Record<string, WorkflowNode> {
  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: "Prompt Studio — gallery output" },
    },
    "2": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "PromptStudio-upscale",
        images: ["1", 0],
      },
      _meta: { title: "Prompt Studio — save" },
    },
  };
}

/**
 * Gallery-only moiré cleanup matching queue polish:
 * Final → soft blur only (keeps acuity); Max → blur + mild bicubic↓/Lanczos↑.
 */
export function buildGalleryMoireCleanWorkflow(
  qualityProfile: Extract<QueueQualityProfile, "final" | "max"> = "final",
): Record<string, WorkflowNode> {
  const blurRadius = rapidAioMoireBlurRadius(qualityProfile);
  const blurSigma = rapidAioMoireBlurSigma(qualityProfile);
  const resample = profileUsesRapidAioMoireResample(qualityProfile);

  const workflow: Record<string, WorkflowNode> = {
    "1": {
      class_type: "LoadImage",
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: "Prompt Studio — gallery output" },
    },
    "2": {
      class_type: "ImageBlur",
      inputs: {
        image: ["1", 0],
        blur_radius: blurRadius,
        sigma: blurSigma,
      },
      _meta: { title: "Prompt Studio — moiré polish" },
    },
  };

  let outputId = "2";
  let nextId = 3;

  if (resample) {
    const downscale = rapidAioMoireDownscaleFactor(qualityProfile);
    const downMethod = rapidAioMoireDownscaleMethod(qualityProfile);
    const restore = rapidAioMoireRestoreScale(qualityProfile);
    const sharpenAlpha = rapidAioMoireRestoreSharpenAlpha(qualityProfile);

    const downId = String(nextId++);
    workflow[downId] = {
      class_type: IMAGE_SCALE_BY_NODE_TYPE,
      inputs: {
        image: [outputId, 0],
        upscale_method: downMethod,
        scale_by: downscale,
      },
      _meta: { title: "Prompt Studio — moiré downscale" },
    };

    const restoreId = String(nextId++);
    workflow[restoreId] = {
      class_type: IMAGE_SCALE_BY_NODE_TYPE,
      inputs: {
        image: [downId, 0],
        upscale_method: "lanczos",
        scale_by: restore,
      },
      _meta: { title: "Prompt Studio — moiré size restore" },
    };
    outputId = restoreId;

    if (sharpenAlpha > 0) {
      const sharpenId = String(nextId++);
      workflow[sharpenId] = {
        class_type: "ImageSharpen",
        inputs: {
          image: [outputId, 0],
          sharpen_radius: 1,
          sigma: 0.6,
          alpha: sharpenAlpha,
        },
        _meta: { title: "Prompt Studio — moiré edge recovery" },
      };
      outputId = sharpenId;
    }
  }

  const saveId = String(nextId);
  workflow[saveId] = {
    class_type: "SaveImage",
    inputs: {
      filename_prefix: "PromptStudio-moire-clean",
      images: [outputId, 0],
    },
    _meta: { title: "Prompt Studio — save" },
  };

  return workflow;
}

export function buildGalleryUpscaleWorkflow(
  input: BuildGalleryUpscaleWorkflowInput,
): Record<string, WorkflowNode> {
  if (isQwenLightningModel(input.model)) {
    return buildLightningGalleryUpscaleWorkflow();
  }

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
  const useNeural =
    input.qualityProfile === "max" &&
    Boolean(modelName) &&
    isUpscaleModelInstalled(modelName, input.availableUpscaleModels);

  if (useNeural && modelName) {
    const loaderId = id();
    workflow[loaderId] = {
      class_type: "UpscaleModelLoader",
      inputs: { model_name: modelName },
      _meta: { title: "Prompt Studio — upscale model" },
    };

    const upscaleId = id();
    const tileSize =
      input.supportsNeuralUpscaleTileSize === true
        ? neuralUpscaleTileSizeForProfile(input.qualityProfile)
        : 0;
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
      profileUsesNeuralUpscalePolish(input.qualityProfile, { model: input.model });
    if (usePolish) {
      const polishId = id();
      workflow[polishId] = {
        class_type: IMAGE_SCALE_BY_NODE_TYPE,
        inputs: {
          image: [outputNodeId, 0],
          upscale_method: "lanczos",
          scale_by: lanczosPolishScaleAfterNeural({ model: input.model }),
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
        scale_by: upscaleScaleForProfile(input.qualityProfile, { model: input.model }),
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
