"use client";

import type { ComfyImageModel } from "./comfy-models/client";
import {
  loadComfyWorkflowFiles,
  mergeCustomWorkflowTokens,
  collectLightningLoraTokenFromWorkflowLibrary,
} from "./comfyui-workflow-files";
import { syncLightningLoraLibraryEntry } from "./comfyui-settings";
import {
  loadSettingsCache,
  saveSharedSettings,
} from "./settings-cache";
import type { ComfyUiModelLists } from "./comfyui-object-info";
import {
  fetchComfyObjectInfoCached,
  readCachedComfyObjectInfoModels,
} from "./comfyui-object-info-cache";
import {
  loaderMapsChanged,
  syncLoaderMapsFromInventory,
} from "./loader-map-inventory-sync";
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
import { applySystemWorkflowToRuntime } from "./system-workflow-runtime";

export type ResolveRuntimeOptions = {
  ignoreManualWorkflow?: boolean;
  /** Live ComfyUI inventory — when set, system scaffolds/maps adapt to it. */
  inventory?: ComfyUiModelLists | null;
};

/**
 * Scan ComfyUI inventory and persist healed loader maps when system workflows
 * are enabled. Returns the models list (or null if unreachable).
 */
export async function scanAndAdaptSystemWorkflowInventory(input?: {
  comfyUrl?: string;
  persist?: boolean;
}): Promise<ComfyUiModelLists | null> {
  const payload = await fetchComfyObjectInfoCached({
    comfyUrl: input?.comfyUrl,
  });
  const models = payload?.models ?? null;
  if (!models) {
    return null;
  }

  const shared = loadSettingsCache().shared;
  if (shared.useSystemWorkflows !== true) {
    return models;
  }

  const synced = syncLoaderMapsFromInventory({
    models,
    checkpointMap: shared.modelCheckpointMap,
    vaeMap: shared.modelVaeMap,
    upscaleMap: shared.modelUpscaleMap,
    controlNetMap: shared.modelControlNetMap,
    healMissing: true,
  });

  if (
    input?.persist !== false &&
    loaderMapsChanged(
      {
        checkpointMap: shared.modelCheckpointMap,
        vaeMap: shared.modelVaeMap,
        upscaleMap: shared.modelUpscaleMap,
        controlNetMap: shared.modelControlNetMap,
      },
      synced,
    )
  ) {
    saveSharedSettings({
      ...shared,
      modelCheckpointMap: synced.modelCheckpointMap,
      modelVaeMap: synced.modelVaeMap,
      modelUpscaleMap: synced.modelUpscaleMap,
      modelControlNetMap: synced.modelControlNetMap,
    });
  }

  return models;
}
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
    workflowOptimizedModel: swapped.workflowOptimizedModel,
    workflowOptimizedProfile: swapped.workflowOptimizedProfile,
  };
}

function attachLightningTokens(
  model: ComfyImageModel,
  customTokens: ComfyUiRuntimeConfig["customTokens"],
  workflowCustomTokens: ComfyUiRuntimeConfig["workflowCustomTokens"],
): {
  customTokens: ComfyUiRuntimeConfig["customTokens"];
  workflowCustomTokens: ComfyUiRuntimeConfig["workflowCustomTokens"];
} {
  if (!isQwenLightningModel(model)) {
    return { customTokens, workflowCustomTokens };
  }
  const hasLightning = [...(customTokens ?? []), ...(workflowCustomTokens ?? [])].some(
    (entry) =>
      entry.token.trim() === "{{LORA_LIGHTNING}}" && entry.value.trim(),
  );
  if (hasLightning) {
    return { customTokens, workflowCustomTokens };
  }
  const fallback = collectLightningLoraTokenFromWorkflowLibrary(model);
  if (!fallback) {
    return { customTokens, workflowCustomTokens };
  }
  syncLightningLoraLibraryEntry(fallback.value);
  return {
    customTokens: mergeCustomWorkflowTokens(customTokens, [fallback]),
    workflowCustomTokens: mergeCustomWorkflowTokens(workflowCustomTokens, [
      fallback,
    ]),
  };
}

function sharedQueueFlags(
  shared: ReturnType<typeof loadSettingsCache>["shared"],
  model: ComfyImageModel,
  overrides?: Partial<ComfyUiRuntimeConfig>,
): ComfyUiRuntimeConfig {
  const profile = normalizeQueueQualityProfile(shared.queueQualityProfile);
  const isMax = profile === "max";
  return {
    directWorkflowPatching: shared.directWorkflowPatching !== false,
    syncWorkflowLoadersToModel: shared.syncWorkflowLoadersToModel === true,
    workflowQueueOptimize: shared.workflowQueueOptimize !== false,
    workflowGraphEnrich: shared.workflowGraphEnrich !== false,
    workflowSdxlRefinerEnrich: shared.workflowSdxlRefinerEnrich !== false,
    workflowNeuralUpscalePolish:
      isMax || shared.workflowNeuralUpscalePolish !== false,
    workflowSharpenAfterUpscale: isMax
      ? shared.workflowSharpenAfterUpscale !== false
      : shared.workflowSharpenAfterUpscale === true,
    compactDraftSaves: shared.compactDraftSaves !== false,
    queueTargetModel: model,
    queueQualityProfile: profile,
    modelCheckpointMap: shared.modelCheckpointMap,
    modelVaeMap: shared.modelVaeMap,
    modelRefinerMap: shared.modelRefinerMap,
    modelUpscaleMap: shared.modelUpscaleMap,
    ...overrides,
  };
}

export function resolveRuntimeForModel(
  model: ComfyImageModel,
  tool?: string,
  options?: ResolveRuntimeOptions,
): ComfyUiRuntimeConfig {
  const shared = loadSettingsCache().shared;
  const inventory =
    options?.inventory !== undefined
      ? options.inventory
      : readCachedComfyObjectInfoModels();

  // Best-effort system workflows: prefer a scored pack graph from the library,
  // else built-in scaffold. Inventory fills/heals loader maps; family presets seed params.
  if (shared.useSystemWorkflows === true) {
    const workflowFiles = loadComfyWorkflowFiles();
    const base = applySystemWorkflowToRuntime(
      model,
      shared,
      workflowFiles,
      sharedQueueFlags(shared, model),
      inventory,
      { tool },
    );
    const lightning = attachLightningTokens(
      model,
      base.customTokens,
      base.workflowCustomTokens,
    );
    return {
      ...base,
      ...(lightning.customTokens?.length
        ? { customTokens: lightning.customTokens }
        : {}),
      ...(lightning.workflowCustomTokens?.length
        ? { workflowCustomTokens: lightning.workflowCustomTokens }
        : {}),
    };
  }

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

  const lightning = attachLightningTokens(
    model,
    stackCompatible?.customTokens,
    stackCompatible?.workflowCustomTokens,
  );

  return {
    ...(stackCompatible ?? {}),
    ...sharedQueueFlags(shared, model, {
      ...(lightning.customTokens?.length
        ? { customTokens: lightning.customTokens }
        : {}),
      ...(lightning.workflowCustomTokens?.length
        ? { workflowCustomTokens: lightning.workflowCustomTokens }
        : {}),
    }),
  };
}

export function resolveRuntimeForQueue(
  model: ComfyImageModel,
  tool?: string,
  options?: ResolveRuntimeOptions,
): ComfyUiRuntimeConfig {
  const queueModel = resolveModelForQueueTool(model, tool);
  const remapped = queueModel !== model;
  // When Generate remaps Edit Lightning → 2512 Lightning, resolve the T2I
  // counterpart's mapped workflow — never keep the Edit graph from the picker.
  const base = resolveRuntimeForModel(queueModel, tool, {
    ...options,
    ignoreManualWorkflow: remapped || options?.ignoreManualWorkflow,
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
  const source = resolveRuntimeForModel(model, tool, options);
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

/**
 * Queue resolve that scans ComfyUI inventory first when system workflows are on,
 * so scaffolds and loader maps match installed files before preflight/queue.
 */
export async function resolveRuntimeForQueueAsync(
  model: ComfyImageModel,
  tool?: string,
  options?: ResolveRuntimeOptions & { comfyUrl?: string },
): Promise<ComfyUiRuntimeConfig> {
  const shared = loadSettingsCache().shared;
  let inventory = options?.inventory;
  if (shared.useSystemWorkflows === true && inventory === undefined) {
    inventory = await scanAndAdaptSystemWorkflowInventory({
      comfyUrl: options?.comfyUrl,
      persist: true,
    });
  }
  return resolveRuntimeForQueue(model, tool, {
    ...options,
    inventory: inventory ?? readCachedComfyObjectInfoModels(),
  });
}
