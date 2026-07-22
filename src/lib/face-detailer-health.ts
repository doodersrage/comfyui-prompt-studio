import { findLibraryFaceDetailerWorkflow } from "./workflow-library-face-detailer";
import { loadSettingsCache } from "./settings-cache";
import { loadComfyWorkflowFiles } from "./comfyui-workflow-files";

export type FaceDetailerHealthStatus = "ready" | "detected" | "missing";

export type FaceDetailerHealth = {
  status: FaceDetailerHealthStatus;
  label: string;
  workflowName?: string;
  pinnedId?: string;
};

/** Settings chip: Ready (pinned) / Detected (heuristic) / Missing. */
export function getFaceDetailerHealth(): FaceDetailerHealth {
  const shared = loadSettingsCache().shared;
  const pinnedId = shared.modelWorkflowMap?.faceDetailer?.trim();
  const files = loadComfyWorkflowFiles();
  const resolved = findLibraryFaceDetailerWorkflow();

  if (pinnedId) {
    const pinned = files.find((file) => file.id === pinnedId);
    if (pinned) {
      return {
        status: "ready",
        label: "Ready",
        workflowName: pinned.name,
        pinnedId,
      };
    }
    return {
      status: "missing",
      label: "Missing pin",
      pinnedId,
    };
  }

  if (resolved) {
    return {
      status: "detected",
      label: "Detected",
      workflowName: resolved.name,
    };
  }

  return {
    status: "missing",
    label: "Missing",
  };
}
