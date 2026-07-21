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

export function isSceneGenerationModel(model: ComfyImageModel | string): boolean {
  const id = String(model);
  // Rapid AIO SFW/NSFW are dual-purpose T2I checkpoints (edit optional).
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

/**
 * Normalize a model id for queue/tool use.
 * Never silently remap edit→T2I — that hid workflow-backed targets (Rapid AIO, 2511 Lightning, etc.).
 */
export function resolveModelForQueueTool(
  model: ComfyImageModel | string,
  _tool?: string,
): ComfyImageModel {
  if (COMFY_MODEL_IDS.has(model as ComfyImageModel)) {
    return model as ComfyImageModel;
  }
  return DEFAULT_COMFY_MODEL;
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
