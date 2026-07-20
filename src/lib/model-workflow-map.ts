import type { ComfyImageModel } from "./comfy-models";
import { COMFY_IMAGE_MODELS } from "./comfy-models";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files";
import { suggestWorkflowDefaultsByCategory } from "./workflow-category-defaults";
import type { SharedToolSettings } from "./settings-cache";

export type ModelWorkflowMap = Record<string, string>;

const ALL_MODELS = COMFY_IMAGE_MODELS.map((entry) => entry.id);

export type SupportedModelsSource =
  | "disabled"
  | "override"
  | "available_workflows"
  | "empty_fallback";

export function resolveWorkflowForModel(
  model: ComfyImageModel,
  map?: ModelWorkflowMap,
): string | undefined {
  if (!map) {
    return undefined;
  }

  return map[model]?.trim() || undefined;
}

/** Explicit map entry first, then filename-based default for the model family. */
export function resolveWorkflowForModelSelection(
  model: ComfyImageModel,
  options?: {
    map?: ModelWorkflowMap;
    workflowFiles?: Array<Pick<ComfyWorkflowFile, "id" | "name" | "filename">>;
    /** Precomputed from suggestWorkflowDefaultsByCategory to avoid repeat work. */
    suggestedMap?: ModelWorkflowMap;
  },
): string | undefined {
  const fromMap = resolveWorkflowForModel(model, options?.map);
  if (fromMap) {
    return fromMap;
  }

  const suggested =
    options?.suggestedMap ??
    (options?.workflowFiles?.length
      ? suggestWorkflowDefaultsByCategory(
          options.workflowFiles as ComfyWorkflowFile[],
        )
      : undefined);
  return suggested?.[model]?.trim() || undefined;
}

export function suggestWorkflowMapForFiles(
  workflowFiles?: Array<Pick<ComfyWorkflowFile, "id" | "name" | "filename">>,
): ModelWorkflowMap {
  if (!workflowFiles?.length) {
    return {};
  }
  return suggestWorkflowDefaultsByCategory(workflowFiles as ComfyWorkflowFile[]);
}

export function patchSharedForModelChange(
  model: ComfyImageModel,
  shared: SharedToolSettings,
  workflowFiles?: Array<Pick<ComfyWorkflowFile, "id" | "name" | "filename">>,
): Partial<SharedToolSettings> {
  const patch: Partial<SharedToolSettings> = { model };
  const workflowId = resolveWorkflowForModelSelection(model, {
    map: shared.modelWorkflowMap,
    workflowFiles,
  });
  if (workflowId) {
    patch.selectedWorkflowFileId = workflowId;
  }
  return patch;
}

/** Models that have a resolvable workflow from the map and/or imported workflow files. */
export function modelsSupportedByAvailableWorkflows(input: {
  map?: ModelWorkflowMap;
  workflowFiles?: Array<Pick<ComfyWorkflowFile, "id" | "name" | "filename">>;
  suggestedMap?: ModelWorkflowMap;
  currentModel: ComfyImageModel;
  limitEnabled?: boolean;
  showAllOverride?: boolean;
}): { models: ComfyImageModel[]; source: SupportedModelsSource } {
  if (input.showAllOverride) {
    return { models: ALL_MODELS, source: "override" };
  }

  if (input.limitEnabled === false) {
    return { models: ALL_MODELS, source: "disabled" };
  }

  const files = input.workflowFiles ?? [];
  const availableWorkflowIds = new Set(
    files.map((file) => file.id.trim()).filter(Boolean),
  );
  const supported = new Set<ComfyImageModel>();

  const suggested =
    input.suggestedMap ??
    (files.length > 0
      ? suggestWorkflowDefaultsByCategory(files as ComfyWorkflowFile[])
      : {});

  if (files.length > 0) {
    for (const modelId of Object.keys(suggested)) {
      if (ALL_MODELS.includes(modelId as ComfyImageModel)) {
        supported.add(modelId as ComfyImageModel);
      }
    }
  }

  if (input.map) {
    for (const [modelId, workflowId] of Object.entries(input.map)) {
      const normalizedWorkflowId = workflowId?.trim();
      if (
        !normalizedWorkflowId ||
        !ALL_MODELS.includes(modelId as ComfyImageModel)
      ) {
        continue;
      }
      if (
        availableWorkflowIds.size === 0 ||
        availableWorkflowIds.has(normalizedWorkflowId)
      ) {
        supported.add(modelId as ComfyImageModel);
      }
    }
  }

  if (supported.size === 0) {
    const noCatalog = files.length === 0 && !input.map;
    return { models: ALL_MODELS, source: noCatalog ? "disabled" : "empty_fallback" };
  }

  const models = [...supported];
  if (!models.includes(input.currentModel)) {
    models.unshift(input.currentModel);
  }

  return { models, source: "available_workflows" };
}

export function supportedModelsFilterHint(
  source: SupportedModelsSource,
  visibleCount: number,
): string | null {
  switch (source) {
    case "available_workflows":
      return `Showing ${visibleCount} model${visibleCount === 1 ? "" : "s"} with a workflow in your library or assignment map.`;
    case "empty_fallback":
      return "No workflow-to-model matches found — showing all models.";
    case "override":
      return "Showing all models (manual override).";
    default:
      return null;
  }
}
