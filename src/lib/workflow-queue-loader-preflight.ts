"use client";

import { loadComfyUiSettings } from "./comfyui-settings";
import { loadSettingsCache } from "./settings-cache";
import { auditLoaderMapsAgainstComfyUi } from "./loader-map-health-audit";
import { fetchComfyObjectInfoModelsCached } from "./comfyui-object-info-cache";
import { resolveComfyUiRuntime } from "./comfyui-runtime";
import type { WorkflowPreflightIssue } from "./workflow-preflight";

import type { ComfyUiModelLists } from "./comfyui-object-info";
import type { WorkflowPreflightIssue } from "./workflow-preflight";

function filenameInList(filename: string, list: string[]): boolean {
  const trimmed = filename.trim();
  return Boolean(trimmed && list.length > 0 && list.includes(trimmed));
}

export function auditDualClipNodesInWorkflow(input: {
  workflowJson?: string;
  models: ComfyUiModelLists;
}): WorkflowPreflightIssue[] {
  if (!input.workflowJson?.trim() || input.models.clips.length === 0) {
    return [];
  }

  let workflow: Record<string, unknown>;
  try {
    workflow = JSON.parse(input.workflowJson) as Record<string, unknown>;
  } catch {
    return [];
  }

  const issues: WorkflowPreflightIssue[] = [];
  const allowedTypes = new Set(input.models.dualClipTypes);

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    if (record.class_type !== "DualCLIPLoader" || !record.inputs) {
      continue;
    }

    const clipType = typeof record.inputs.type === "string" ? record.inputs.type.trim() : "";
    if (
      clipType &&
      allowedTypes.size > 0 &&
      !allowedTypes.has(clipType)
    ) {
      issues.push({
        severity: "error",
        message:
          `DualCLIPLoader type “${clipType}” is not supported by your ComfyUI install — update ComfyUI or install Qwen Image nodes. Supported: ${[...allowedTypes].slice(0, 6).join(", ")}${allowedTypes.size > 6 ? "…" : ""}.`,
      });
    }

    for (const field of ["clip_name1", "clip_name2"] as const) {
      const filename =
        typeof record.inputs[field] === "string" ? record.inputs[field].trim() : "";
      if (filename && !filenameInList(filename, input.models.clips)) {
        issues.push({
          severity: "error",
          message: `DualCLIPLoader ${field} “${filename}” not found in ComfyUI — use Settings → Optimize all or map clip filenames to ${input.models.clips.slice(0, 3).join(", ")}${input.models.clips.length > 3 ? "…" : ""}.`,
        });
      }
    }
  }

  return issues;
}

export async function auditLoaderMapsAtQueueTime(input?: {
  model?: string;
  comfyUrl?: string;
  workflowJson?: string;
}): Promise<WorkflowPreflightIssue[]> {
  const models = await fetchComfyObjectInfoModelsCached({
    comfyUrl: input?.comfyUrl ?? resolveComfyUiRuntime()?.apiUrl,
  });
  if (!models) {
    return [];
  }

  const shared = loadSettingsCache().shared;
  const settings = loadComfyUiSettings();
  const model = input?.model?.trim();
  const checkpointMap = { ...settings.modelCheckpointMap, ...shared.modelCheckpointMap };
  const vaeMap = { ...settings.modelVaeMap, ...shared.modelVaeMap };
  const upscaleMap = { ...settings.modelUpscaleMap, ...shared.modelUpscaleMap };

  const scopedCheckpoint = model && checkpointMap[model]
    ? { [model]: checkpointMap[model]! }
    : checkpointMap;
  const scopedVae = model && vaeMap[model] ? { [model]: vaeMap[model]! } : vaeMap;
  const scopedUpscale = model && upscaleMap[model]
    ? { [model]: upscaleMap[model]!, ...(upscaleMap.default ? { default: upscaleMap.default } : {}) }
    : upscaleMap;

  return [
    ...auditLoaderMapsAgainstComfyUi({
      checkpointMap: scopedCheckpoint,
      vaeMap: scopedVae,
      upscaleMap: scopedUpscale,
      models,
    }).map((issue) => ({
      severity: issue.severity,
      message: issue.message,
    })),
    ...auditDualClipNodesInWorkflow({
      workflowJson: input?.workflowJson,
      models,
    }),
  ];
}
