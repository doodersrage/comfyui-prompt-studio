'use client';

import { useSharedToolModelWorkflow } from '@/hooks/useSharedToolModelWorkflow';
import { getDetailLimits } from '@/lib/detail-level';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
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
  type QueueQualityProfile,
} from '@/lib/queue-quality-profile';
import { normalizeRenderRealismMode, type RenderRealismMode } from '@/lib/render-realism';
import type { SharedToolSettings } from '@/lib/settings-cache';
import {
  SETTINGS_CACHE_UPDATED_EVENT,
  loadSettingsCache,
  saveSessionLoraSelectionNow,
  saveSharedSettings,
} from '@/lib/settings-cache';
import {
  latestGenerateLookRecipe,
  SESSION_RECIPES_UPDATED_EVENT,
  type SessionRecipe,
} from '@/lib/session-recipes';

import { accentRingClass } from '@/lib/tool-theme';
import { useEffect, useMemo, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { isBrowserStorageReady } from '@/lib/browser-storage';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { workspaceControlsDefaultOpen } from '@/lib/workspace-mode';
import {
  resolveEffectiveSessionLoraStrengthOverrides,
  resolveLoraIdsForModelSelection,
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
  type SessionActiveLoraIdsByModel,
  type SessionLoraStrengthOverridesByModel,
} from '@/lib/model-lora-map';
import SharedModelSurface from '@/components/shared-tool-controls/SharedModelSurface';
import SharedPrimaryControls from '@/components/shared-tool-controls/SharedPrimaryControls';
import SharedToolAdvancedCollapsible from '@/components/shared-tool-controls/SharedToolAdvancedCollapsible';
import type { SharedToolControlsProps } from '@/components/shared-tool-controls/types';
import {
  normalizeSessionLoraStrengthOverrides,
  type SessionLoraStrengthOverrides,
} from '@/lib/lora-stack';

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

  const {
    storageReady,
    workflowSelection,
    selectedWorkflowId,
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
  } = useSharedToolModelWorkflow({
    shared,
    toolId,
    preferEditModels,
    queueQualityProfile,
    samplerPreset,
    resolutionSizeTier,
    onModelChange,
    onWorkflowPresetChange,
    onSharedSettingsChange,
    setSessionActiveLoraIds,
    setSessionLoraStrengthOverrides,
  });

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
      <SharedModelSurface
        shared={shared}
        cloudEngine={cloudEngine}
        systemPathActive={systemPathActive}
        roleplayVariant={roleplayVariant}
        toolId={toolId}
        diffusersSelectedAssetId={diffusersSelectedAssetId}
        onDiffusersAssetChange={handleDiffusersAssetChange}
        pickerModels={pickerModels}
        modelFilterHint={modelFilterHint}
        categoryLocked={categoryLocked}
        showAllModelsOverride={showAllModelsOverride}
        supportedModelsSource={supportedModels.source}
        onShowAllModels={handleShowAllModels}
        onModelChange={handleModelChange}
        onCharacterModelChange={onModelChange}
        recommendFromText={recommendFromText}
        onSharedSettingsChange={onSharedSettingsChange}
        selectedWorkflowJson={selectedWorkflowJson}
      />

      <SharedPrimaryControls
        roleplayVariant={roleplayVariant}
        shared={shared}
        detailHelp={detailHelp}
        modelLabel={selectedModel.label}
        activeLimits={activeLimits}
        onDetailChange={onDetailChange}
        queueQualityProfile={queueQualityProfile}
        onQueueQualityProfileChange={handleQueueQualityProfileChange}
        systemPathActive={systemPathActive}
        systemQualityHint={systemQualityHint}
        lastLookRecipe={lastLookRecipe}
        onRecipesApplied={handleRecipesApplied}
        toolId={toolId}
        onSharedSettingsChange={onSharedSettingsChange}
      />

      <SharedToolAdvancedCollapsible
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
        selectedWorkflowId={selectedWorkflowId}
        systemWorkflowChoice={systemWorkflowChoice}
        workflowSelection={workflowSelection}
        workflowManualOverrideRef={workflowManualOverrideRef}
        onWorkflowPresetChange={onWorkflowPresetChange}
      />
    </div>
  );
}
