/**
 * Impact-Pack FaceDetailer auto-insert for gallery face-detail when no
 * library workflow is pinned.
 */

import {
  DEFAULT_FACE_DETAIL_DENOISE,
  FACE_DETAIL_DENOISE_TOKEN,
  FACE_DETAIL_IMAGE_TOKEN,
} from "./gallery-output-face-detail";

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export type FaceDetailerInsertOptions = {
  availableNodeTypes?: Iterable<string> | null;
};

export type FaceDetailerInsertResult = {
  workflow: Record<string, unknown>;
  inserted: boolean;
  reason?: string;
};

const FACE_DETAILER = "FaceDetailer";
const BBOX_DETECTOR = "UltralyticsDetectorProvider";

function toTypeSet(available?: Iterable<string> | null): Set<string> | undefined {
  if (!available) {
    return undefined;
  }
  return available instanceof Set ? available : new Set(available);
}

function nextNodeId(workflow: Record<string, unknown>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = Number(key);
    if (Number.isFinite(parsed) && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

export function canAutoInsertFaceDetailer(
  availableNodeTypes?: Iterable<string> | null,
): boolean {
  const available = toTypeSet(availableNodeTypes);
  if (!available) {
    return false;
  }
  return available.has(FACE_DETAILER);
}

/**
 * Build a minimal FaceDetailer graph when Impact Pack FaceDetailer is installed.
 * Uses {{FACE_DETAIL_IMAGE}} / {{FACE_DETAIL_DENOISE}} tokens.
 */
export function buildAutoFaceDetailerWorkflow(
  options?: FaceDetailerInsertOptions,
): FaceDetailerInsertResult {
  const available = toTypeSet(options?.availableNodeTypes);
  if (!available || !available.has(FACE_DETAILER)) {
    return {
      workflow: {},
      inserted: false,
      reason: "FaceDetailer node not installed in ComfyUI.",
    };
  }

  const workflow: Record<string, WorkflowNode> = {};
  const loadId = "1";
  workflow[loadId] = {
    class_type: "LoadImage",
    inputs: { image: FACE_DETAIL_IMAGE_TOKEN },
    _meta: { title: "Prompt Studio — face detail source" },
  };

  let imageLink: [string, number] = [loadId, 0];
  let nextId = 2;

  if (!available || available.has(BBOX_DETECTOR)) {
    const bboxId = String(nextId++);
    workflow[bboxId] = {
      class_type: BBOX_DETECTOR,
      inputs: { model_name: "bbox/face_yolov8m.pt" },
      _meta: { title: "Prompt Studio — face bbox detector" },
    };
    const detailId = String(nextId++);
    workflow[detailId] = {
      class_type: FACE_DETAILER,
      inputs: {
        image: imageLink,
        bbox_detector: [bboxId, 0],
        denoise: FACE_DETAIL_DENOISE_TOKEN,
        guide_size: 512,
        guide_size_for: true,
        max_size: 1024,
        seed: 0,
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        force_inpaint: true,
      },
      _meta: { title: "Prompt Studio — FaceDetailer" },
    };
    imageLink = [detailId, 0];
  } else {
    const detailId = String(nextId++);
    workflow[detailId] = {
      class_type: FACE_DETAILER,
      inputs: {
        image: imageLink,
        denoise: FACE_DETAIL_DENOISE_TOKEN,
        guide_size: 512,
        max_size: 1024,
        seed: 0,
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        force_inpaint: true,
      },
      _meta: { title: "Prompt Studio — FaceDetailer" },
    };
    imageLink = [detailId, 0];
  }

  const saveId = String(nextId);
  workflow[saveId] = {
    class_type: "SaveImage",
    inputs: {
      filename_prefix: "PromptStudio-face-detail",
      images: imageLink,
    },
    _meta: { title: "Prompt Studio — face detail save" },
  };

  return { workflow, inserted: true };
}

export { DEFAULT_FACE_DETAIL_DENOISE };
