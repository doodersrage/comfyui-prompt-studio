import { loadComfyWorkflowFiles, type ComfyWorkflowFile } from "./comfyui-workflow-files";
import { resolveWorkflowForModelSelection } from "./model-workflow-map";
import { loadSettingsCache } from "./settings-cache";

function workflowLooksLikeUpscalePipeline(workflowJson: string): boolean {
  try {
    const nodes = Object.values(JSON.parse(workflowJson) as Record<string, { class_type?: string }>);
    const classTypes = new Set(nodes.map((node) => node.class_type ?? ""));
    return (
      classTypes.has("LoadImage") &&
      classTypes.has("SaveImage") &&
      (classTypes.has("ImageScaleBy") ||
        classTypes.has("ImageUpscaleWithModel") ||
        classTypes.has("UpscaleModelLoader"))
    );
  } catch {
    return false;
  }
}

export function findLibraryUpscaleWorkflowForModel(
  model: string,
): ComfyWorkflowFile | undefined {
  const files = loadComfyWorkflowFiles();
  const shared = loadSettingsCache().shared;
  const mappedId = resolveWorkflowForModelSelection(model, {
    map: shared.modelWorkflowMap,
    workflowFiles: files,
  });
  if (mappedId) {
    const mapped = files.find((file) => file.id === mappedId);
    if (mapped && workflowLooksLikeUpscalePipeline(mapped.workflowJson)) {
      return mapped;
    }
  }

  const haystackMatch = files.find(
    (file) =>
      /upscale/i.test(`${file.name} ${file.filename ?? ""}`) &&
      workflowLooksLikeUpscalePipeline(file.workflowJson),
  );
  if (haystackMatch) {
    return haystackMatch;
  }

  return files.find((file) => workflowLooksLikeUpscalePipeline(file.workflowJson));
}
