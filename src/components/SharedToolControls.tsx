'use client';

import dynamic from 'next/dynamic';
import type { DiffusersCheckpointOption } from '@/components/DiffusersCheckpointSelector';
import { useComfyWorkflowSelection } from '@/hooks/useComfyWorkflowSelection';
import { getDetailLimits } from '@/lib/detail-level';
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
  resolveTxt2iCounterpartForGenerate,
  shouldUseSceneGenerationModel,
  toolIgnoresSystemWorkflowSnap,
} from '@/lib/queue-tool-model';
import {
  isBooguEditModel,
  isComposeCapableModel,
  isEditCapableModel,
  isImg2imgCapableModel,
} from '@/lib/model-denoise-defaults';
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerOverrideFields,
  type ModelSamplerPresetTier,
} from '@/lib/model-sampler-defaults';
import {
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from '@/lib/model-resolution-defaults';
import { normalizeAnatomyGuardMode, type AnatomyGuardMode } from '@/lib/anatomy-guard';
import {
  normalizeQueueQualityProfile,
  formatQueueQualityProfileHint,
  formatQueueQualityProfileLabel,
  QUEUE_QUALITY_PROFILE_OPTIONS,
  type QueueQualityProfile,
} from '@/lib/queue-quality-profile';
import { normalizeRenderRealismMode, type RenderRealismMode } from '@/lib/render-realism';
import type { SharedToolSettings } from '@/lib/settings-cache';
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  SETTINGS_CACHE_UPDATED_EVENT,
  loadSettingsCache,
  loadToolSettings,
  saveSessionLoraSelectionNow,
  saveSharedSettings,
} from '@/lib/settings-cache';
import {
  applySessionRecipeShared,
  latestGenerateLookRecipe,
  SESSION_RECIPES_UPDATED_EVENT,
  type SessionRecipe,
} from '@/lib/session-recipes';
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
import { loadComfyWorkflowFiles } from '@/lib/comfyui-workflow-files';
import { accentRingClass } from '@/lib/tool-theme';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { ChipButton, FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { isBrowserStorageReady, whenBrowserStorageReady } from '@/lib/browser-storage';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { workspaceControlsDefaultOpen } from '@/lib/workspace-mode';
import { resolveModelStackFamily } from '@/lib/workflow-stack-fingerprint';
import { modelSupportsSessionIdentityLock } from '@/lib/compose-identity-lock';
import { isQwenLightningModel } from '@/lib/model-sampling-patch';
import {
  resolveEffectiveSessionLoraStrengthOverrides,
  resolveLoraIdsForModelSelection,
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
  type SessionActiveLoraIdsByModel,
  type SessionLoraStrengthOverridesByModel,
} from '@/lib/model-lora-map';
import {
  DIFFUSERS_DEFAULT_MODEL,
  resolveStudioModelForDiffusersAsset,
} from '@/lib/diffusers-defaults';
import DiffusersSamplingReadout from '@/components/DiffusersSamplingReadout';
import SharedAdvancedSections from '@/components/shared-tool-controls/SharedAdvancedSections';
import SharedIdentitySurface from '@/components/shared-tool-controls/SharedIdentitySurface';
import type { SharedToolControlsProps } from '@/components/shared-tool-controls/types';
import { SUGGESTED_MODEL_CHECKPOINT_MAP } from '@/lib/model-checkpoint-map';
import {
  normalizeSessionLoraStrengthOverrides,
  type SessionLoraStrengthOverrides,
} from '@/lib/lora-stack';
import { engineDisplayName, isCloudEngine } from '@/lib/engine/capabilities';
import { resolveCloudTxt2ImgModel } from '@/lib/engine-settings';
import CharacterOsPicker from '@/components/CharacterOsPicker';

const ModelSelector = dynamic(() => import('@/components/ModelSelector'), {
  ssr: false,
  loading: () => <div className="h-10 animate-pulse rounded-xl bg-[var(--surface-muted)]/60" />,
});
const DiffusersCheckpointSelector = dynamic(
  () => import('@/components/DiffusersCheckpointSelector'),
  {
    ssr: false,
    loading: () => <div className="h-10 animate-pulse rounded-xl bg-[var(--surface-muted)]/60" />,
  }
);
const ComfyWorkflowSelector = dynamic(() => import('@/components/ComfyWorkflowSelector'), {
  ssr: false,
  loading: () => null,
});
const QueueRecipesPanel = dynamic(() => import('@/components/QueueRecipesPanel'), {
  ssr: false,
  loading: () => null,
});
const DiffusersQueueHint = dynamic(() => import('@/components/DiffusersQueueHint'), {
  ssr: false,
  loading: () => null,
});

export default function SharedToolControls({
  shared,
  onModelChange,
  onDetailChange,
  detailHelp,
  showWardrobeOption = false,
  alwaysIncludeClothing = true,
  onAlwaysIncludeClothingChange,
  wardrobeHelp,
  seedLlmWithIngredients = true,
  onSeedLlmWithIngredientsChange,
  lockedWardrobeId,
  lockedWardrobeLabel,
  onClearLockedWardrobe,
  lockedLocation,
  onClearLockedLocation,
  lockedVariationSeed,
  onClearLockedVariationSeed,
  autoFixRules = true,
  onAutoFixRulesChange,
  onWorkflowPresetChange,
  activeCharacterDescriptor,
  onActiveCharacterDescriptorChange,
  recommendFromText,
  wildcardPreviewText,
  toolId,
  preferEditModels = false,
  onSharedSettingsChange,
  variant = 'default',
}: SharedToolControlsProps) {
  const workspaceMode = useWorkspaceMode();
  const advancedOpenByDefault = workspaceControlsDefaultOpen(workspaceMode);
  const roleplayVariant = variant === 'roleplay';
  const selectedModel = getComfyModelDefinition(shared.model);
  const activeLimits = getDetailLimits(shared.detail, shared.model);
  const workflowSelection = useComfyWorkflowSelection();
  const [storageReady, setStorageReady] = useState(() => isBrowserStorageReady());
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
  const checkboxClass = `mt-1 h-4 w-4 rounded-[var(--radius-sm)] border-[var(--border-default)] bg-[var(--bg-muted)] ${accentRingClass()}`;
  const [samplerPreset, setSamplerPreset] = useState<ModelSamplerPresetTier>(() =>
    normalizeModelSamplerPresetTier(shared.modelSamplerPreset)
  );
  const [samplerOverrides, setSamplerOverrides] = useState<ModelSamplerOverrideFields>(
    () => shared.modelSamplerOverrides ?? {}
  );
  const [resolutionOrientation, setResolutionOrientation] = useState<ResolutionOrientation>(() =>
    normalizeResolutionOrientation(shared.modelResolutionOrientation)
  );
  const [resolutionSizeTier, setResolutionSizeTier] = useState<ResolutionSizeTier>(() =>
    normalizeResolutionSizeTier(shared.modelResolutionSizeTier)
  );
  const [renderRealismMode, setRenderRealismMode] = useState<RenderRealismMode>(() =>
    normalizeRenderRealismMode(shared.renderRealismMode)
  );
  const [anatomyGuardMode, setAnatomyGuardMode] = useState<AnatomyGuardMode>(() =>
    normalizeAnatomyGuardMode(shared.anatomyGuardMode)
  );
  const [queueQualityProfile, setQueueQualityProfile] = useState<QueueQualityProfile>(() =>
    normalizeQueueQualityProfile(shared.queueQualityProfile)
  );
  const [showAllModelsOverride, setShowAllModelsOverride] = useState(
    () => shared.showAllModelsOverride === true
  );
  const [expandWildcards, setExpandWildcards] = useState(() => shared.expandWildcards !== false);
  const [wildcardSeed, setWildcardSeed] = useState(() => shared.wildcardSeed ?? '');
  const [wildcardPreview, setWildcardPreview] = useState<string | null>(null);
  const [autoRetryOnOom, setAutoRetryOnOom] = useState(() => shared.autoRetryOnOom !== false);
  const [lastLookRecipe, setLastLookRecipe] = useState<SessionRecipe | null>(() =>
    typeof window === 'undefined' ? null : latestGenerateLookRecipe()
  );
  useEffect(() => {
    const refresh = () => setLastLookRecipe(latestGenerateLookRecipe());
    refresh();
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
    window.addEventListener(SESSION_RECIPES_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
      window.removeEventListener(SESSION_RECIPES_UPDATED_EVENT, refresh);
    };
  }, []);
  const [oomRetryDowngrade, setOomRetryDowngrade] = useState(
    () => shared.oomRetryDowngrade !== false
  );
  const [sessionActiveLoraIds, setSessionActiveLoraIds] = useState<string[] | undefined>(undefined);
  const [sessionActiveLoraIdsByModel, setSessionActiveLoraIdsByModel] =
    useState<SessionActiveLoraIdsByModel>({});
  const [sessionLoraStrengthOverridesByModel, setSessionLoraStrengthOverridesByModel] =
    useState<SessionLoraStrengthOverridesByModel>({});
  const [sessionLoraStrengthOverrides, setSessionLoraStrengthOverrides] =
    useState<SessionLoraStrengthOverrides>(() =>
      resolveEffectiveSessionLoraStrengthOverrides(
        shared.model,
        shared.sessionLoraStrengthOverrides,
        shared.sessionLoraStrengthOverridesByModel
      )
    );

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

  useEffect(() => {
    onWorkflowPresetChangeRef.current = onWorkflowPresetChange;
  }, [onWorkflowPresetChange]);

  useEffect(() => {
    setWorkflowSelectedIdRef.current = workflowSelection.setSelectedId;
  }, [workflowSelection.setSelectedId]);

  const workflowManualOverrideRef = useRef(false);
  const lastModelStackFamilyRef = useRef(resolveModelStackFamily(shared.model));

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

      // Heal only the intentional Lightning stale-map cases (selection resolver
      // already returns a better Lightning workflow id). Never rewrite a normal
      // user assignment just because auto-rank prefers another file.
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

      // Swap LoRA stack to this model's stored picks (or map defaults).
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
    [applyWorkflowForModel, onModelChange, onSharedSettingsChange, showAllModelsOverride]
  );

  /** Diffusers inventory pick → Studio model id + checkpoint/UNET map entry. */
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
    // Lightning / synthetic preset rows use the Studio model id as inventory id.
    if (/lightning/i.test(model) && !/\.(safetensors|ckpt|pt|bin)$/i.test(model)) {
      return model;
    }
    if (/\.(safetensors|ckpt|pt|bin)$/i.test(model)) {
      return model;
    }
    // Flux/Qwen studio ids (flux-dev, qwen-image-2512, …) must resolve to the
    // weight filename so the inventory chip matches and auto-select won't snap
    // back to the Qwen default.
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

  // When the picker is limited to system families, snap unsupported picks off.
  // Hybrid mode (limit off) and Show all keep SDXL/etc. for mapped/manual workflows.
  // Audio/mesh/video tools keep their own categories; snapping them to FLUX fights
  // tool model locks and can infinite-loop (Maximum update depth).
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

  // From photo / img2img tools: don't leave a T2I checkpoint selected — that
  // overbakes the reference (neon skin, crunchy texture, blown contrast).
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

  const [inventoryTick, setInventoryTick] = useState(0);

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
    // Respect a persisted library/picker selection — do not replace it with auto-ranked defaults.
    // Wait for IndexedDB hydrate so we don't auto-select against DEFAULT_SHARED_SETTINGS
    // and persist a wipe of real generation settings.
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

  // Batch mirrored shared settings into one post-commit update to avoid a
  // cascade of re-renders when useCachedSettings hydrates.
  useEffect(() => {
    scheduleAfterCommit(() => {
      setSamplerPreset(normalizeModelSamplerPresetTier(shared.modelSamplerPreset));
      setSamplerOverrides(shared.modelSamplerOverrides ?? {});
      setResolutionOrientation(normalizeResolutionOrientation(shared.modelResolutionOrientation));
      setResolutionSizeTier(normalizeResolutionSizeTier(shared.modelResolutionSizeTier));
      setRenderRealismMode(normalizeRenderRealismMode(shared.renderRealismMode));
      setAnatomyGuardMode(normalizeAnatomyGuardMode(shared.anatomyGuardMode));
      setQueueQualityProfile(normalizeQueueQualityProfile(shared.queueQualityProfile));
      setShowAllModelsOverride(shared.showAllModelsOverride === true);
      setExpandWildcards(shared.expandWildcards !== false);
      setWildcardSeed(shared.wildcardSeed ?? '');
      setAutoRetryOnOom(shared.autoRetryOnOom !== false);
      setOomRetryDowngrade(shared.oomRetryDowngrade !== false);
      setSessionActiveLoraIdsByModel(shared.sessionActiveLoraIdsByModel ?? {});
      setSessionLoraStrengthOverridesByModel(shared.sessionLoraStrengthOverridesByModel ?? {});
      setSessionActiveLoraIds(
        resolveLoraIdsForModelSelection(shared.model, {
          sessionActiveLoraIdsByModel: shared.sessionActiveLoraIdsByModel,
          modelLoraMap: shared.modelLoraMap,
          sessionActiveLoraIds: shared.sessionActiveLoraIds,
        })
      );
      setSessionLoraStrengthOverrides(
        resolveEffectiveSessionLoraStrengthOverrides(
          shared.model,
          shared.sessionLoraStrengthOverrides,
          shared.sessionLoraStrengthOverridesByModel
        )
      );
    });
  }, [
    shared.modelSamplerPreset,
    shared.modelSamplerOverrides,
    shared.modelResolutionOrientation,
    shared.modelResolutionSizeTier,
    shared.renderRealismMode,
    shared.anatomyGuardMode,
    shared.queueQualityProfile,
    shared.showAllModelsOverride,
    shared.expandWildcards,
    shared.wildcardSeed,
    shared.autoRetryOnOom,
    shared.oomRetryDowngrade,
    shared.sessionActiveLoraIds,
    shared.sessionActiveLoraIdsByModel,
    shared.sessionLoraStrengthOverridesByModel,
    shared.sessionLoraStrengthOverrides,
    shared.modelLoraMap,
    shared.model,
  ]);

  const handleSessionActiveLoraIdsChange = (ids: string[] | undefined) => {
    const modelId = shared.model;
    const baseShared = loadSettingsCache().shared;
    const nextByModel = setSessionLoraIdsForModel(
      baseShared.sessionActiveLoraIdsByModel,
      modelId,
      ids
    );
    // When clearing to defaults, mirror the resolved defaults for the current model.
    const mirrored =
      ids !== undefined
        ? ids
        : resolveLoraIdsForModelSelection(modelId, {
            sessionActiveLoraIdsByModel: nextByModel,
            modelLoraMap: baseShared.modelLoraMap,
          });
    setSessionActiveLoraIds(mirrored);
    setSessionActiveLoraIdsByModel(nextByModel);
    const patch = {
      sessionActiveLoraIds: mirrored,
      sessionActiveLoraIdsByModel: nextByModel,
    };
    if (onSharedSettingsChange) {
      onSharedSettingsChange(patch);
    } else {
      void saveSessionLoraSelectionNow({
        ...baseShared,
        ...patch,
      }).then(() => {
        void import('@/lib/app-toast').then(({ pushAppToast }) => {
          pushAppToast({ text: 'Saved — LoRA session', tone: 'success', ttlMs: 1800 });
        });
      });
    }
  };

  const handleSessionLoraStrengthOverridesChange = (overrides: SessionLoraStrengthOverrides) => {
    const modelId = shared.model;
    const normalized = normalizeSessionLoraStrengthOverrides(overrides);
    const baseShared = loadSettingsCache().shared;
    const nextByModel = setSessionLoraStrengthOverridesForModel(
      baseShared.sessionLoraStrengthOverridesByModel,
      modelId,
      normalized
    );
    setSessionLoraStrengthOverrides(normalized);
    setSessionLoraStrengthOverridesByModel(nextByModel);
    const patch = {
      sessionLoraStrengthOverrides: normalized,
      sessionLoraStrengthOverridesByModel: nextByModel,
    };
    if (onSharedSettingsChange) {
      onSharedSettingsChange(patch);
    } else {
      // Strength tweaks persist quietly — stack pick/clear already toasts.
      void saveSessionLoraSelectionNow({
        ...baseShared,
        ...patch,
      });
    }
  };

  const handleSamplerPresetChange = (preset: ModelSamplerPresetTier) => {
    setSamplerPreset(preset);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        modelSamplerPreset: preset,
      },
      { notify: false }
    );
  };

  const handleSamplerOverridesChange = (overrides: ModelSamplerOverrideFields) => {
    setSamplerOverrides(overrides);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        modelSamplerOverrides: overrides,
      },
      { notify: false }
    );
  };

  const handleResolutionOrientationChange = (orientation: ResolutionOrientation) => {
    setResolutionOrientation(orientation);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        modelResolutionOrientation: orientation,
      },
      { notify: false }
    );
  };

  const handleResolutionSizeTierChange = (tier: ResolutionSizeTier) => {
    setResolutionSizeTier(tier);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        modelResolutionSizeTier: tier,
      },
      { notify: false }
    );
  };

  const handleRenderRealismModeChange = (mode: RenderRealismMode) => {
    setRenderRealismMode(mode);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        renderRealismMode: mode,
      },
      { notify: false }
    );
  };

  const handleAnatomyGuardModeChange = (mode: AnatomyGuardMode) => {
    setAnatomyGuardMode(mode);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        anatomyGuardMode: mode,
      },
      { notify: false }
    );
  };

  const handleQueueQualityProfileChange = (profile: QueueQualityProfile) => {
    setQueueQualityProfile(profile);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        queueQualityProfile: profile,
      },
      { notify: false }
    );
  };

  // Snap Follow sidebar → Final when enabling system workflows (chips need an active profile).
  useEffect(() => {
    if (!storageReady) {
      return;
    }
    if (shared.useSystemWorkflows !== true) {
      return;
    }
    if (normalizeQueueQualityProfile(shared.queueQualityProfile) !== 'followSettings') {
      return;
    }
    scheduleAfterCommit(() => {
      if (!isBrowserStorageReady()) {
        return;
      }
      handleQueueQualityProfileChange('final');
    });
  }, [shared.queueQualityProfile, shared.useSystemWorkflows, storageReady]);

  const handleExpandWildcardsChange = (value: boolean) => {
    setExpandWildcards(value);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        expandWildcards: value,
      },
      { notify: false }
    );
  };

  const handleWildcardSeedChange = (value: string) => {
    setWildcardSeed(value);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        wildcardSeed: value.trim() || undefined,
      },
      { notify: false }
    );
  };

  const handleAutoRetryOnOomChange = (value: boolean) => {
    setAutoRetryOnOom(value);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        autoRetryOnOom: value,
      },
      { notify: false }
    );
  };

  const handleOomRetryDowngradeChange = (value: boolean) => {
    setOomRetryDowngrade(value);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        oomRetryDowngrade: value,
      },
      { notify: false }
    );
  };

  const toolProfileOverride = toolId ? shared.toolQueueQualityProfiles?.[toolId] : undefined;

  const handleToolQueueQualityChange = (profile: QueueQualityProfile | undefined) => {
    if (!toolId) {
      return;
    }
    const current = { ...(loadSettingsCache().shared.toolQueueQualityProfiles ?? {}) };
    if (!profile) {
      delete current[toolId];
    } else {
      current[toolId] = profile;
    }
    const nextProfiles = Object.keys(current).length > 0 ? current : undefined;
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        toolQueueQualityProfiles: nextProfiles,
      },
      { notify: false }
    );
    onSharedSettingsChange?.({ toolQueueQualityProfiles: nextProfiles });
  };

  const handleRecipesApplied = (next: SharedToolSettings) => {
    setQueueQualityProfile(
      normalizeQueueQualityProfile(next.queueQualityProfile ?? queueQualityProfile)
    );
    setSamplerPreset(normalizeModelSamplerPresetTier(next.modelSamplerPreset ?? samplerPreset));
    setSamplerOverrides(next.modelSamplerOverrides ?? samplerOverrides);
    setResolutionOrientation(
      normalizeResolutionOrientation(next.modelResolutionOrientation ?? resolutionOrientation)
    );
    setResolutionSizeTier(
      normalizeResolutionSizeTier(next.modelResolutionSizeTier ?? resolutionSizeTier)
    );
    const nextByModel =
      next.sessionActiveLoraIds !== undefined
        ? setSessionLoraIdsForModel(
            next.sessionActiveLoraIdsByModel ??
              loadSettingsCache().shared.sessionActiveLoraIdsByModel,
            next.model,
            next.sessionActiveLoraIds
          )
        : (next.sessionActiveLoraIdsByModel ??
          loadSettingsCache().shared.sessionActiveLoraIdsByModel);
    setSessionActiveLoraIds(next.sessionActiveLoraIds);
    setSessionActiveLoraIdsByModel(nextByModel ?? {});
    const nextStrengthByModel =
      next.sessionLoraStrengthOverrides !== undefined
        ? setSessionLoraStrengthOverridesForModel(
            next.sessionLoraStrengthOverridesByModel ??
              loadSettingsCache().shared.sessionLoraStrengthOverridesByModel,
            next.model,
            next.sessionLoraStrengthOverrides
          )
        : (next.sessionLoraStrengthOverridesByModel ??
          loadSettingsCache().shared.sessionLoraStrengthOverridesByModel);
    const nextStrengthOverrides = resolveEffectiveSessionLoraStrengthOverrides(
      next.model,
      next.sessionLoraStrengthOverrides ?? loadSettingsCache().shared.sessionLoraStrengthOverrides,
      nextStrengthByModel
    );
    setSessionLoraStrengthOverridesByModel(nextStrengthByModel ?? {});
    setSessionLoraStrengthOverrides(nextStrengthOverrides);
    if (next.model !== shared.model) {
      onModelChange(next.model);
    }
    onSharedSettingsChange?.({
      model: next.model,
      queueQualityProfile: next.queueQualityProfile,
      sessionQueueMode: next.sessionQueueMode,
      sessionActiveLoraIds: next.sessionActiveLoraIds,
      sessionActiveLoraIdsByModel: nextByModel,
      sessionLoraStrengthOverrides: nextStrengthOverrides,
      sessionLoraStrengthOverridesByModel: nextStrengthByModel,
      modelSamplerPreset: next.modelSamplerPreset,
      modelSamplerOverrides: next.modelSamplerOverrides,
      modelResolutionOrientation: next.modelResolutionOrientation,
      modelResolutionSizeTier: next.modelResolutionSizeTier,
      editDenoiseStrength: next.editDenoiseStrength,
      sessionEmbeddingTokens: next.sessionEmbeddingTokens,
      ipAdapterImageFilename: next.ipAdapterImageFilename,
      ipAdapterImageFilenames: next.ipAdapterImageFilenames,
      ipAdapterComfyUrl: next.ipAdapterComfyUrl,
      ipAdapterStrength: next.ipAdapterStrength,
      identityKind: next.identityKind,
      toolQueueQualityProfiles: next.toolQueueQualityProfiles,
      toolQualityRecipes: next.toolQualityRecipes,
    });
  };

  const recipesShared = useMemo(
    () => ({
      ...shared,
      queueQualityProfile,
      modelResolutionOrientation: resolutionOrientation,
      modelResolutionSizeTier: resolutionSizeTier,
      sessionActiveLoraIds,
      sessionActiveLoraIdsByModel,
      sessionLoraStrengthOverrides,
      sessionLoraStrengthOverridesByModel,
      modelSamplerOverrides: samplerOverrides,
    }),
    [
      shared,
      queueQualityProfile,
      resolutionOrientation,
      resolutionSizeTier,
      sessionActiveLoraIds,
      sessionActiveLoraIdsByModel,
      sessionLoraStrengthOverrides,
      sessionLoraStrengthOverridesByModel,
      samplerOverrides,
    ]
  );

  return (
    <div className="ui-sidebar-dense ui-field-stack space-y-5">
      <div className="space-y-3">
        <FieldLabel
          hint={
            cloudEngine
              ? `${engineDisplayName(shared.inferenceEngine)} ignores Comfy workflows, LoRAs, and live latents. Image 1 is sent as img2img when present.`
              : shared.inferenceEngine === 'diffusers'
                ? 'Optional Diffusers inventory (experimental). Prefer ComfyUI for Lightning quality/speed on 24GB.'
                : systemPathActive
                  ? undefined
                  : shared.autoSelectWorkflowForModel !== false
                    ? 'Choosing a model auto-selects its mapped ComfyUI workflow below (when configured).'
                    : 'Shared across tools and remembered between page reloads.'
          }
        >
          {cloudEngine
            ? `${engineDisplayName(shared.inferenceEngine)} model`
            : shared.inferenceEngine === 'diffusers'
              ? 'Diffusers model (Qwen / Flux)'
              : systemPathActive
                ? 'Model'
                : 'Target model'}
        </FieldLabel>
        {cloudEngine ? (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/40 px-3 py-2.5">
            <p className="text-sm text-[var(--text-primary)]">
              {resolveCloudTxt2ImgModel(shared.inferenceEngine)}
            </p>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              Cloud txt2img via {engineDisplayName(shared.inferenceEngine)}. Change the key and
              model in{' '}
              <a
                href="/settings?tab=comfyui&section=inference-engine"
                className="text-[var(--text-secondary)] underline-offset-2 hover:underline"
              >
                Settings → Inference engine
              </a>
              .
            </p>
          </div>
        ) : shared.inferenceEngine === 'diffusers' && !roleplayVariant ? (
          <DiffusersCheckpointSelector
            value={diffusersSelectedAssetId}
            onChange={handleDiffusersAssetChange}
          />
        ) : (
          <ModelSelector
            value={shared.model}
            allowedModels={
              pickerModels.length < COMFY_IMAGE_MODELS.length ? pickerModels : undefined
            }
            filterHint={modelFilterHint}
            onShowAllModels={
              categoryLocked || showAllModelsOverride || supportedModels.source === 'disabled'
                ? undefined
                : handleShowAllModels
            }
            onChange={handleModelChange}
          />
        )}
        {!roleplayVariant && toolId !== 'audio' && toolId !== 'mesh' ? (
          <CharacterOsPicker
            shared={shared}
            hints={recommendFromText}
            onApply={patch => {
              if (onSharedSettingsChange) {
                onSharedSettingsChange(patch);
              } else {
                saveSharedSettings({
                  ...loadSettingsCache().shared,
                  ...patch,
                });
              }
              if (patch.model && onModelChange) {
                onModelChange(patch.model as ComfyImageModel);
              }
            }}
          />
        ) : null}
        {shared.inferenceEngine === 'diffusers' && !roleplayVariant ? (
          <DiffusersQueueHint workflowJson={selectedWorkflowJson} />
        ) : null}
        {!roleplayVariant &&
        !cloudEngine &&
        toolId === 'generate' &&
        /qwen-image-edit-2511-lightning/i.test(shared.model) ? (
          <div className="space-y-2 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5">
            <p className="text-xs leading-relaxed text-[var(--tint-warning-text)]">
              Edit-2511 Lightning on Generate runs as T2I (reference images disconnected). For clean
              scene generation prefer{' '}
              <span className="font-medium text-[var(--tint-warning-text)]">
                Qwen-Image-2512 Lightning
              </span>
              ; keep Edit Lightning for Refine / img2img.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 text-xs"
              onClick={() => handleModelChange(resolveTxt2iCounterpartForGenerate(shared.model))}
            >
              Switch to{' '}
              {getComfyModelDefinition(resolveTxt2iCounterpartForGenerate(shared.model)).label}
            </Button>
          </div>
        ) : null}
        {!roleplayVariant && toolId === 'generate' && isBooguEditModel(shared.model) ? (
          <div className="space-y-2 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5">
            <p className="text-xs leading-relaxed text-[var(--tint-warning-text)]">
              Boogu Edit is instruction TI2I only — upload a reference on{' '}
              <span className="font-medium text-[var(--tint-warning-text)]">Refine</span>,{' '}
              <span className="font-medium text-[var(--tint-warning-text)]">Compose</span>, or{' '}
              <span className="font-medium text-[var(--tint-warning-text)]">Image → Prompt</span>{' '}
              instead of Generate.
            </p>
          </div>
        ) : null}
      </div>

      {!roleplayVariant ? (
        <div className="space-y-3">
          <FieldLabel
            hint={
              detailHelp ??
              `Limits for ${selectedModel.label}: up to ${activeLimits.maxSentences} sentences, ~${activeLimits.maxChars} chars.`
            }
          >
            Prompt detail
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { label: 'Concise', value: 'concise' },
                { label: 'Balanced', value: 'balanced' },
                { label: 'Rich', value: 'rich' },
              ] as const
            ).map(preset => (
              <ChipButton
                key={preset.value}
                active={shared.detail === preset.value}
                onClick={() => onDetailChange(preset.value)}
              >
                {preset.label}
              </ChipButton>
            ))}
          </div>
        </div>
      ) : null}

      {!roleplayVariant ? (
        <div className="space-y-2">
          <FieldLabel hint="How long the render takes and how much polish it gets.">
            Quality
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {QUEUE_QUALITY_PROFILE_OPTIONS.filter(option => option.id !== 'followSettings').map(
              option => (
                <ChipButton
                  key={option.id}
                  active={queueQualityProfile === option.id}
                  onClick={() => handleQueueQualityProfileChange(option.id)}
                >
                  {option.label}
                </ChipButton>
              )
            )}
          </div>
          {systemPathActive && systemQualityHint ? (
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{systemQualityHint}</p>
          ) : null}
        </div>
      ) : null}

      {lastLookRecipe && !roleplayVariant ? (
        <div className="space-y-1.5">
          <FieldLabel hint="Newest saved look from a 4–5★ still. Applies the same session stack on every image tool.">
            Last look
          </FieldLabel>
          <ChipButton
            active={false}
            title={lastLookRecipe.label}
            onClick={() => {
              const recipe = latestGenerateLookRecipe() ?? lastLookRecipe;
              const next = applySessionRecipeShared(loadSettingsCache().shared, recipe);
              saveSharedSettings(next, { notify: true });
              handleRecipesApplied(next);
            }}
          >
            <span data-testid="last-generate-look" className="truncate">
              {lastLookRecipe.label}
            </span>
          </ChipButton>
        </div>
      ) : null}

      {modelSupportsSessionIdentityLock(shared.model) &&
      toolId !== 'video' &&
      toolId !== 'compose' &&
      shared.ipAdapterImageFilename?.trim() ? (
        <div className="flex flex-wrap items-center gap-2">
          {shared.ipAdapterImageUrl?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shared.ipAdapterImageUrl}
              alt=""
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : null}
          <span className="type-caption rounded-[var(--radius-full)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-[var(--accent-text)]">
            Face locked
          </span>
          <Button
            variant="ghost"
            className="!min-h-8 px-2 type-caption"
            onClick={() => {
              const patch = {
                ipAdapterImageFilename: '',
                ipAdapterImageFilenames: [] as string[],
                ipAdapterImageUrl: '',
                ipAdapterComfyUrl: '',
              };
              if (onSharedSettingsChange) {
                onSharedSettingsChange(patch);
              } else {
                saveSharedSettings({
                  ...loadSettingsCache().shared,
                  ...patch,
                });
              }
            }}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {(() => {
        const queueQualityBlock = cloudEngine ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Cloud engines use the prompt and size from this tool. Draft/Final/Max do not patch a
            Comfy graph.
          </p>
        ) : systemPathActive ? (
          <div className="space-y-2">
            <p
              data-testid="queue-seed-quality-clarity"
              className="rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]"
            >
              Queue uses{' '}
              <span className="font-medium text-[var(--text-primary)]">
                {formatQueueQualityProfileLabel(queueQualityProfile)}
              </span>
              {' · '}
              {lockedVariationSeed?.trim()
                ? `pinned seed ${lockedVariationSeed.trim().slice(0, 24)}${lockedVariationSeed.trim().length > 24 ? '…' : ''}`
                : 'new seed each send'}
            </p>
            {systemWorkflowChoice ? (
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Graph:{' '}
                <span className="text-[var(--text-secondary)]">{systemWorkflowChoice.display}</span>
              </p>
            ) : null}
            {roleplayVariant ? null : (
              <QueueRecipesPanel
                toolId={toolId}
                shared={recipesShared}
                qualityProfile={queueQualityProfile}
                orientation={resolutionOrientation}
                sizeTier={resolutionSizeTier}
                systemWorkflowSource={systemWorkflowChoice?.source}
                onApplied={handleRecipesApplied}
              />
            )}
            {shared.inferenceEngine === 'diffusers' && !roleplayVariant ? (
              <DiffusersSamplingReadout
                model={shared.model}
                checkpointMap={shared.modelCheckpointMap}
                toolId={toolId ?? 'generate'}
                workshopCrop={shared.diffusersWorkshopCrop ?? 'auto'}
              />
            ) : null}
          </div>
        ) : null;

        const workflowBlock =
          !roleplayVariant &&
          !cloudEngine &&
          onWorkflowPresetChange &&
          workflowSelection.mounted &&
          !usesSystemWorkflowPath(shared, shared.model) ? (
            <ComfyWorkflowSelector
              selectedId={selectedWorkflowId}
              defaultLabel={workflowSelection.defaultLabel}
              localFiles={workflowSelection.localFiles}
              serverFiles={workflowSelection.serverFiles}
              helpText={
                shared.useSystemWorkflows === true
                  ? 'This model is outside the system-workflow families — pick a library graph (or map one in Settings).'
                  : shared.autoSelectWorkflowForModel !== false
                    ? 'Your picker choice is used at queue time unless Settings → model→workflow map assigns a file for this model.'
                    : undefined
              }
              onChange={fileId => {
                workflowManualOverrideRef.current = true;
                workflowSelection.setSelectedId(fileId);
                onWorkflowPresetChange(fileId);
              }}
            />
          ) : null;

        const identitySurface = (
          <SharedIdentitySurface
            shared={shared}
            cloudEngine={cloudEngine}
            toolId={toolId}
            roleplayVariant={roleplayVariant}
            advancedOpenByDefault={advancedOpenByDefault}
            onSharedSettingsChange={onSharedSettingsChange}
          />
        );

        const advancedSections = (
          <SharedAdvancedSections
            queueQualityBlock={queueQualityBlock}
            workflowBlock={workflowBlock}
            identitySurface={identitySurface}
            cloudEngine={cloudEngine}
            roleplayVariant={roleplayVariant}
            systemPathActive={systemPathActive}
            advancedOpenByDefault={advancedOpenByDefault}
            checkboxClass={checkboxClass}
            shared={shared}
            sessionActiveLoraIds={sessionActiveLoraIds}
            sessionActiveLoraIdsByModel={sessionActiveLoraIdsByModel}
            sessionLoraStrengthOverrides={sessionLoraStrengthOverrides}
            onSessionActiveLoraIdsChange={handleSessionActiveLoraIdsChange}
            onSessionLoraStrengthOverridesChange={handleSessionLoraStrengthOverridesChange}
            onSharedSettingsChange={onSharedSettingsChange}
            samplerPreset={samplerPreset}
            samplerOverrides={samplerOverrides}
            onSamplerPresetChange={handleSamplerPresetChange}
            onSamplerOverridesChange={handleSamplerOverridesChange}
            resolutionOrientation={resolutionOrientation}
            resolutionSizeTier={resolutionSizeTier}
            onResolutionOrientationChange={handleResolutionOrientationChange}
            onResolutionSizeTierChange={handleResolutionSizeTierChange}
            queueQualityProfile={queueQualityProfile}
            onQueueQualityProfileChange={handleQueueQualityProfileChange}
            toolId={toolId}
            toolProfileOverride={toolProfileOverride}
            onToolQueueQualityChange={handleToolQueueQualityChange}
            lockedVariationSeed={lockedVariationSeed}
            recipesShared={recipesShared}
            onRecipesApplied={handleRecipesApplied}
            renderRealismMode={renderRealismMode}
            onRenderRealismModeChange={handleRenderRealismModeChange}
            anatomyGuardMode={anatomyGuardMode}
            onAnatomyGuardModeChange={handleAnatomyGuardModeChange}
            recommendFromText={recommendFromText}
            onModelChange={handleModelChange}
            expandWildcards={expandWildcards}
            onExpandWildcardsChange={handleExpandWildcardsChange}
            wildcardSeed={wildcardSeed}
            onWildcardSeedChange={handleWildcardSeedChange}
            wildcardPreviewText={wildcardPreviewText}
            wildcardPreview={wildcardPreview}
            onWildcardPreviewChange={setWildcardPreview}
            autoRetryOnOom={autoRetryOnOom}
            onAutoRetryOnOomChange={handleAutoRetryOnOomChange}
            oomRetryDowngrade={oomRetryDowngrade}
            onOomRetryDowngradeChange={handleOomRetryDowngradeChange}
            showWardrobeOption={showWardrobeOption}
            alwaysIncludeClothing={alwaysIncludeClothing}
            onAlwaysIncludeClothingChange={onAlwaysIncludeClothingChange}
            wardrobeHelp={wardrobeHelp}
            seedLlmWithIngredients={seedLlmWithIngredients}
            onSeedLlmWithIngredientsChange={onSeedLlmWithIngredientsChange}
            lockedWardrobeId={lockedWardrobeId}
            lockedWardrobeLabel={lockedWardrobeLabel}
            onClearLockedWardrobe={onClearLockedWardrobe}
            lockedLocation={lockedLocation}
            onClearLockedLocation={onClearLockedLocation}
            onClearLockedVariationSeed={onClearLockedVariationSeed}
            autoFixRules={autoFixRules}
            onAutoFixRulesChange={onAutoFixRulesChange}
            activeCharacterDescriptor={activeCharacterDescriptor}
            onActiveCharacterDescriptorChange={onActiveCharacterDescriptorChange}
          />
        );

        return (
          <>
            {roleplayVariant ? identitySurface : null}
            <CollapsibleSection
              title="Advanced settings"
              summary={
                roleplayVariant
                  ? 'Quality and LoRA stack.'
                  : 'LoRAs, embeddings, identity, sampling, wildcards, and automation.'
              }
              defaultOpen={advancedOpenByDefault}
              persistKey="shared-advanced-settings"
            >
              {advancedSections}
            </CollapsibleSection>
          </>
        );
      })()}
    </div>
  );
}
