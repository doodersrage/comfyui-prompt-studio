"use client";

import { loadComfyUiSettings, mergeLoraLibraryIntoCustomTokens } from "./comfyui-settings";
import { loadSettingsCache } from "./settings-cache";
import { auditLoaderMapsAgainstComfyUi } from "./loader-map-health-audit";
import { fetchComfyObjectInfoModelsCached } from "./comfyui-object-info-cache";
import { resolveComfyUiRuntime } from "./comfyui-runtime";
import type { ComfyUiModelLists } from "./comfyui-object-info";
import { auditLoaderFilenamesInWorkflow } from "./workflow-loader-filename-audit";
import type { WorkflowPreflightIssue } from "./workflow-preflight";
import { auditDualClipNodesInWorkflow } from "./workflow-dual-clip-audit";

export { auditDualClipNodesInWorkflow };

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
  const settings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings());
  const model = input?.model?.trim();
  const checkpointMap = { ...(shared.modelCheckpointMap ?? {}) };
  const vaeMap = { ...(shared.modelVaeMap ?? {}) };
  const upscaleMap = { ...(shared.modelUpscaleMap ?? {}) };

  const scopedCheckpoint = model && checkpointMap[model]
    ? { [model]: checkpointMap[model]! }
    : checkpointMap;
  const scopedVae = model && vaeMap[model] ? { [model]: vaeMap[model]! } : vaeMap;
  const scopedUpscale = model && upscaleMap[model]
    ? { [model]: upscaleMap[model]!, ...(upscaleMap.default ? { default: upscaleMap.default } : {}) }
    : upscaleMap;

  const controlNetMap = { ...(shared.modelControlNetMap ?? {}) };
  const scopedControlNet =
    model && controlNetMap[model]
      ? { [model]: controlNetMap[model]!, ...(controlNetMap.default ? { default: controlNetMap.default } : {}) }
      : controlNetMap;

  return [
    ...auditLoaderMapsAgainstComfyUi({
      checkpointMap: scopedCheckpoint,
      vaeMap: scopedVae,
      upscaleMap: scopedUpscale,
      controlNetMap: scopedControlNet,
      customTokens: settings.customTokens,
      models,
    }).map((issue) => ({
      severity: issue.severity,
      message: issue.message,
    })),
    ...auditDualClipNodesInWorkflow({
      workflowJson: input?.workflowJson,
      models,
    }),
    ...auditLoaderFilenamesInWorkflow({
      workflowJson: input?.workflowJson,
      models,
    }).map((issue) => ({
      severity: issue.severity,
      message: issue.message,
    })),
  ];
}
