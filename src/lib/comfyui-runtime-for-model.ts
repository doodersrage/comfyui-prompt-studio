"use client";

import type { ComfyImageModel } from "./comfy-models/client";
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
import { isQwenLightningModel } from "./model-sampling-patch";
import { workflowHasLoraLoader } from "./workflow-lightning-queue";

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
    if (isQwenLightningModel(model)) {
      try {
        const parsed = JSON.parse(base.workflowJson) as Record<string, unknown>;
        if (workflowHasLoraLoader(parsed)) {
          return base;
        }
      } catch {
        return base;
      }
    } else {
      return base;
    }
  }

  const ranked = rankWorkflowFilesForModel(model, workflowFiles);
  const replacement = ranked.find((entry) => {
    try {
      const candidate = extractWorkflowStackFingerprint(entry.file.workflowJson);
      if (candidate.isMixed || !workflowStackMatchesModel(candidate, model)) {
        return false;
      }
      if (isQwenLightningModel(model)) {
        const parsed = JSON.parse(entry.file.workflowJson) as Record<string, unknown>;
        return workflowHasLoraLoader(parsed);
      }
      return true;
    } catch {
      return false;
    }
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
  const manualId = getSelectedWorkflowFileId();
  const mappedId = resolveWorkflowForModel(model, shared.modelWorkflowMap);
  const autoId =
    shared.autoSelectWorkflowForModel !== false
      ? resolveWorkflowForModelSelection(model, {
          map: shared.modelWorkflowMap,
          workflowFiles,
          tool,
        })
      : undefined;
  // Explicit map assignment, then the workflow picker selection, then auto-ranked default.
  const workflowId = mappedId ?? manualId ?? autoId;
  const base = workflowId ? resolveSelectedWorkflowRuntime(workflowId) : undefined;
  const trustManualSelection = Boolean(manualId?.trim() && workflowId === manualId);
  const stackCompatible = trustManualSelection
    ? base
    : resolveStackCompatibleWorkflowRuntime(model, base, workflowFiles);
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
