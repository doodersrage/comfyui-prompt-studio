'use client';

import dynamic from 'next/dynamic';
import type { DiffusersCheckpointOption } from '@/components/DiffusersCheckpointSelector';
import { useComfyWorkflowSelection } from '@/hooks/useComfyWorkflowSelection';
import type { DetailLevel } from '@/lib/detail-level';
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
  resolveTxt2iCounterpartForGenerate,
  shouldUseSceneGenerationModel,
  toolIgnoresSystemWorkflowSnap,
} from '@/lib/queue-tool-model';
import {
  isBooguEditModel,
  isComposeCapableModel,
  isEditCapableModel,
} from '@/lib/model-denoise-defaults';
import {
  hasModelSamplerOverrides,
  normalizeModelSamplerPresetTier,
  pickModelSamplerOverrideFields,
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
import { PINNED_VARIATION_SEED_LABEL } from '@/lib/tool-ui-labels';
import { accentRingClass } from '@/lib/tool-theme';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';
import { ChipButton, FieldDivider, FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { isBrowserStorageReady, whenBrowserStorageReady } from '@/lib/browser-storage';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { workspaceControlsDefaultOpen, workspaceShowsAdvancedControls } from '@/lib/workspace-mode';
import { resolveModelStackFamily } from '@/lib/workflow-stack-fingerprint';
import { modelSupportsTextualInversion } from '@/lib/textual-inversion';
import { modelSupportsSessionIdentityLock } from '@/lib/compose-identity-lock';
import { isQwenLightningModel } from '@/lib/model-sampling-patch';
import { expandWildcardText, textHasWildcardTokens } from '@/lib/wildcard-expand';
import {
  hasSessionLoraIdsForModel,
  resolveEffectiveSessionLoraStrengthOverrides,
  resolveLoraIdsForModelSelection,
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
  type SessionActiveLoraIdsByModel,
  type SessionLoraStrengthOverridesByModel,
} from '@/lib/model-lora-map';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import {
  DIFFUSERS_DEFAULT_MODEL,
  resolveDiffusersModelHint,
  resolveStudioModelForDiffusersAsset,
} from '@/lib/diffusers-defaults';
import { SUGGESTED_MODEL_CHECKPOINT_MAP } from '@/lib/model-checkpoint-map';
import {
  countSessionLoraStrengthOverrides,
  normalizeSessionLoraStrengthOverrides,
  type SessionLoraStrengthOverrides,
} from '@/lib/lora-stack';

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
const LoraStackSessionPicker = dynamic(() => import('@/components/LoraStackSessionPicker'), {
  ssr: false,
  loading: () => null,
});
const EmbeddingSessionChips = dynamic(() => import('@/components/EmbeddingSessionChips'), {
  ssr: false,
  loading: () => null,
});
const IdentityLockSessionControl = dynamic(
  () => import('@/components/IdentityLockSessionControl'),
  {
    ssr: false,
    loading: () => null,
  }
);
const ComfyWorkflowSelector = dynamic(() => import('@/components/ComfyWorkflowSelector'), {
  ssr: false,
  loading: () => null,
});
const ModelRecommenderHints = dynamic(() => import('@/components/ModelRecommenderHints'), {
  ssr: false,
  loading: () => null,
});
const ModelSamplerHints = dynamic(() => import('@/components/ModelSamplerHints'), {
  ssr: false,
  loading: () => null,
});
const ModelResolutionHints = dynamic(() => import('@/components/ModelResolutionHints'), {
  ssr: false,
  loading: () => null,
});
const RenderRealismHints = dynamic(() => import('@/components/RenderRealismHints'), {
  ssr: false,
  loading: () => null,
});
const AnatomyGuardHints = dynamic(() => import('@/components/AnatomyGuardHints'), {
  ssr: false,
  loading: () => null,
});
const QueueQualityProfileHints = dynamic(() => import('@/components/QueueQualityProfileHints'), {
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

type SharedToolControlsProps = {
  shared: SharedToolSettings;
  onModelChange: (model: SharedToolSettings['model']) => void;
  onDetailChange: (detail: DetailLevel) => void;
  detailHelp?: string;
  showWardrobeOption?: boolean;
  alwaysIncludeClothing?: boolean;
  onAlwaysIncludeClothingChange?: (value: boolean) => void;
  wardrobeHelp?: string;
  /** When false, LLM gets keywords/hints only (no location/wardrobe seeds). */
  seedLlmWithIngredients?: boolean;
  onSeedLlmWithIngredientsChange?: (value: boolean) => void;
  lockedWardrobeId?: string;
  lockedWardrobeLabel?: string;
  onClearLockedWardrobe?: () => void;
  lockedLocation?: string;
  onClearLockedLocation?: () => void;
  lockedVariationSeed?: string;
  onClearLockedVariationSeed?: () => void;
  autoFixRules?: boolean;
  onAutoFixRulesChange?: (value: boolean) => void;
  onWorkflowPresetChange?: (fileId: string | undefined) => void;
  activeCharacterDescriptor?: string;
  onActiveCharacterDescriptorChange?: (value: string) => void;
  recommendFromText?: string;
  /** Text used for wildcard expand preview (defaults to recommendFromText). */
  wildcardPreviewText?: string;
  /** When set, enables a per-tool queue quality override below the global profile. */
  toolId?: string;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
};

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
  onSharedSettingsChange,
}: SharedToolControlsProps) {
  const workspaceMode = useWorkspaceMode();
  const advancedOpenByDefault = workspaceControlsDefaultOpen(workspaceMode);
  const showsAdvancedShell = workspaceShowsAdvancedControls(workspaceMode);
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
    return () => window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
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
    });
    const base =
      filtered.length > 0
        ? filtered
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
      }).includes(model)
    );
  }, [
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
  const modelFilterHint = systemPathActive
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
            shared.inferenceEngine === 'diffusers'
              ? 'Optional Diffusers inventory (experimental). Prefer ComfyUI for Lightning quality/speed on 24GB.'
              : systemPathActive
                ? undefined
                : shared.autoSelectWorkflowForModel !== false
                  ? 'Choosing a model auto-selects its mapped ComfyUI workflow below (when configured).'
                  : 'Shared across tools and remembered between page reloads.'
          }
        >
          {shared.inferenceEngine === 'diffusers'
            ? 'Diffusers model (Qwen / Flux)'
            : systemPathActive
              ? 'Model'
              : 'Target model'}
        </FieldLabel>
        {shared.inferenceEngine === 'diffusers' ? (
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
              showAllModelsOverride || supportedModels.source === 'disabled'
                ? undefined
                : handleShowAllModels
            }
            onChange={handleModelChange}
          />
        )}
        {shared.inferenceEngine === 'diffusers' ? (
          <DiffusersQueueHint workflowJson={selectedWorkflowJson} />
        ) : null}
        {toolId === 'generate' && /qwen-image-edit-2511-lightning/i.test(shared.model) ? (
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
        {toolId === 'generate' && isBooguEditModel(shared.model) ? (
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

      {(() => {
        const queueQualityBlock = systemPathActive ? (
          <div className="space-y-2">
            <FieldLabel hint="Steps, resolution, and polish scale with this choice.">
              Queue quality
            </FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'draft' as const, label: 'Draft' },
                  { id: 'final' as const, label: 'Final' },
                  { id: 'max' as const, label: 'Max' },
                ] as const
              ).map(option => (
                <ChipButton
                  key={option.id}
                  active={queueQualityProfile === option.id}
                  onClick={() => handleQueueQualityProfileChange(option.id)}
                >
                  {option.label}
                </ChipButton>
              ))}
            </div>
            {systemQualityHint ? (
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                {systemQualityHint}
              </p>
            ) : null}
            <p
              data-testid="queue-seed-quality-clarity"
              className="rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]"
            >
              Queue uses{' '}
              <span className="font-medium text-[var(--text-primary)]">
                {queueQualityProfile === 'followSettings'
                  ? 'Follow sidebar'
                  : queueQualityProfile === 'draft'
                    ? 'Draft'
                    : queueQualityProfile === 'final'
                      ? 'Final'
                      : 'Max'}
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
            <QueueRecipesPanel
              toolId={toolId}
              shared={recipesShared}
              qualityProfile={queueQualityProfile}
              orientation={resolutionOrientation}
              sizeTier={resolutionSizeTier}
              systemWorkflowSource={systemWorkflowChoice?.source}
              onApplied={handleRecipesApplied}
            />
            {shared.inferenceEngine === 'diffusers' ? (
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

        const advancedSections = (
          <>
            {toolId === 'generate' && lastLookRecipe ? (
              <div className="space-y-1.5">
                <FieldLabel hint="Newest saved Generate look from a 4–5★ still.">
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
            {queueQualityBlock}
            {workflowBlock}
            <CollapsibleSection
              title="LoRA stack"
              summary={(() => {
                const tuned = countSessionLoraStrengthOverrides(sessionLoraStrengthOverrides);
                if (sessionActiveLoraIds !== undefined) {
                  return `${sessionActiveLoraIds.length} selected${tuned ? ` · ${tuned} tuned` : ''}`;
                }
                return tuned
                  ? `${tuned} strength tweak${tuned === 1 ? '' : 's'}`
                  : 'Pick LoRAs for this model';
              })()}
              defaultOpen={advancedOpenByDefault}
              persistKey="shared-lora-stack"
            >
              <LoraStackSessionPicker
                model={shared.model}
                sessionActiveLoraIds={
                  hasSessionLoraIdsForModel(sessionActiveLoraIdsByModel, shared.model)
                    ? sessionActiveLoraIds
                    : undefined
                }
                sessionLoraStrengthOverrides={sessionLoraStrengthOverrides}
                checkboxClassName={checkboxClass}
                onChange={handleSessionActiveLoraIdsChange}
                onSessionStrengthOverridesChange={handleSessionLoraStrengthOverridesChange}
              />
            </CollapsibleSection>

            {modelSupportsTextualInversion(shared.model) ? (
              <CollapsibleSection
                title="Embeddings"
                summary={
                  (shared.sessionEmbeddingTokens?.length ?? 0) > 0
                    ? `${shared.sessionEmbeddingTokens?.length} selected`
                    : 'SD/SDXL textual inversion'
                }
                defaultOpen={advancedOpenByDefault}
                persistKey="shared-embeddings"
              >
                <EmbeddingSessionChips
                  model={shared.model}
                  selected={shared.sessionEmbeddingTokens ?? []}
                  onChange={names => {
                    if (onSharedSettingsChange) {
                      onSharedSettingsChange({ sessionEmbeddingTokens: names });
                    } else {
                      saveSharedSettings({
                        ...loadSettingsCache().shared,
                        sessionEmbeddingTokens: names,
                      });
                    }
                  }}
                />
              </CollapsibleSection>
            ) : null}

            {modelSupportsSessionIdentityLock(shared.model) &&
            toolId !== 'video' &&
            toolId !== 'compose' ? (
              <CollapsibleSection
                title="Identity lock"
                summary={
                  shared.ipAdapterImageFilename?.trim()
                    ? `${shared.identityKind === 'instantid' ? 'InstantID' : shared.identityKind === 'pulid' ? 'PuLID' : shared.identityKind === 'auto' ? 'Auto' : 'IP-Adapter'} · ${shared.ipAdapterImageFilename}`
                    : 'Lock a face or style reference'
                }
                defaultOpen={
                  advancedOpenByDefault || Boolean(shared.ipAdapterImageFilename?.trim())
                }
                persistKey="shared-identity-lock"
              >
                <IdentityLockSessionControl
                  model={shared.model}
                  filename={shared.ipAdapterImageFilename}
                  imageUrl={shared.ipAdapterImageUrl}
                  strength={shared.ipAdapterStrength}
                  identityKind={shared.identityKind}
                  onChange={patch => {
                    if (onSharedSettingsChange) {
                      onSharedSettingsChange(patch);
                    } else {
                      saveSharedSettings({
                        ...loadSettingsCache().shared,
                        ...patch,
                      });
                    }
                  }}
                />
              </CollapsibleSection>
            ) : null}

            <CollapsibleSection
              title="Quality & sampling"
              summary={
                systemPathActive
                  ? `Sampler${hasModelSamplerOverrides(samplerOverrides) ? ' · overrides' : ''}, resolution, realism, anatomy.`
                  : `Sampler${hasModelSamplerOverrides(samplerOverrides) ? ' · overrides' : ''}, resolution, queue quality, realism, anatomy.`
              }
              defaultOpen={advancedOpenByDefault}
              persistKey="shared-quality-sampling"
            >
              <ModelSamplerHints
                model={shared.model}
                preset={samplerPreset}
                onPresetChange={handleSamplerPresetChange}
                overrides={samplerOverrides}
                onOverridesChange={handleSamplerOverridesChange}
              />

              <ModelResolutionHints
                model={shared.model}
                orientation={resolutionOrientation}
                sizeTier={resolutionSizeTier}
                onOrientationChange={handleResolutionOrientationChange}
                onSizeTierChange={handleResolutionSizeTierChange}
              />

              {!systemPathActive ? (
                <>
                  <QueueQualityProfileHints
                    profile={queueQualityProfile}
                    samplerPreset={samplerPreset}
                    resolutionSizeTier={resolutionSizeTier}
                    onProfileChange={handleQueueQualityProfileChange}
                    toolId={toolId}
                    toolProfile={toolProfileOverride}
                    onToolProfileChange={handleToolQueueQualityChange}
                  />
                  <p
                    data-testid="queue-seed-quality-clarity"
                    className="rounded-lg border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]"
                  >
                    Queue uses{' '}
                    <span className="font-medium text-[var(--text-primary)]">
                      {queueQualityProfile === 'followSettings'
                        ? 'Follow sidebar'
                        : queueQualityProfile === 'draft'
                          ? 'Draft'
                          : queueQualityProfile === 'final'
                            ? 'Final'
                            : 'Max'}
                    </span>
                    {' · '}
                    {lockedVariationSeed?.trim()
                      ? `pinned seed ${lockedVariationSeed.trim().slice(0, 24)}${lockedVariationSeed.trim().length > 24 ? '…' : ''}`
                      : 'new seed each send'}
                  </p>
                  <QueueRecipesPanel
                    toolId={toolId}
                    shared={recipesShared}
                    qualityProfile={queueQualityProfile}
                    orientation={resolutionOrientation}
                    sizeTier={resolutionSizeTier}
                    onApplied={handleRecipesApplied}
                  />
                </>
              ) : null}

              <RenderRealismHints
                mode={renderRealismMode}
                onModeChange={handleRenderRealismModeChange}
              />

              <AnatomyGuardHints
                mode={anatomyGuardMode}
                onModeChange={handleAnatomyGuardModeChange}
                model={shared.model}
              />

              {recommendFromText ? (
                <ModelRecommenderHints
                  text={recommendFromText}
                  currentModel={shared.model}
                  onApplyModel={model => handleModelChange(model)}
                />
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection
              title="Wildcards & auto-retry"
              summary="Dynamic prompt tokens and OOM/execution_error auto-retry."
              defaultOpen={false}
              persistKey="shared-wildcards-oom-retry"
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={expandWildcards}
                  onChange={e => handleExpandWildcardsChange(e.target.checked)}
                  className={checkboxClass}
                />
                <span className="space-y-1">
                  <span className="type-heading block">Expand wildcards</span>
                  <span className="type-caption block">
                    Replace <code>__color__</code> / <code>{'{a|b|c}'}</code> style tokens in the
                    prompt before queueing.
                  </span>
                </span>
              </label>

              {expandWildcards && (
                <div className="space-y-2 pl-7">
                  <FieldLabel hint="Same seed always expands the same way — leave blank for a fresh random roll each queue.">
                    Wildcard seed (optional)
                  </FieldLabel>
                  <input
                    type="text"
                    value={wildcardSeed}
                    onChange={e => handleWildcardSeedChange(e.target.value)}
                    placeholder="e.g. my-batch-01"
                    className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
                  />
                  {textHasWildcardTokens(wildcardPreviewText ?? recommendFromText) ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const source = (wildcardPreviewText ?? recommendFromText ?? '').trim();
                            if (!source) {
                              setWildcardPreview(null);
                              return;
                            }
                            const seed =
                              wildcardSeed.trim() || `preview-${Math.floor(Math.random() * 1e9)}`;
                            setWildcardPreview(
                              expandWildcardText(source, {
                                seed,
                                wildcards: shared.wildcardLists,
                              })
                            );
                          }}
                        >
                          {wildcardPreview ? 'Roll again' : 'Preview expand'}
                        </Button>
                        {wildcardPreview ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void navigator.clipboard.writeText(wildcardPreview);
                            }}
                          >
                            Copy preview
                          </Button>
                        ) : null}
                      </div>
                      {wildcardPreview ? (
                        <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                          {wildcardPreview}
                        </pre>
                      ) : null}
                    </div>
                  ) : (
                    <p className="type-caption text-[var(--text-muted)]">
                      Add <code>__list__</code> or <code>{'{a|b}'}</code> tokens to the draft/hints
                      to preview expansion here.
                    </p>
                  )}
                </div>
              )}

              <FieldDivider />

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={autoRetryOnOom}
                  onChange={e => handleAutoRetryOnOomChange(e.target.checked)}
                  className={checkboxClass}
                />
                <span className="space-y-1">
                  <span className="type-heading block">Auto-retry on OOM</span>
                  <span className="type-caption block">
                    When a Max/Final gallery job fails with an OOM/CUDA/execution_error,
                    automatically re-queue it once.
                  </span>
                </span>
              </label>

              <label
                className={`flex items-start gap-3 ${
                  autoRetryOnOom ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={oomRetryDowngrade}
                  disabled={!autoRetryOnOom}
                  onChange={e => handleOomRetryDowngradeChange(e.target.checked)}
                  className={checkboxClass}
                />
                <span className="space-y-1">
                  <span className="type-heading block">Downgrade quality on retry</span>
                  <span className="type-caption block">
                    Max → Final / Final → Draft on the same host; if a pool has multiple endpoints,
                    an alternate one is also tried.
                  </span>
                </span>
              </label>
            </CollapsibleSection>

            {(showWardrobeOption && onAlwaysIncludeClothingChange) ||
            onSeedLlmWithIngredientsChange ? (
              <>
                <FieldDivider />
                {onSeedLlmWithIngredientsChange ? (
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={seedLlmWithIngredients}
                      onChange={e => onSeedLlmWithIngredientsChange(e.target.checked)}
                      className={checkboxClass}
                    />
                    <span className="space-y-1">
                      <span className="type-heading block">Seed LLM with location & wardrobe</span>
                      <span className="type-caption block">
                        When on, injects rolled location / outfit / environment ingredients and
                        few-shot examples. Turn off for completionist local models — only your
                        keywords or hints go to the LLM.
                      </span>
                    </span>
                  </label>
                ) : null}
                {showWardrobeOption && onAlwaysIncludeClothingChange ? (
                  <label
                    className={`flex cursor-pointer items-start gap-3 ${
                      onSeedLlmWithIngredientsChange ? 'mt-3' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={alwaysIncludeClothing}
                      disabled={onSeedLlmWithIngredientsChange ? !seedLlmWithIngredients : false}
                      onChange={e => onAlwaysIncludeClothingChange(e.target.checked)}
                      className={checkboxClass}
                    />
                    <span className="space-y-1">
                      <span className="type-heading block">Always include wardrobe</span>
                      <span className="type-caption block">
                        {wardrobeHelp ??
                          'Rolls catalog outfits for people in the prompt and appends assigned clothing if the model omits it.'}
                      </span>
                    </span>
                  </label>
                ) : null}
              </>
            ) : null}

            {(lockedWardrobeId ||
              lockedLocation ||
              lockedVariationSeed ||
              onAutoFixRulesChange) && (
              <CollapsibleSection
                title="Pins & automation"
                summary="Locked scene ingredients and post-generation fixes."
                persistKey="shared-pins-automation"
                defaultOpen={Boolean(lockedWardrobeId || lockedLocation || lockedVariationSeed)}
              >
                {lockedWardrobeId && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-caption rounded-[var(--radius-full)] border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2.5 py-1 text-[var(--tint-info-text)]">
                      Locked kit: {lockedWardrobeLabel ?? lockedWardrobeId}
                    </span>
                    {onClearLockedWardrobe && (
                      <Button
                        variant="ghost"
                        onClick={onClearLockedWardrobe}
                        className="!min-h-8 px-2 type-caption"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                )}

                {lockedLocation && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-caption rounded-[var(--radius-full)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-1 text-[var(--tint-warning-text)]">
                      Locked location: {lockedLocation}
                    </span>
                    {onClearLockedLocation && (
                      <Button
                        variant="ghost"
                        onClick={onClearLockedLocation}
                        className="!min-h-8 px-2 type-caption"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                )}

                {lockedVariationSeed && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="type-caption max-w-full truncate rounded-[var(--radius-full)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-[var(--accent-text)]"
                      title={lockedVariationSeed}
                    >
                      {PINNED_VARIATION_SEED_LABEL}:{' '}
                      {lockedVariationSeed.length > 48
                        ? `${lockedVariationSeed.slice(0, 48)}…`
                        : lockedVariationSeed}
                    </span>
                    {onClearLockedVariationSeed && (
                      <Button
                        variant="ghost"
                        onClick={onClearLockedVariationSeed}
                        className="!min-h-8 px-2 type-caption"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                )}

                {onAutoFixRulesChange && (
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={autoFixRules}
                      onChange={e => onAutoFixRulesChange(e.target.checked)}
                      className={checkboxClass}
                    />
                    <span className="space-y-1">
                      <span className="type-heading block">Auto-fix lint errors</span>
                      <span className="type-caption block">
                        After generation, apply rule-based fixes when lint reports errors.
                      </span>
                    </span>
                  </label>
                )}

                {onActiveCharacterDescriptorChange && (
                  <div className="space-y-2">
                    <FieldLabel hint="Injected into Character generation as a mandatory descriptor.">
                      Active character descriptor
                    </FieldLabel>
                    <textarea
                      value={activeCharacterDescriptor ?? ''}
                      onChange={event => onActiveCharacterDescriptorChange(event.target.value)}
                      rows={3}
                      placeholder="e.g. athletic woman, mid-20s, short copper hair, green eyes"
                      className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
                    />
                  </div>
                )}
              </CollapsibleSection>
            )}
          </>
        );

        if (!showsAdvancedShell) {
          return advancedSections;
        }

        return (
          <CollapsibleSection
            title="Advanced settings"
            summary="Queue quality, workflow, LoRA, sampling, wildcards, and automation."
            defaultOpen={false}
            persistKey="shared-advanced-settings"
          >
            {advancedSections}
          </CollapsibleSection>
        );
      })()}
    </div>
  );
}

function DiffusersSamplingReadout({
  model,
  checkpointMap,
  toolId,
  workshopCrop,
}: {
  model: ComfyImageModel;
  checkpointMap?: Partial<Record<string, string>>;
  toolId?: string;
  workshopCrop: 'auto' | 'always' | 'never';
}) {
  const params = resolveQueueParams({ model, tool: toolId ?? 'generate' });
  const checkpoint = resolveDiffusersModelHint(model, checkpointMap);
  const steps = typeof params.steps === 'number' ? params.steps : Number(params.steps) || 40;
  const cfg = typeof params.cfg === 'number' ? params.cfg : Number(params.cfg) || 5.5;
  const width = typeof params.width === 'number' ? params.width : Number(params.width) || 1024;
  const height = typeof params.height === 'number' ? params.height : Number(params.height) || 1024;
  const seed =
    params.seed === undefined || params.seed === '' || params.seed === -1
      ? 'random'
      : String(params.seed);
  const cropLabel =
    workshopCrop === 'always'
      ? 'crop hands'
      : workshopCrop === 'never'
        ? 'allow hands'
        : 'auto crop';
  return (
    <p className="rounded-lg border border-[var(--border-default)]/60 bg-[var(--bg-base)]/50 px-3 py-2 text-xs leading-relaxed text-[var(--text-muted)]">
      Diffusers · <span className="text-[var(--text-primary)]">{checkpoint}</span>
      {' · '}
      {width}×{height} · {steps} steps · CFG {cfg}
      {' · '}
      seed {seed} · {cropLabel}
    </p>
  );
}
