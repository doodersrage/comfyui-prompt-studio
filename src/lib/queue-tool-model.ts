import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
} from "./comfy-models/client";
import {
  isEditCapableModel,
  isEditQueueTool,
  isInpaintModel,
} from "./model-denoise-defaults";

const EDIT_TO_TXT2I: Partial<Record<ComfyImageModel, ComfyImageModel>> = {
  "qwen-image-edit": "qwen-image-2512",
  "qwen-image-edit-2511": "qwen-image-2512",
  "qwen-image-edit-2511-lightning-4": "qwen-image-2512-lightning-4",
  "qwen-image-edit-2511-lightning-8": "qwen-image-2512-lightning-8",
  "qwen-rapid-aio-edit": "qwen-image-2512-lightning-8",
  "flux-inpaint": "flux-dev",
};

function inferTxt2iCounterpart(model: ComfyImageModel | string): ComfyImageModel {
  const mapped = EDIT_TO_TXT2I[model as ComfyImageModel];
  if (mapped) {
    return mapped;
  }

  const id = model.toLowerCase();
  if (id.includes("lightning-4")) {
    return "qwen-image-2512-lightning-4";
  }
  if (id.includes("lightning-8")) {
    return "qwen-image-2512-lightning-8";
  }
  if (id.includes("qwen")) {
    return "qwen-image-2512";
  }
  if (id.includes("flux")) {
    return "flux-dev";
  }
  if (id.includes("sdxl")) {
    return "sdxl-base";
  }
  return DEFAULT_COMFY_MODEL;
}

export function isSceneGenerationModel(model: ComfyImageModel | string): boolean {
  const id = String(model);
  if (/^qwen-rapid-aio-(sfw|nsfw)$/i.test(id)) {
    return true;
  }

  const def = getComfyModelDefinition(model);
  if (!def) {
    return !/edit|inpaint|ip2p|pix2pix/i.test(id);
  }
  if (def.category === "instruct-edit") {
    return false;
  }
  if (
    def.profile === "qwen_edit" ||
    def.profile === "qwen_edit_instruction" ||
    def.profile === "instruct_pix2pix"
  ) {
    return false;
  }
  if (isInpaintModel(model)) {
    return false;
  }
  return !isEditCapableModel(model);
}

export function shouldUseSceneGenerationModel(tool?: string): boolean {
  return Boolean(tool && !isEditQueueTool(tool));
}

function normalizeModel(model: ComfyImageModel | string): ComfyImageModel {
  if (COMFY_MODEL_IDS.has(model as ComfyImageModel)) {
    return model as ComfyImageModel;
  }
  return DEFAULT_COMFY_MODEL;
}

/**
 * Keep the user's selected target model for workflow / checkpoint queueing.
 * Do not silently swap edit Lightning presets away from their mapped workflows.
 */
export function resolveModelForQueueTool(
  model: ComfyImageModel | string,
  _tool?: string,
): ComfyImageModel {
  return normalizeModel(model);
}

/**
 * Prompt writing on Generate should use scene/T2I profiles — not edit-instruction
 * "Keep/Replace" templates — even when an edit checkpoint is selected for queueing.
 */
export function resolveModelForPromptGeneration(
  model: ComfyImageModel | string,
  tool?: string,
): ComfyImageModel {
  const normalized = normalizeModel(model);

  if (!shouldUseSceneGenerationModel(tool)) {
    return normalized;
  }

  if (isSceneGenerationModel(normalized)) {
    return normalized;
  }

  return inferTxt2iCounterpart(normalized);
}

export type FilterModelsForQueueToolOptions = {
  /**
   * When true (workflow library matches / show-all override), keep every matched
   * model — including edit Lightning presets the user just imported.
   */
  workflowBacked?: boolean;
};

export function filterModelsForQueueTool(
  models: ComfyImageModel[],
  tool?: string,
  options?: FilterModelsForQueueToolOptions,
): ComfyImageModel[] {
  if (!shouldUseSceneGenerationModel(tool) || options?.workflowBacked) {
    return models;
  }
  return models.filter((model) => isSceneGenerationModel(model));
}

const EDIT_INSTRUCTION_LEAD =
  /^Keep (?:the )?(?:person|subject|figure(?:\s*1)?)\b.*?\.\s*/i;

const REPLACE_SCENE_LEAD = /^Replace the scene with\s+/i;

const MODEL_LABEL_ECHO =
  /\b(?:from\s+)?Qwen-Image-Edit(?:-[\w-]+)?(?:\s+Lightning\s*\(\d+-step\))?(?:\s+format)?\.?\s*/gi;

export function stripEditInstructionLead(
  prompt: string,
  tool?: string,
): string {
  if (!shouldUseSceneGenerationModel(tool)) {
    return prompt;
  }

  let text = prompt.trim();
  if (!text) {
    return text;
  }

  text = text.replace(EDIT_INSTRUCTION_LEAD, "");
  text = text.replace(REPLACE_SCENE_LEAD, "");
  text = text.replace(MODEL_LABEL_ECHO, "");
  text = text.replace(/\bDETAIL LEVEL:[^.]*\.?\s*/gi, "");

  return text.trim();
}
