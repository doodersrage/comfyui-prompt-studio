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
import { rankWorkflowFilesForModel } from "./workflow-category-defaults";
import {
  extractWorkflowStackFingerprint,
  workflowStackMatchesModel,
} from "./workflow-stack-fingerprint";

function resolveStackCompatibleWorkflowRuntime(
  model: ComfyImageModel,
  base: ComfyUiRuntimeConfig | undefined,
  workflowFiles: ReturnType<typeof loadComfyWorkflowFiles>,
): ComfyUiRuntimeConfig | undefined {
  if (!base?.workflowJson?.trim() || base.syncWorkflowLoadersToModel) {
    return base;
  }

  const fingerprint = extractWorkflowStackFingerprint(base.workflowJson);
  if (!fingerprint.isMixed && workflowStackMatchesModel(fingerprint, model)) {
    return base;
  }

  const ranked = rankWorkflowFilesForModel(model, workflowFiles);
  const replacement = ranked.find((entry) => {
    const candidate = extractWorkflowStackFingerprint(entry.file.workflowJson);
    return !candidate.isMixed && workflowStackMatchesModel(candidate, model);
  });
  if (!replacement) {
    return base;
  }

  const swapped = resolveSelectedWorkflowRuntime(replacement.file.id);
  if (!swapped?.workflowJson?.trim()) {
    return base;
  }

  return {
    ...base,
    ...swapped,
    workflowJson: swapped.workflowJson,
    workflowOptimizedHash: swapped.workflowOptimizedHash,
  };
}

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
  const stackCompatible = resolveStackCompatibleWorkflowRuntime(model, base, workflowFiles);
  return {
    ...(stackCompatible ?? {}),
    directWorkflowPatching: shared.directWorkflowPatching !== false,
    syncWorkflowLoadersToModel: shared.syncWorkflowLoadersToModel === true,
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
