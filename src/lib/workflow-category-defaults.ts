import {
  COMFY_IMAGE_MODELS,
  COMFY_MODEL_CATEGORIES,
  type ComfyImageModel,
  type ComfyModelCategory,
} from "./comfy-models";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files";
import type { ModelWorkflowMap } from "./model-workflow-map";

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

export function suggestWorkflowDefaultsByCategory(
  files: ComfyWorkflowFile[],
): ModelWorkflowMap {
  const map: ModelWorkflowMap = {};

  for (const category of COMFY_MODEL_CATEGORIES.map((entry) => entry.id)) {
    const ranked = [...files]
      .map((file) => ({ file, score: scoreWorkflowForCategory(file, category) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      continue;
    }

    const workflowId = ranked[0].file.id;
    for (const model of COMFY_IMAGE_MODELS) {
      if (model.category === category && !map[model.id]) {
        map[model.id] = workflowId;
      }
    }
  }

  return map;
}

/** Guess compatible models from workflow name/filename when no assignment map entry exists. */
export function inferModelsFromWorkflowLabel(input: {
  name: string;
  filename?: string;
}): ComfyImageModel[] {
  const ranked = COMFY_MODEL_CATEGORIES.map((entry) => ({
    category: entry.id,
    score: scoreWorkflowForCategory(input, entry.id),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return [];
  }

  const topScore = ranked[0]!.score;
  const categories = ranked
    .filter((entry) => entry.score >= topScore - 1)
    .map((entry) => entry.category);

  return COMFY_IMAGE_MODELS.filter((model) => categories.includes(model.category)).map(
    (model) => model.id,
  );
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
