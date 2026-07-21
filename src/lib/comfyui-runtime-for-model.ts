"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import {
  loadComfyWorkflowFiles,
  mergeCustomWorkflowTokens,
  collectLightningLoraTokenFromWorkflowLibrary,
} from "./comfyui-workflow-files";
import { syncLightningLoraLibraryEntry } from "./comfyui-settings";
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
        // Queue prep inserts Lightning LoRA when the token is mapped on this file.
        const hasLightningToken =
          Boolean(
            [...(base.customTokens ?? []), ...(base.workflowCustomTokens ?? [])].some(
              (entry) =>
                entry.token.trim() === "{{LORA_LIGHTNING}}" && entry.value.trim(),
            ),
          ) || base.workflowJson.includes("{{LORA_LIGHTNING}}");
        if (hasLightningToken) {
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
  options?: { ignoreManualWorkflow?: boolean },
): ComfyUiRuntimeConfig {
  const shared = loadSettingsCache().shared;
  const workflowFiles = loadComfyWorkflowFiles();
  const manualId = options?.ignoreManualWorkflow
    ? undefined
    : getSelectedWorkflowFileId();
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
  // Never stack-swap away from an explicit model→workflow map or the picker
  // selection — that dropped per-workflow {{LORA_LIGHTNING}} overrides.
  const trustExplicitWorkflow = Boolean(
    (mappedId?.trim() && workflowId === mappedId) ||
      (manualId?.trim() && workflowId === manualId),
  );
  const stackCompatible = trustExplicitWorkflow
    ? base
    : resolveStackCompatibleWorkflowRuntime(model, base, workflowFiles);

  let customTokens = stackCompatible?.customTokens;
  let workflowCustomTokens = stackCompatible?.workflowCustomTokens;
  if (isQwenLightningModel(model)) {
    const hasLightning = [...(customTokens ?? []), ...(workflowCustomTokens ?? [])].some(
      (entry) =>
        entry.token.trim() === "{{LORA_LIGHTNING}}" && entry.value.trim(),
    );
    if (!hasLightning) {
      const fallback = collectLightningLoraTokenFromWorkflowLibrary(model);
      if (fallback) {
        customTokens = mergeCustomWorkflowTokens(customTokens, [fallback]);
        workflowCustomTokens = mergeCustomWorkflowTokens(workflowCustomTokens, [
          fallback,
        ]);
        syncLightningLoraLibraryEntry(fallback.value);
      }
    }
  }

  return {
    ...(stackCompatible ?? {}),
    ...(customTokens?.length ? { customTokens } : {}),
    ...(workflowCustomTokens?.length ? { workflowCustomTokens } : {}),
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
  const remapped = queueModel !== model;
  // When Generate remaps Edit Lightning → 2512 Lightning, resolve the T2I
  // counterpart's mapped workflow — never keep the Edit graph from the picker.
  const base = resolveRuntimeForModel(queueModel, tool, {
    ignoreManualWorkflow: remapped,
  });
  const shared = loadSettingsCache().shared;
  const withProfile: ComfyUiRuntimeConfig = {
    ...base,
    queueQualityProfile: resolveQueueQualityProfile({
      tool,
      global: shared.queueQualityProfile,
      toolProfiles: shared.toolQueueQualityProfiles,
      model: queueModel,
    }),
  };

  if (!remapped) {
    return withProfile;
  }

  // Keep {{LORA_LIGHTNING}} (and other) overrides from the Edit workflow the user
  // already configured — the remapped 2512 file often has the placeholder but no
  // per-workflow token value, which false-fails preflight as "Unresolved".
  const source = resolveRuntimeForModel(model, tool);
  const customTokens = mergeCustomWorkflowTokens(
    source.customTokens,
    withProfile.customTokens,
  );
  const workflowCustomTokens = mergeCustomWorkflowTokens(
    source.workflowCustomTokens,
    withProfile.workflowCustomTokens,
  );

  return {
    ...withProfile,
    customTokens: customTokens.length > 0 ? customTokens : undefined,
    workflowCustomTokens:
      workflowCustomTokens.length > 0 ? workflowCustomTokens : undefined,
  };
}
