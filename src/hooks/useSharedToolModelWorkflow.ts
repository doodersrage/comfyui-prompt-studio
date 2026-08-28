'use client';

import type { DiffusersCheckpointOption } from '@/components/DiffusersCheckpointSelector';
import { useComfyWorkflowSelection } from '@/hooks/useComfyWorkflowSelection';
import {
  getComfyModelDefinition,
  COMFY_IMAGE_MODELS,
  type ComfyImageModel,
} from '@/lib/comfy-models/client';
import {
  modelsSupportedByAvailableWorkflows,
  resolveWorkflowForModelSelection,
  suggestWorkflowMapForFiles,
  supportedModelsFilterHint,
} from '@/lib/model-workflow-map';
import {
  filterModelsForQueueTool,
  isSceneGenerationModel,
  resolvePreferredImg2imgModel,
  shouldUseSceneGenerationModel,
  toolIgnoresSystemWorkflowSnap,
} from '@/lib/queue-tool-model';
import {
  isComposeCapableModel,
  isEditCapableModel,
  isImg2imgCapableModel,
} from '@/lib/model-denoise-defaults';
import type { ModelSamplerPresetTier } from '@/lib/model-sampler-defaults';
import type { ResolutionSizeTier } from '@/lib/model-resolution-defaults';
import {
  formatQueueQualityProfileHint,
  type QueueQualityProfile,
} from '@/lib/queue-quality-profile';
import type { SharedToolSettings } from '@/lib/settings-cache';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';
import {
  describeSystemWorkflowChoice,
  isSystemWorkflowSupportedModel,
  listSystemWorkflowSupportedModels,
  resolveSystemWorkflowFallbackModel,
  shouldLimitSystemWorkflowPicker,
  usesSystemWorkflowPath,
} from '@/lib/system-workflow-runtime';
import { readCachedComfyObjectInfoModels } from '@/lib/comfyui-object-info-cache';
import { scanAndAdaptSystemWorkflowInventory } from '@/lib/comfyui-runtime-for-model';
import type { ComfyWorkflowFile } from '@/lib/comfyui-workflow-files';
import { loadComfyWorkflowFiles } from '@/lib/comfyui-workflow-files';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { isBrowserStorageReady, whenBrowserStorageReady } from '@/lib/browser-storage';
import { resolveModelStackFamily } from '@/lib/workflow-stack-fingerprint';
import { isQwenLightningModel } from '@/lib/model-sampling-patch';
import {
  resolveEffectiveSessionLoraStrengthOverrides,
  resolveLoraIdsForModelSelection,
} from '@/lib/model-lora-map';
import type { SessionLoraStrengthOverrides } from '@/lib/lora-stack';
import {
  DIFFUSERS_DEFAULT_MODEL,
  resolveStudioModelForDiffusersAsset,
} from '@/lib/diffusers-defaults';
import { SUGGESTED_MODEL_CHECKPOINT_MAP } from '@/lib/model-checkpoint-map';
import { isCloudEngine } from '@/lib/engine/capabilities';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

export type UseSharedToolModelWorkflowOptions = {
  shared: SharedToolSettings;
  toolId?: string;
  preferEditModels?: boolean;
  queueQualityProfile: QueueQualityProfile;
  samplerPreset: ModelSamplerPresetTier;
  resolutionSizeTier: ResolutionSizeTier;
  onModelChange: (model: SharedToolSettings['model']) => void;
  onWorkflowPresetChange?: (fileId: string | undefined) => void;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
  setSessionActiveLoraIds: Dispatch<SetStateAction<string[] | undefined>>;
  setSessionLoraStrengthOverrides: Dispatch<SetStateAction<SessionLoraStrengthOverrides>>;
};

export type UseSharedToolModelWorkflowResult = {
  storageReady: boolean;
  workflowSelection: ReturnType<typeof useComfyWorkflowSelection>;
  workflowCatalog: Array<
    ComfyWorkflowFile | { id: string; name: string; filename: string; workflowJson: string }
  >;
  suggestedWorkflowMap: ReturnType<typeof suggestWorkflowMapForFiles>;
  selectedWorkflowId: string | undefined;
  mappedWorkflowForModel: string | undefined;
  selectedWorkflowJson: string | null;
  supportedModels: ReturnType<typeof modelsSupportedByAvailableWorkflows>;
  pickerModels: ComfyImageModel[];
  showAllModelsOverride: boolean;
  handleModelChange: (model: ComfyImageModel) => void;
  handleDiffusersAssetChange: (asset: DiffusersCheckpointOption) => void;
  diffusersSelectedAssetId: string;
  handleShowAllModels: () => void;
  systemWorkflowChoice: ReturnType<typeof describeSystemWorkflowChoice> | null;
  systemQualityHint: string | null;
  systemPathActive: boolean;
  cloudEngine: boolean;
  categoryLocked: boolean;
  modelFilterHint: string | null;
  workflowManualOverrideRef: MutableRefObject<boolean>;
};

export function useSharedToolModelWorkflow({
  shared,
  toolId,
  preferEditModels = false,
  queueQualityProfile,
  samplerPreset,
  resolutionSizeTier,
  onModelChange,
  onWorkflowPresetChange,
  onSharedSettingsChange,
  setSessionActiveLoraIds,
  setSessionLoraStrengthOverrides,
}: UseSharedToolModelWorkflowOptions): UseSharedToolModelWorkflowResult {
  const workflowSelection = useComfyWorkflowSelection();
  const [storageReady, setStorageReady] = useState(() => isBrowserStorageReady());
  const [showAllModelsOverride, setShowAllModelsOverride] = useState(
    () => shared.showAllModelsOverride === true
  );
  const [inventoryTick, setInventoryTick] = useState(0);

  useEffect(() => {
    if (storageReady) {
      return;
    }
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (!cancelled) {
        setStorageReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageReady]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setShowAllModelsOverride(shared.showAllModelsOverride === true);
    });
  }, [shared.showAllModelsOverride]);

  const workflowCatalog = useMemo(
    () => [
      ...workflowSelection.localFiles,
      ...workflowSelection.serverFiles.map(entry => ({
        id: entry.id,
        name: entry.name,
        filename: `${entry.name}.json`,
        workflowJson: '',
      })),
    ],
    [workflowSelection.localFiles, workflowSelection.serverFiles]
  );

  const suggestedWorkflowMap = useMemo(
    () => suggestWorkflowMapForFiles(workflowCatalog),
    [workflowCatalog]
  );

  const selectedWorkflowId =
    shared.selectedWorkflowFileId ??
    shared.selectedWorkflowPresetId ??
    workflowSelection.selectedId;

  const mappedWorkflowForModel = useMemo(
    () =>
      resolveWorkflowForModelSelection(shared.model, {
        map: shared.modelWorkflowMap,
        suggestedMap: suggestedWorkflowMap,
        workflowFiles: workflowCatalog,
        tool: toolId,
      }),
    [shared.model, shared.modelWorkflowMap, suggestedWorkflowMap, toolId, workflowCatalog]
  );

  const selectedWorkflowJson = useMemo(() => {
    const id =
      shared.selectedWorkflowFileId ??
      shared.selectedWorkflowPresetId ??
      workflowSelection.selectedId;
    if (!id) {
      return null;
    }
    return workflowCatalog.find(entry => entry.id === id)?.workflowJson ?? null;
  }, [
    shared.selectedWorkflowFileId,
    shared.selectedWorkflowPresetId,
    workflowCatalog,
    workflowSelection.selectedId,
  ]);

  const supportedModels = useMemo(
    () =>
      modelsSupportedByAvailableWorkflows({
        map: shared.modelWorkflowMap,
        workflowFiles: workflowCatalog,
        suggestedMap: suggestedWorkflowMap,
        currentModel: shared.model,
        limitEnabled:
          shared.useSystemWorkflows === true
            ? false
            : shared.limitModelsToAvailableWorkflows !== false,
        showAllOverride: showAllModelsOverride,
      }),
    [
      shared.model,
      shared.modelWorkflowMap,
      shared.limitModelsToAvailableWorkflows,
      shared.useSystemWorkflows,
      showAllModelsOverride,
      suggestedWorkflowMap,
      workflowCatalog,
    ]
  );

  const scaffoldBackedModels = useMemo(
    () =>
      COMFY_IMAGE_MODELS.filter(
        entry =>
          isSystemWorkflowSupportedModel(entry.id) &&
          (isComposeCapableModel(entry.id) || isEditCapableModel(entry.id))
      ).map(entry => entry.id),
    []
  );

  const pickerModels = useMemo(() => {
    const supportedCatalog = [...new Set([...supportedModels.models, ...scaffoldBackedModels])];
    const filtered = filterModelsForQueueTool(supportedCatalog, toolId, {
      includeEditModels: showAllModelsOverride,
      preferEditModels,
    });
    const base =
      filtered.length > 0
        ? filtered
        : preferEditModels
          ? COMFY_IMAGE_MODELS.filter(entry => isImg2imgCapableModel(entry.id)).map(
              entry => entry.id
            )
          : toolId && shouldUseSceneGenerationModel(toolId)
            ? COMFY_IMAGE_MODELS.filter(entry => isSceneGenerationModel(entry.id)).map(
                entry => entry.id
              )
            : supportedModels.models;

    if (
      !shouldLimitSystemWorkflowPicker(shared) ||
      showAllModelsOverride ||
      toolIgnoresSystemWorkflowSnap(toolId)
    ) {
      return base.length > 0 ? base : supportedModels.models;
    }

    const systemOnly = base.filter(model => isSystemWorkflowSupportedModel(model));
    if (systemOnly.length > 0) {
      return systemOnly;
    }
    return listSystemWorkflowSupportedModels().filter(model =>
      filterModelsForQueueTool([model], toolId, {
        includeEditModels: showAllModelsOverride,
        preferEditModels,
      }).includes(model)
    );
  }, [
    preferEditModels,
    showAllModelsOverride,
    scaffoldBackedModels,
    shared.systemWorkflowsLimitPicker,
    shared.useSystemWorkflows,
    supportedModels.models,
    toolId,
  ]);

  const onWorkflowPresetChangeRef = useRef(onWorkflowPresetChange);
  const setWorkflowSelectedIdRef = useRef(workflowSelection.setSelectedId);
  const workflowManualOverrideRef = useRef(false);
  const lastModelStackFamilyRef = useRef(resolveModelStackFamily(shared.model));

  useEffect(() => {
    onWorkflowPresetChangeRef.current = onWorkflowPresetChange;
  }, [onWorkflowPresetChange]);

  useEffect(() => {
    setWorkflowSelectedIdRef.current = workflowSelection.setSelectedId;
  }, [workflowSelection.setSelectedId]);

  const applyWorkflowForModel = useCallback(
    (model: ComfyImageModel, force = false) => {
      if (
        !force &&
        (shared.autoSelectWorkflowForModel === false || !onWorkflowPresetChangeRef.current)
      ) {
        return;
      }
      if (force) {
        workflowManualOverrideRef.current = false;
      }
      const workflowId = resolveWorkflowForModelSelection(model, {
        map: shared.modelWorkflowMap,
        suggestedMap: suggestedWorkflowMap,
        workflowFiles: workflowCatalog,
        tool: toolId,
      });
      if (!workflowId) {
        return;
      }

      const mappedId = shared.modelWorkflowMap?.[model]?.trim();
      if (mappedId && mappedId !== workflowId && isQwenLightningModel(model)) {
        saveSharedSettings(
          {
            ...loadSettingsCache().shared,
            modelWorkflowMap: {
              ...shared.modelWorkflowMap,
              [model]: workflowId,
            },
          },
          { notify: false }
        );
      }

      if (workflowId === selectedWorkflowId) {
        return;
      }
      const onChange = onWorkflowPresetChangeRef.current;
      if (!onChange) {
        return;
      }
      setWorkflowSelectedIdRef.current(workflowId);
      onChange(workflowId);
    },
    [
      selectedWorkflowId,
      shared.autoSelectWorkflowForModel,
      shared.modelWorkflowMap,
      suggestedWorkflowMap,
      toolId,
      workflowCatalog,
    ]
  );

  const handleModelChange = useCallback(
    (model: ComfyImageModel) => {
      const nextStackFamily = resolveModelStackFamily(model);
      const stackFamilyChanged =
        lastModelStackFamilyRef.current !== 'unknown' &&
        nextStackFamily !== 'unknown' &&
        lastModelStackFamilyRef.current !== nextStackFamily;
      if (stackFamilyChanged) {
        workflowManualOverrideRef.current = false;
      }
      lastModelStackFamilyRef.current = nextStackFamily;

      if (showAllModelsOverride) {
        setShowAllModelsOverride(false);
        saveSharedSettings(
          {
            ...loadSettingsCache().shared,
            showAllModelsOverride: false,
          },
          { notify: false }
        );
      }
      onModelChange(model);
      applyWorkflowForModel(model, stackFamilyChanged);

      const sharedNow = loadSettingsCache().shared;
      const nextStrengthOverrides = resolveEffectiveSessionLoraStrengthOverrides(
        model,
        sharedNow.sessionLoraStrengthOverrides,
        sharedNow.sessionLoraStrengthOverridesByModel
      );
      setSessionLoraStrengthOverrides(nextStrengthOverrides);
      if (sharedNow.autoSelectLorasForModel !== false) {
        const nextIds = resolveLoraIdsForModelSelection(model, {
          sessionActiveLoraIdsByModel: sharedNow.sessionActiveLoraIdsByModel,
          modelLoraMap: sharedNow.modelLoraMap,
        });
        setSessionActiveLoraIds(nextIds);
        saveSharedSettings(
          {
            ...loadSettingsCache().shared,
            sessionActiveLoraIds: nextIds,
            sessionLoraStrengthOverrides: nextStrengthOverrides,
          },
          { notify: false }
        );
        onSharedSettingsChange?.({
          sessionActiveLoraIds: nextIds,
          sessionLoraStrengthOverrides: nextStrengthOverrides,
        });
      } else {
        saveSharedSettings(
          {
            ...loadSettingsCache().shared,
            sessionLoraStrengthOverrides: nextStrengthOverrides,
          },
          { notify: false }
        );
        onSharedSettingsChange?.({ sessionLoraStrengthOverrides: nextStrengthOverrides });
      }
    },
    [
      applyWorkflowForModel,
      onModelChange,
      onSharedSettingsChange,
      setSessionActiveLoraIds,
      setSessionLoraStrengthOverrides,
      showAllModelsOverride,
    ]
  );

  const handleDiffusersAssetChange = useCallback(
    (asset: DiffusersCheckpointOption) => {
      const studioModel = (asset.studioModelId?.trim() ||
        resolveStudioModelForDiffusersAsset(
          asset.weightId || asset.id,
          asset.family
        )) as ComfyImageModel;
      const weightId = (asset.weightId || asset.id).trim();
      const sharedNow = loadSettingsCache().shared;
      const nextMap = {
        ...sharedNow.modelCheckpointMap,
        [studioModel]: weightId,
      };
      saveSharedSettings(
        {
          ...sharedNow,
          model: studioModel,
          modelCheckpointMap: nextMap,
        },
        { notify: false }
      );
      onSharedSettingsChange?.({
        model: studioModel,
        modelCheckpointMap: nextMap,
      });
      handleModelChange(studioModel);
    },
    [handleModelChange, onSharedSettingsChange]
  );

  const diffusersSelectedAssetId = useMemo(() => {
    const model = String(shared.model ?? '').trim();
    if (/lightning/i.test(model) && !/\.(safetensors|ckpt|pt|bin)$/i.test(model)) {
      return model;
    }
    if (/\.(safetensors|ckpt|pt|bin)$/i.test(model)) {
      return model;
    }
    return (
      shared.modelCheckpointMap?.[model]?.trim() ||
      SUGGESTED_MODEL_CHECKPOINT_MAP[model]?.trim() ||
      DIFFUSERS_DEFAULT_MODEL
    );
  }, [shared.model, shared.modelCheckpointMap]);

  const handleShowAllModels = useCallback(() => {
    setShowAllModelsOverride(true);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        showAllModelsOverride: true,
      },
      { notify: false }
    );
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    if (
      !shouldLimitSystemWorkflowPicker(shared) ||
      showAllModelsOverride ||
      toolIgnoresSystemWorkflowSnap(toolId)
    ) {
      return;
    }
    if (isSystemWorkflowSupportedModel(shared.model)) {
      return;
    }
    const fallback =
      pickerModels.find(model => isSystemWorkflowSupportedModel(model)) ??
      resolveSystemWorkflowFallbackModel(shared.model);
    if (fallback !== shared.model) {
      onModelChange(fallback);
    }
  }, [
    onModelChange,
    pickerModels,
    shared.model,
    shared.systemWorkflowsLimitPicker,
    shared.useSystemWorkflows,
    showAllModelsOverride,
    storageReady,
    toolId,
  ]);

  useEffect(() => {
    if (!storageReady || !preferEditModels || showAllModelsOverride) {
      return;
    }
    if (pickerModels.length === 0) {
      return;
    }
    if (pickerModels.includes(shared.model)) {
      return;
    }
    const fallback = resolvePreferredImg2imgModel({
      current: shared.model,
      allowed: pickerModels,
    });
    if (fallback !== shared.model) {
      onModelChange(fallback);
    }
  }, [
    onModelChange,
    pickerModels,
    preferEditModels,
    shared.model,
    showAllModelsOverride,
    storageReady,
  ]);

  useEffect(() => {
    if (!storageReady || showAllModelsOverride || preferEditModels) {
      return;
    }
    if (
      toolId !== 'video' &&
      toolId !== 'inpaint' &&
      toolId !== 'outpaint' &&
      toolId !== 'compose'
    ) {
      return;
    }
    if (pickerModels.length === 0 || pickerModels.includes(shared.model)) {
      return;
    }
    const fallback = pickerModels[0];
    if (fallback && fallback !== shared.model) {
      onModelChange(fallback);
    }
  }, [
    onModelChange,
    pickerModels,
    preferEditModels,
    shared.model,
    showAllModelsOverride,
    storageReady,
    toolId,
  ]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    if (shared.useSystemWorkflows !== true) {
      return;
    }
    let cancelled = false;
    const runScan = () => {
      void scanAndAdaptSystemWorkflowInventory({ persist: true }).then(models => {
        if (!cancelled && models) {
          setInventoryTick(value => value + 1);
        }
      });
    };
    let cancelIdle: (() => void) | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(runScan, { timeout: 4000 });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(runScan, 500);
      cancelIdle = () => window.clearTimeout(id);
    }
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [shared.useSystemWorkflows, shared.model, storageReady]);

  const videoInitKey =
    toolId === 'video'
      ? (loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).initImageUrl?.trim() ?? '')
      : '';

  const systemWorkflowChoice = useMemo(() => {
    if (!usesSystemWorkflowPath(shared, shared.model)) {
      return null;
    }
    try {
      const preferI2v =
        getComfyModelDefinition(shared.model)?.category === 'video' && Boolean(videoInitKey);
      return describeSystemWorkflowChoice(
        shared.model,
        loadComfyWorkflowFiles(),
        readCachedComfyObjectInfoModels(),
        { preferI2v, tool: toolId }
      );
    } catch {
      return {
        source: 'scaffold' as const,
        label: 'Built-in scaffold',
        reason: 'no-worthy-pack' as const,
        display: 'Built-in scaffold',
      };
    }
  }, [
    inventoryTick,
    shared.model,
    shared.systemWorkflowsLimitPicker,
    shared.useSystemWorkflows,
    videoInitKey,
    workflowCatalog,
    toolId,
  ]);

  const systemQualityHint = useMemo(() => {
    if (!usesSystemWorkflowPath(shared, shared.model)) {
      return null;
    }
    if (
      queueQualityProfile !== 'draft' &&
      queueQualityProfile !== 'final' &&
      queueQualityProfile !== 'max'
    ) {
      return null;
    }
    return formatQueueQualityProfileHint(queueQualityProfile, samplerPreset, resolutionSizeTier, {
      model: shared.model,
    });
  }, [
    queueQualityProfile,
    resolutionSizeTier,
    samplerPreset,
    shared.model,
    shared.useSystemWorkflows,
  ]);

  const systemPathActive = usesSystemWorkflowPath(shared, shared.model);
  const cloudEngine = isCloudEngine(shared.inferenceEngine);
  const categoryLocked = toolId === 'video' || toolId === 'audio' || toolId === 'mesh';
  const modelFilterHint =
    preferEditModels && !showAllModelsOverride
      ? `From photo · edit / img2img models (${pickerModels.length}). T2I checkpoints overbake the reference.`
      : toolId === 'video' && !showAllModelsOverride
        ? `Video · WAN / Hunyuan / LTX only (${pickerModels.length}). Still-image checkpoints stay on Generate.`
        : toolId === 'inpaint' || toolId === 'outpaint'
          ? `Inpaint / edit models (${pickerModels.length}). T2I checkpoints cannot fill a mask.`
          : toolId === 'compose'
            ? `Compose-capable img2img models (${pickerModels.length}).`
            : systemPathActive
              ? shouldLimitSystemWorkflowPicker(shared) && !showAllModelsOverride
                ? `System path · FLUX / Qwen / Z-Image / Boogu / video (${pickerModels.length} models).`
                : `System path for this model (${pickerModels.length} in picker).`
              : shared.useSystemWorkflows === true
                ? `Hybrid · mapped/manual workflow for this model (${pickerModels.length} in picker).`
                : supportedModelsFilterHint(supportedModels.source, supportedModels.models.length);

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    if (selectedWorkflowId?.trim()) {
      return;
    }
    if (!workflowSelection.mounted || shared.autoSelectWorkflowForModel === false) {
      return;
    }
    if (workflowManualOverrideRef.current) {
      return;
    }
    if (!mappedWorkflowForModel || !onWorkflowPresetChangeRef.current) {
      return;
    }
    if (mappedWorkflowForModel === selectedWorkflowId) {
      return;
    }
    scheduleAfterCommit(() => {
      if (!isBrowserStorageReady()) {
        return;
      }
      setWorkflowSelectedIdRef.current(mappedWorkflowForModel);
      onWorkflowPresetChangeRef.current?.(mappedWorkflowForModel);
    });
  }, [
    mappedWorkflowForModel,
    selectedWorkflowId,
    shared.autoSelectWorkflowForModel,
    storageReady,
    workflowSelection.mounted,
  ]);

  return {
    storageReady,
    workflowSelection,
    workflowCatalog,
    suggestedWorkflowMap,
    selectedWorkflowId,
    mappedWorkflowForModel,
    selectedWorkflowJson,
    supportedModels,
    pickerModels,
    showAllModelsOverride,
    handleModelChange,
    handleDiffusersAssetChange,
    diffusersSelectedAssetId,
    handleShowAllModels,
    systemWorkflowChoice,
    systemQualityHint,
    systemPathActive,
    cloudEngine,
    categoryLocked,
    modelFilterHint,
    workflowManualOverrideRef,
  };
}
