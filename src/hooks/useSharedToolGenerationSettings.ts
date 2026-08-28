'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
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
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { isBrowserStorageReady, whenBrowserStorageReady } from '@/lib/browser-storage';
import {
  resolveEffectiveSessionLoraStrengthOverrides,
  resolveLoraIdsForModelSelection,
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
  type SessionActiveLoraIdsByModel,
  type SessionLoraStrengthOverridesByModel,
} from '@/lib/model-lora-map';
import {
  normalizeSessionLoraStrengthOverrides,
  type SessionLoraStrengthOverrides,
} from '@/lib/lora-stack';

export type UseSharedToolGenerationSettingsOptions = {
  shared: SharedToolSettings;
  toolId?: string;
  onModelChange: (model: SharedToolSettings['model']) => void;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
};

export type UseSharedToolGenerationSettingsResult = {
  samplerPreset: ModelSamplerPresetTier;
  samplerOverrides: ModelSamplerOverrideFields;
  resolutionOrientation: ResolutionOrientation;
  resolutionSizeTier: ResolutionSizeTier;
  renderRealismMode: RenderRealismMode;
  anatomyGuardMode: AnatomyGuardMode;
  queueQualityProfile: QueueQualityProfile;
  expandWildcards: boolean;
  wildcardSeed: string;
  wildcardPreview: string | null;
  setWildcardPreview: (value: string | null) => void;
  autoRetryOnOom: boolean;
  oomRetryDowngrade: boolean;
  lastLookRecipe: SessionRecipe | null;
  sessionActiveLoraIds: string[] | undefined;
  sessionActiveLoraIdsByModel: SessionActiveLoraIdsByModel;
  sessionLoraStrengthOverrides: SessionLoraStrengthOverrides;
  sessionLoraStrengthOverridesByModel: SessionLoraStrengthOverridesByModel;
  setSessionActiveLoraIds: Dispatch<SetStateAction<string[] | undefined>>;
  setSessionLoraStrengthOverrides: Dispatch<SetStateAction<SessionLoraStrengthOverrides>>;
  handleSessionActiveLoraIdsChange: (ids: string[] | undefined) => void;
  handleSessionLoraStrengthOverridesChange: (overrides: SessionLoraStrengthOverrides) => void;
  handleSamplerPresetChange: (preset: ModelSamplerPresetTier) => void;
  handleSamplerOverridesChange: (overrides: ModelSamplerOverrideFields) => void;
  handleResolutionOrientationChange: (orientation: ResolutionOrientation) => void;
  handleResolutionSizeTierChange: (tier: ResolutionSizeTier) => void;
  handleRenderRealismModeChange: (mode: RenderRealismMode) => void;
  handleAnatomyGuardModeChange: (mode: AnatomyGuardMode) => void;
  handleQueueQualityProfileChange: (profile: QueueQualityProfile) => void;
  handleExpandWildcardsChange: (value: boolean) => void;
  handleWildcardSeedChange: (value: string) => void;
  handleAutoRetryOnOomChange: (value: boolean) => void;
  handleOomRetryDowngradeChange: (value: boolean) => void;
  toolProfileOverride: QueueQualityProfile | undefined;
  handleToolQueueQualityChange: (profile: QueueQualityProfile | undefined) => void;
  handleRecipesApplied: (next: SharedToolSettings) => void;
  recipesShared: SharedToolSettings;
};

export function useSharedToolGenerationSettings({
  shared,
  toolId,
  onModelChange,
  onSharedSettingsChange,
}: UseSharedToolGenerationSettingsOptions): UseSharedToolGenerationSettingsResult {
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

  return {
    samplerPreset,
    samplerOverrides,
    resolutionOrientation,
    resolutionSizeTier,
    renderRealismMode,
    anatomyGuardMode,
    queueQualityProfile,
    expandWildcards,
    wildcardSeed,
    wildcardPreview,
    setWildcardPreview,
    autoRetryOnOom,
    oomRetryDowngrade,
    lastLookRecipe,
    sessionActiveLoraIds,
    sessionActiveLoraIdsByModel,
    sessionLoraStrengthOverrides,
    sessionLoraStrengthOverridesByModel,
    setSessionActiveLoraIds,
    setSessionLoraStrengthOverrides,
    handleSessionActiveLoraIdsChange,
    handleSessionLoraStrengthOverridesChange,
    handleSamplerPresetChange,
    handleSamplerOverridesChange,
    handleResolutionOrientationChange,
    handleResolutionSizeTierChange,
    handleRenderRealismModeChange,
    handleAnatomyGuardModeChange,
    handleQueueQualityProfileChange,
    handleExpandWildcardsChange,
    handleWildcardSeedChange,
    handleAutoRetryOnOomChange,
    handleOomRetryDowngradeChange,
    toolProfileOverride,
    handleToolQueueQualityChange,
    handleRecipesApplied,
    recipesShared,
  };
}
