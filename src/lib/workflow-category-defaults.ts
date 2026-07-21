import {
  COMFY_IMAGE_MODELS,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models";
import { isEditCapableModel } from "./model-denoise-defaults";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files";
import type { ModelWorkflowMap } from "./model-workflow-map";
import { scoreWorkflowStackForModel } from "./workflow-stack-fingerprint";
import { workflowHasLoraLoader } from "./workflow-lightning-queue";

const CATEGORY_KEYWORDS: Record<ComfyModelCategory, string[]> = {
  "stable-diffusion": ["sd15", "sd1.5", "sd-1.5", "stable-diffusion"],
  sdxl: ["sdxl", "ssd-1b", "segmind"],
  sd3: ["sd3", "sd-3", "auraflow"],
  flux: ["flux", "chroma", "klein"],
  qwen: ["qwen"],
  hunyuan: ["hunyuan", "hidream"],
  "other-dit": ["pixart", "lumina", "z-image", "omnigen", "kandinsky", "cascade"],
  "instruct-edit": ["instruct", "ip2p", "lotus", "edit"],
  video: ["video", "wan", "hunyuan-video", "motion"],
};

const MODEL_WORKFLOW_KEYWORDS: Partial<Record<ComfyImageModel, string[]>> = {
  "flux-2-klein": ["klein", "4b", "base", "klein-base", "klein-4b"],
  "flux-2-klein-4b-distilled": ["klein", "4b", "distilled", "klein-4b"],
  "flux-2-klein-9b": ["klein", "9b", "base", "klein-base", "klein-9b"],
  "flux-2-klein-9b-distilled": ["klein", "9b", "distilled", "klein-9b"],
  "flux-inpaint": ["inpaint", "flux-inpaint", "mask", "fill"],
  "qwen-image-2512-lightning-4": [
    "2512",
    "lightning",
    "lightx2v",
    "4step",
    "4-step",
    "4steps",
    "4-steps",
  ],
  "qwen-image-2512-lightning-8": [
    "2512",
    "lightning",
    "lightx2v",
    "8step",
    "8-step",
    "8steps",
    "8-steps",
  ],
  "qwen-image-2512": ["2512", "vanilla", "standard", "base", "txt2img", "t2i"],
  "qwen-image-edit-2511-lightning-4": [
    "2511",
    "edit",
    "lightning",
    "lightx2v",
    "4step",
    "4-step",
    "4steps",
    "4-steps",
  ],
  "qwen-image-edit-2511-lightning-8": [
    "2511",
    "edit",
    "lightning",
    "lightx2v",
    "8step",
    "8-step",
    "8steps",
    "8-steps",
  ],
  "qwen-rapid-aio-edit": [
    "rapid",
    "aio",
    "phr00t",
    "qwen-rapid",
    "rapid-aio",
    "checkpoint",
  ],
  "qwen-rapid-aio-sfw": ["rapid", "aio", "sfw", "qwen-rapid", "rapid-aio"],
  "qwen-rapid-aio-nsfw": ["rapid", "aio", "nsfw", "qwen-rapid", "rapid-aio"],
};

/** Penalize workflow labels that clearly target a different model variant. */
const MODEL_WORKFLOW_AVOID_KEYWORDS: Partial<Record<ComfyImageModel, string[]>> = {
  "flux-2-klein": ["distilled", "9b", "klein-9b"],
  "flux-2-klein-4b-distilled": ["base", "klein-base", "9b", "klein-9b"],
  "flux-2-klein-9b": ["distilled", "4b", "klein-4b", "inpaint", "mask", "fill"],
  "flux-2-klein-9b-distilled": ["base", "klein-base", "4b", "klein-4b", "inpaint", "mask", "fill"],
  "qwen-image-2512": ["edit", "inpaint", "img2img", "mask", "fill", "lightning", "lightx2v"],
  "qwen-image-2512-lightning-4": ["edit", "inpaint", "img2img", "mask", "fill"],
  "qwen-image-2512-lightning-8": ["edit", "inpaint", "img2img", "mask", "fill"],
  "flux-dev": ["inpaint", "mask", "fill"],
  "flux-2-klein-4b-distilled": ["inpaint", "mask", "fill"],
  "sdxl": ["inpaint", "mask", "fill"],
};

export function workflowRequiresInputImage(workflowJson?: string): boolean {
  if (!workflowJson?.trim()) {
    return false;
  }
  if (workflowJson.includes("{{INPUT_IMAGE}}")) {
    return true;
  }
  if (workflowJson.includes("{{MASK_IMAGE}}")) {
    return true;
  }
  if (workflowJson.includes("LoadImageMask")) {
    return true;
  }
  if (workflowJson.includes("InpaintModelConditioning")) {
    return true;
  }
  if (/TextEncodeQwenImageEdit/i.test(workflowJson)) {
    return true;
  }
  return false;
}

function scoreWorkflowForCategory(
  file: Pick<ComfyWorkflowFile, "name" | "filename">,
  category: ComfyModelCategory,
): number {
  const haystack = `${file.name} ${file.filename ?? ""}`.toLowerCase();
  const keywords = CATEGORY_KEYWORDS[category] ?? [];
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += 2;
    }
  }
  if (haystack.includes(category)) {
    score += 3;
  }
  return score;
}

function scoreWorkflowForModel(
  file: Pick<ComfyWorkflowFile, "name" | "filename" | "workflowJson">,
  modelId: ComfyImageModel,
  category: ComfyModelCategory,
): number {
  let score = scoreWorkflowForCategory(file, category);
  const haystack = `${file.name} ${file.filename ?? ""}`.toLowerCase();
  const modelKeywords = MODEL_WORKFLOW_KEYWORDS[modelId];
  if (modelKeywords) {
    for (const keyword of modelKeywords) {
      if (haystack.includes(keyword)) {
        score += 3;
      }
    }
  }

  const avoidKeywords = MODEL_WORKFLOW_AVOID_KEYWORDS[modelId];
  if (avoidKeywords) {
    for (const keyword of avoidKeywords) {
      if (haystack.includes(keyword)) {
        score -= 5;
      }
    }
  }

  const requiresInput = workflowRequiresInputImage(file.workflowJson);
  if (requiresInput && !isEditCapableModel(modelId)) {
    score -= 25;
  } else if (!requiresInput && isEditCapableModel(modelId)) {
    score -= 2;
  }

  if (workflowLabelImpliesLightning(file)) {
    const steps = inferLightningStepCount(file);
    if (steps === 4) {
      if (modelId.includes("lightning-8")) {
        score -= 4;
      }
      if (modelId.includes("lightning-4")) {
        score += 4;
      }
    }
    if (steps === 8) {
      if (modelId.includes("lightning-4")) {
        score -= 4;
      }
      if (modelId.includes("lightning-8")) {
        score += 4;
      }
    }
    // Vanilla / non-Lightning Qwen must not claim Lightning LoRA graphs.
    if (!modelId.includes("lightning")) {
      score -= 10;
    }
  } else if (modelId.includes("lightning")) {
    // Prefer labeled Lightning workflows for Lightning model ids.
    score -= 3;
  }

  score += scoreWorkflowStackForModel(file.workflowJson, modelId);

  if (modelId.includes("lightning") && file.workflowJson?.trim()) {
    try {
      const parsed = JSON.parse(file.workflowJson) as Record<string, unknown>;
      if (workflowHasLoraLoader(parsed)) {
        score += 6;
      }
    } catch {
      // ignore invalid workflow JSON during ranking
    }
  }

  return score;
}

export function rankWorkflowFilesForModel(
  model: ComfyImageModel,
  files: ComfyWorkflowFile[],
): Array<{ file: ComfyWorkflowFile; score: number }> {
  const def = COMFY_IMAGE_MODELS.find((entry) => entry.id === model);
  const category = def?.category ?? "other-dit";
  return files
    .map((file) => ({
      file,
      score: scoreWorkflowForModel(file, model, category),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function suggestWorkflowDefaultsByCategory(
  files: ComfyWorkflowFile[],
): ModelWorkflowMap {
  const map: ModelWorkflowMap = {};

  for (const model of COMFY_IMAGE_MODELS) {
    const ranked = [...files]
      .map((file) => ({
        file,
        score: scoreWorkflowForModel(file, model.id, model.category),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      continue;
    }

    map[model.id] = ranked[0]!.file.id;
  }

  return map;
}

/** Guess compatible models from workflow name/filename when no assignment map entry exists. */
export function inferModelsFromWorkflowLabel(input: {
  name: string;
  filename?: string;
}): ComfyImageModel[] {
  const haystack = `${input.name} ${input.filename ?? ""}`.toLowerCase();
  const scored = COMFY_IMAGE_MODELS.map((model) => ({
    model: model.id,
    score: scoreWorkflowForModel(input, model.id, model.category),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return [];
  }

  const topScore = scored[0]!.score;
  return scored
    .filter((entry) => entry.score >= topScore - 1)
    .map((entry) => entry.model);
}

export function mergeModelWorkflowMap(
  current: ModelWorkflowMap | undefined,
  suggested: ModelWorkflowMap,
  overwrite = false,
): ModelWorkflowMap {
  const next: ModelWorkflowMap = { ...(current ?? {}) };
  for (const [modelId, workflowId] of Object.entries(suggested)) {
    if (overwrite || !next[modelId]) {
      next[modelId as ComfyImageModel] = workflowId;
    }
  }
  return next;
}

export function countMappedModels(map: ModelWorkflowMap): number {
  return Object.keys(map).length;
}

/** True when the workflow label looks like a Lightning LoRA pipeline. */
export function workflowLabelImpliesLightning(input: {
  name: string;
  filename?: string;
}): boolean {
  const haystack = `${input.name} ${input.filename ?? ""}`.toLowerCase();
  return haystack.includes("lightning") || haystack.includes("lightx2v");
}

/** Infer 4- vs 8-step Lightning from workflow filename when possible. */
export function inferLightningStepCount(input: {
  name: string;
  filename?: string;
}): 4 | 8 | undefined {
  const haystack = `${input.name} ${input.filename ?? ""}`.toLowerCase();
  if (/(^|[^0-9])4[\s-]?step/.test(haystack) || haystack.includes("4steps")) {
    return 4;
  }
  if (/(^|[^0-9])8[\s-]?step/.test(haystack) || haystack.includes("8steps")) {
    return 8;
  }
  return undefined;
}
