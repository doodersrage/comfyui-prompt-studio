"use client";

import { loadComfyUiSettings } from "./comfyui-settings";
import { loadSettingsCache } from "./settings-cache";
import { auditLoaderMapsAgainstComfyUi } from "./loader-map-health-audit";
import { fetchComfyObjectInfoModelsCached } from "./comfyui-object-info-cache";
import { resolveComfyUiRuntime } from "./comfyui-runtime";
import type { WorkflowPreflightIssue } from "./workflow-preflight";

export async function auditLoaderMapsAtQueueTime(input?: {
  model?: string;
  comfyUrl?: string;
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

  return auditLoaderMapsAgainstComfyUi({
    checkpointMap: scopedCheckpoint,
    vaeMap: scopedVae,
    upscaleMap: scopedUpscale,
    models,
  }).map((issue) => ({
    severity: issue.severity,
    message: issue.message,
  }));
}
