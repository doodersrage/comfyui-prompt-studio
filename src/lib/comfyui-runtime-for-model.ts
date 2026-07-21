"use client";

import type { ComfyImageModel } from "./comfy-models";
import { loadComfyWorkflowFiles } from "./comfyui-workflow-files";
import { loadSettingsCache } from "./settings-cache";
import {
  resolveWorkflowForModel,
  resolveWorkflowForModelSelection,
} from "./model-workflow-map";
import {
  resolveSelectedWorkflowRuntime,
  getSelectedWorkflowFileId,
} from "./comfyui-runtime";
import type { ComfyUiRuntimeConfig } from "./comfyui-config";
import { resolveQueueQualityProfile, normalizeQueueQualityProfile } from "./queue-quality-profile";
import { resolveModelForQueueTool } from "./queue-tool-model";

export function resolveRuntimeForModel(
  model: ComfyImageModel,
  tool?: string,
): ComfyUiRuntimeConfig {
  const shared = loadSettingsCache().shared;
  const workflowFiles = loadComfyWorkflowFiles();
  const workflowId =
    (shared.autoSelectWorkflowForModel !== false
      ? resolveWorkflowForModelSelection(model, {
          map: shared.modelWorkflowMap,
          workflowFiles,
          tool,
        })
      : resolveWorkflowForModel(model, shared.modelWorkflowMap)) ??
    getSelectedWorkflowFileId();
  const base = workflowId ? resolveSelectedWorkflowRuntime(workflowId) : undefined;
  return {
    ...(base ?? {}),
    directWorkflowPatching: shared.directWorkflowPatching !== false,
    workflowQueueOptimize: shared.workflowQueueOptimize !== false,
    workflowGraphEnrich: shared.workflowGraphEnrich !== false,
    workflowSdxlRefinerEnrich: shared.workflowSdxlRefinerEnrich !== false,
    workflowNeuralUpscalePolish: shared.workflowNeuralUpscalePolish !== false,
    workflowSharpenAfterUpscale: shared.workflowSharpenAfterUpscale !== false,
    queueTargetModel: model,
    queueQualityProfile: normalizeQueueQualityProfile(shared.queueQualityProfile),
    modelCheckpointMap: shared.modelCheckpointMap,
    modelVaeMap: shared.modelVaeMap,
    modelRefinerMap: shared.modelRefinerMap,
    modelUpscaleMap: shared.modelUpscaleMap,
  };
}

export function resolveRuntimeForQueue(
  model: ComfyImageModel,
  tool?: string,
): ComfyUiRuntimeConfig {
  const queueModel = resolveModelForQueueTool(model, tool);
  const base = resolveRuntimeForModel(queueModel, tool);
  const shared = loadSettingsCache().shared;
  return {
    ...base,
    queueQualityProfile: resolveQueueQualityProfile({
      tool,
      global: shared.queueQualityProfile,
      toolProfiles: shared.toolQueueQualityProfiles,
    }),
  };
}
