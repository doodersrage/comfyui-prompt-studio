"use client";

import dynamic from "next/dynamic";
import ModelSelector from "@/components/ModelSelector";
import { useComfyWorkflowSelection } from "@/hooks/useComfyWorkflowSelection";
import type { DetailLevel } from "@/lib/detail-level";
import { getDetailLimits } from "@/lib/detail-level";
import {
  getComfyModelDefinition,
  COMFY_IMAGE_MODELS,
  type ComfyImageModel,
} from "@/lib/comfy-models/client";
import {
  modelsSupportedByAvailableWorkflows,
  resolveWorkflowForModelSelection,
  suggestWorkflowMapForFiles,
  supportedModelsFilterHint,
} from "@/lib/model-workflow-map";
import {
  filterModelsForQueueTool,
  isSceneGenerationModel,
  resolveTxt2iCounterpartForGenerate,
  shouldUseSceneGenerationModel,
  toolIgnoresSystemWorkflowSnap,
} from "@/lib/queue-tool-model";
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from "@/lib/model-sampler-defaults";
import {
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from "@/lib/model-resolution-defaults";
import {
  normalizeAnatomyGuardMode,
  type AnatomyGuardMode,
} from "@/lib/anatomy-guard";
import {
  normalizeQueueQualityProfile,
  formatQueueQualityProfileHint,
  type QueueQualityProfile,
} from "@/lib/queue-quality-profile";
import {
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from "@/lib/render-realism";
import type { SharedToolSettings } from "@/lib/settings-cache";
import {
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from "@/lib/settings-cache";
import {
  describeSystemWorkflowChoice,
  isSystemWorkflowSupportedModel,
  listSystemWorkflowSupportedModels,
  resolveSystemWorkflowFallbackModel,
} from "@/lib/system-workflow-runtime";
import { readCachedComfyObjectInfoModels } from "@/lib/comfyui-object-info-cache";
import { scanAndAdaptSystemWorkflowInventory } from "@/lib/comfyui-runtime-for-model";
import { loadComfyWorkflowFiles } from "@/lib/comfyui-workflow-files";
import { PINNED_VARIATION_SEED_LABEL } from "@/lib/tool-ui-labels";
import { accentRingClass } from "@/lib/tool-theme";
import { CollapsibleSection } from "@/components/ui/ToolPageShell";
import { ChipButton, FieldDivider, FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { useWorkspaceMode } from "@/hooks/useWorkspaceMode";
import {
  workspaceControlsDefaultOpen,
  workspaceShowsAdvancedControls,
} from "@/lib/workspace-mode";
import { resolveModelStackFamily } from "@/lib/workflow-stack-fingerprint";
import { isQwenLightningModel } from "@/lib/model-sampling-patch";
import {
  expandWildcardText,
  textHasWildcardTokens,
} from "@/lib/wildcard-expand";
import LoraStackSessionPicker from "@/components/LoraStackSessionPicker";
import {
  hasSessionLoraIdsForModel,
  resolveLoraIdsForModelSelection,
  setSessionLoraIdsForModel,
  type SessionActiveLoraIdsByModel,
} from "@/lib/model-lora-map";

const ComfyWorkflowSelector = dynamic(
  () => import("@/components/ComfyWorkflowSelector"),
  { ssr: false, loading: () => null },
);
const ModelRecommenderHints = dynamic(
  () => import("@/components/ModelRecommenderHints"),
  { ssr: false, loading: () => null },
);
const ModelSamplerHints = dynamic(
  () => import("@/components/ModelSamplerHints"),
  { ssr: false, loading: () => null },
);
const ModelResolutionHints = dynamic(
  () => import("@/components/ModelResolutionHints"),
  { ssr: false, loading: () => null },
);
const RenderRealismHints = dynamic(
  () => import("@/components/RenderRealismHints"),
  { ssr: false, loading: () => null },
);
const AnatomyGuardHints = dynamic(
  () => import("@/components/AnatomyGuardHints"),
  { ssr: false, loading: () => null },
);
const QueueQualityProfileHints = dynamic(
  () => import("@/components/QueueQualityProfileHints"),
  { ssr: false, loading: () => null },
);
const QueueRecipesPanel = dynamic(
  () => import("@/components/QueueRecipesPanel"),
  { ssr: false, loading: () => null },
);

type SharedToolControlsProps = {
  shared: SharedToolSettings;
  onModelChange: (model: SharedToolSettings["model"]) => void;
  onDetailChange: (detail: DetailLevel) => void;
  detailHelp?: string;
  showWardrobeOption?: boolean;
  alwaysIncludeClothing?: boolean;
  onAlwaysIncludeClothingChange?: (value: boolean) => void;
  wardrobeHelp?: string;
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
  const showAdvancedInline = workspaceShowsAdvancedControls(workspaceMode);
  const advancedOpenByDefault = workspaceControlsDefaultOpen(workspaceMode);
  const selectedModel = getComfyModelDefinition(shared.model);
  const activeLimits = getDetailLimits(shared.detail, shared.model);
  const workflowSelection = useComfyWorkflowSelection();
  const checkboxClass = `mt-1 h-4 w-4 rounded-[var(--radius-sm)] border-[var(--border-default)] bg-[var(--bg-muted)] ${accentRingClass()}`;
  const [samplerPreset, setSamplerPreset] = useState<ModelSamplerPresetTier>(() =>
    normalizeModelSamplerPresetTier(shared.modelSamplerPreset),
  );
  const [resolutionOrientation, setResolutionOrientation] = useState<ResolutionOrientation>(() =>
    normalizeResolutionOrientation(shared.modelResolutionOrientation),
  );
  const [resolutionSizeTier, setResolutionSizeTier] = useState<ResolutionSizeTier>(() =>
    normalizeResolutionSizeTier(shared.modelResolutionSizeTier),
  );
  const [renderRealismMode, setRenderRealismMode] = useState<RenderRealismMode>(() =>
    normalizeRenderRealismMode(shared.renderRealismMode),
  );
  const [anatomyGuardMode, setAnatomyGuardMode] = useState<AnatomyGuardMode>(() =>
    normalizeAnatomyGuardMode(shared.anatomyGuardMode),
  );
  const [queueQualityProfile, setQueueQualityProfile] = useState<QueueQualityProfile>(() =>
    normalizeQueueQualityProfile(shared.queueQualityProfile),
  );
  const [showAllModelsOverride, setShowAllModelsOverride] = useState(
    () => shared.showAllModelsOverride === true,
  );
  const [expandWildcards, setExpandWildcards] = useState(
    () => shared.expandWildcards !== false,
  );
  const [wildcardSeed, setWildcardSeed] = useState(() => shared.wildcardSeed ?? "");
  const [wildcardPreview, setWildcardPreview] = useState<string | null>(null);
  const [autoRetryOnOom, setAutoRetryOnOom] = useState(
    () => shared.autoRetryOnOom !== false,
  );
  const [oomRetryDowngrade, setOomRetryDowngrade] = useState(
    () => shared.oomRetryDowngrade !== false,
  );
  const [sessionActiveLoraIds, setSessionActiveLoraIds] = useState<
    string[] | undefined
  >(undefined);
  const [sessionActiveLoraIdsByModel, setSessionActiveLoraIdsByModel] =
    useState<SessionActiveLoraIdsByModel>({});

  const workflowCatalog = useMemo(
    () => [
      ...workflowSelection.localFiles,
      ...workflowSelection.serverFiles.map((entry) => ({
        id: entry.id,
        name: entry.name,
        filename: `${entry.name}.json`,
        workflowJson: "",
      })),
    ],
    [workflowSelection.localFiles, workflowSelection.serverFiles],
  );

  const suggestedWorkflowMap = useMemo(
    () => suggestWorkflowMapForFiles(workflowCatalog),
    [workflowCatalog],
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
    [shared.model, shared.modelWorkflowMap, suggestedWorkflowMap, toolId, workflowCatalog],
  );

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
    ],
  );

  const pickerModels = useMemo(() => {
    const filtered = filterModelsForQueueTool(supportedModels.models, toolId, {
      includeEditModels: showAllModelsOverride,
    });
    const base =
      filtered.length > 0
        ? filtered
        : toolId && shouldUseSceneGenerationModel(toolId)
          ? COMFY_IMAGE_MODELS.filter((entry) =>
              isSceneGenerationModel(entry.id),
            ).map((entry) => entry.id)
          : supportedModels.models;

    if (
      shared.useSystemWorkflows !== true ||
      toolIgnoresSystemWorkflowSnap(toolId)
    ) {
      return base.length > 0 ? base : supportedModels.models;
    }

    const systemOnly = base.filter((model) => isSystemWorkflowSupportedModel(model));
    if (systemOnly.length > 0) {
      return systemOnly;
    }
    return listSystemWorkflowSupportedModels().filter((model) =>
      filterModelsForQueueTool([model], toolId, {
        includeEditModels: showAllModelsOverride,
      }).includes(model),
    );
  }, [
    showAllModelsOverride,
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
  const lastModelStackFamilyRef = useRef(
    resolveModelStackFamily(shared.model),
  );

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
      if (
        mappedId &&
        mappedId !== workflowId &&
        isQwenLightningModel(model)
      ) {
        saveSharedSettings({
          ...loadSettingsCache().shared,
          modelWorkflowMap: {
            ...shared.modelWorkflowMap,
            [model]: workflowId,
          },
        });
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
    ],
  );

  const handleModelChange = useCallback(
    (model: ComfyImageModel) => {
      const nextStackFamily = resolveModelStackFamily(model);
      const stackFamilyChanged =
        lastModelStackFamilyRef.current !== "unknown" &&
        nextStackFamily !== "unknown" &&
        lastModelStackFamilyRef.current !== nextStackFamily;
      if (stackFamilyChanged) {
        workflowManualOverrideRef.current = false;
      }
      lastModelStackFamilyRef.current = nextStackFamily;

      if (showAllModelsOverride) {
        setShowAllModelsOverride(false);
        saveSharedSettings({
          ...loadSettingsCache().shared,
          showAllModelsOverride: false,
        });
      }
      onModelChange(model);
      applyWorkflowForModel(model, stackFamilyChanged);

      // Swap LoRA stack to this model's stored picks (or map defaults).
      const sharedNow = loadSettingsCache().shared;
      if (sharedNow.autoSelectLorasForModel !== false) {
        const nextIds = resolveLoraIdsForModelSelection(model, {
          sessionActiveLoraIdsByModel: sharedNow.sessionActiveLoraIdsByModel,
          modelLoraMap: sharedNow.modelLoraMap,
        });
        setSessionActiveLoraIds(nextIds);
        saveSharedSettings({
          ...loadSettingsCache().shared,
          sessionActiveLoraIds: nextIds,
        });
        onSharedSettingsChange?.({ sessionActiveLoraIds: nextIds });
      }
    },
    [
      applyWorkflowForModel,
      onModelChange,
      onSharedSettingsChange,
      showAllModelsOverride,
    ],
  );

  const handleShowAllModels = useCallback(() => {
    setShowAllModelsOverride(true);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      showAllModelsOverride: true,
    });
  }, []);

  // System workflows only support FLUX / Qwen / video scaffolds — snap off unsupported picks.
  // Audio/mesh tools keep their own categories; snapping them to FLUX fights tool model locks
  // and can infinite-loop (Maximum update depth).
  useEffect(() => {
    if (shared.useSystemWorkflows !== true || toolIgnoresSystemWorkflowSnap(toolId)) {
      return;
    }
    if (isSystemWorkflowSupportedModel(shared.model)) {
      return;
    }
    const fallback =
      pickerModels.find((model) => isSystemWorkflowSupportedModel(model)) ??
      resolveSystemWorkflowFallbackModel(shared.model);
    if (fallback !== shared.model) {
      onModelChange(fallback);
    }
  }, [
    onModelChange,
    pickerModels,
    shared.model,
    shared.useSystemWorkflows,
    toolId,
  ]);

  const [inventoryTick, setInventoryTick] = useState(0);

  useEffect(() => {
    if (shared.useSystemWorkflows !== true) {
      return;
    }
    let cancelled = false;
    const runScan = () => {
      void scanAndAdaptSystemWorkflowInventory({ persist: true }).then(
        (models) => {
          if (!cancelled && models) {
            setInventoryTick((value) => value + 1);
          }
        },
      );
    };
    let cancelIdle: (() => void) | undefined;
    if (typeof window.requestIdleCallback === "function") {
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
  }, [shared.useSystemWorkflows, shared.model]);

  const videoInitKey =
    toolId === "video"
      ? loadToolSettings("video", DEFAULT_VIDEO_TOOL_CACHE).initImageUrl?.trim() ??
        ""
      : "";

  const systemWorkflowChoice = useMemo(() => {
    if (shared.useSystemWorkflows !== true) {
      return null;
    }
    try {
      const preferI2v =
        getComfyModelDefinition(shared.model)?.category === "video" &&
        Boolean(videoInitKey);
      return describeSystemWorkflowChoice(
        shared.model,
        loadComfyWorkflowFiles(),
        readCachedComfyObjectInfoModels(),
        { preferI2v, tool: toolId },
      );
    } catch {
      return {
        source: "scaffold" as const,
        label: "Built-in scaffold",
        reason: "no-worthy-pack" as const,
        display: "Built-in scaffold",
      };
    }
  }, [
    inventoryTick,
    shared.model,
    shared.useSystemWorkflows,
    videoInitKey,
    workflowCatalog,
    toolId,
  ]);

  const systemQualityHint = useMemo(() => {
    if (shared.useSystemWorkflows !== true) {
      return null;
    }
    if (
      queueQualityProfile !== "draft" &&
      queueQualityProfile !== "final" &&
      queueQualityProfile !== "max"
    ) {
      return null;
    }
    return formatQueueQualityProfileHint(
      queueQualityProfile,
      samplerPreset,
      resolutionSizeTier,
      { model: shared.model },
    );
  }, [
    queueQualityProfile,
    resolutionSizeTier,
    samplerPreset,
    shared.model,
    shared.useSystemWorkflows,
  ]);

  const modelFilterHint =
    shared.useSystemWorkflows === true
      ? `System scaffolds cover FLUX, Qwen, and video (${pickerModels.length} models).`
      : supportedModelsFilterHint(
          supportedModels.source,
          supportedModels.models.length,
        );

  useEffect(() => {
    // Respect a persisted library/picker selection — do not replace it with auto-ranked defaults.
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
      setWorkflowSelectedIdRef.current(mappedWorkflowForModel);
      onWorkflowPresetChangeRef.current?.(mappedWorkflowForModel);
    });
  }, [
    mappedWorkflowForModel,
    selectedWorkflowId,
    shared.autoSelectWorkflowForModel,
    workflowSelection.mounted,
  ]);

  // Batch mirrored shared settings into one post-commit update to avoid a
  // cascade of re-renders when useCachedSettings hydrates.
  useEffect(() => {
    scheduleAfterCommit(() => {
      setSamplerPreset(normalizeModelSamplerPresetTier(shared.modelSamplerPreset));
      setResolutionOrientation(
        normalizeResolutionOrientation(shared.modelResolutionOrientation),
      );
      setResolutionSizeTier(
        normalizeResolutionSizeTier(shared.modelResolutionSizeTier),
      );
      setRenderRealismMode(normalizeRenderRealismMode(shared.renderRealismMode));
      setAnatomyGuardMode(normalizeAnatomyGuardMode(shared.anatomyGuardMode));
      setQueueQualityProfile(
        normalizeQueueQualityProfile(shared.queueQualityProfile),
      );
      setShowAllModelsOverride(shared.showAllModelsOverride === true);
      setExpandWildcards(shared.expandWildcards !== false);
      setWildcardSeed(shared.wildcardSeed ?? "");
      setAutoRetryOnOom(shared.autoRetryOnOom !== false);
      setOomRetryDowngrade(shared.oomRetryDowngrade !== false);
      setSessionActiveLoraIdsByModel(shared.sessionActiveLoraIdsByModel ?? {});
      setSessionActiveLoraIds(
        resolveLoraIdsForModelSelection(shared.model, {
          sessionActiveLoraIdsByModel: shared.sessionActiveLoraIdsByModel,
          modelLoraMap: shared.modelLoraMap,
          sessionActiveLoraIds: shared.sessionActiveLoraIds,
        }),
      );
    });
  }, [
    shared.modelSamplerPreset,
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
    shared.modelLoraMap,
    shared.model,
  ]);

  const handleSessionActiveLoraIdsChange = (ids: string[] | undefined) => {
    const modelId = shared.model;
    const nextByModel = setSessionLoraIdsForModel(
      loadSettingsCache().shared.sessionActiveLoraIdsByModel,
      modelId,
      ids,
    );
    // When clearing to defaults, mirror the resolved defaults for the current model.
    const mirrored =
      ids !== undefined
        ? ids
        : resolveLoraIdsForModelSelection(modelId, {
            sessionActiveLoraIdsByModel: nextByModel,
            modelLoraMap: loadSettingsCache().shared.modelLoraMap,
          });
    setSessionActiveLoraIds(mirrored);
    setSessionActiveLoraIdsByModel(nextByModel);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      sessionActiveLoraIds: mirrored,
      sessionActiveLoraIdsByModel: nextByModel,
    });
    onSharedSettingsChange?.({
      sessionActiveLoraIds: mirrored,
      sessionActiveLoraIdsByModel: nextByModel,
    });
  };
  const handleSamplerPresetChange = (preset: ModelSamplerPresetTier) => {
    setSamplerPreset(preset);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      modelSamplerPreset: preset,
    });
  };

  const handleResolutionOrientationChange = (orientation: ResolutionOrientation) => {
    setResolutionOrientation(orientation);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      modelResolutionOrientation: orientation,
    });
  };

  const handleResolutionSizeTierChange = (tier: ResolutionSizeTier) => {
    setResolutionSizeTier(tier);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      modelResolutionSizeTier: tier,
    });
  };

  const handleRenderRealismModeChange = (mode: RenderRealismMode) => {
    setRenderRealismMode(mode);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      renderRealismMode: mode,
    });
  };

  const handleAnatomyGuardModeChange = (mode: AnatomyGuardMode) => {
    setAnatomyGuardMode(mode);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      anatomyGuardMode: mode,
    });
  };

  const handleQueueQualityProfileChange = (profile: QueueQualityProfile) => {
    setQueueQualityProfile(profile);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      queueQualityProfile: profile,
    });
  };

  // Snap Follow sidebar → Final when enabling system workflows (chips need an active profile).
  useEffect(() => {
    if (shared.useSystemWorkflows !== true) {
      return;
    }
    if (normalizeQueueQualityProfile(shared.queueQualityProfile) !== "followSettings") {
      return;
    }
    scheduleAfterCommit(() => {
      handleQueueQualityProfileChange("final");
    });
  }, [shared.queueQualityProfile, shared.useSystemWorkflows]);

  const handleExpandWildcardsChange = (value: boolean) => {
    setExpandWildcards(value);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      expandWildcards: value,
    });
  };

  const handleWildcardSeedChange = (value: string) => {
    setWildcardSeed(value);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      wildcardSeed: value.trim() || undefined,
    });
  };

  const handleAutoRetryOnOomChange = (value: boolean) => {
    setAutoRetryOnOom(value);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      autoRetryOnOom: value,
    });
  };

  const handleOomRetryDowngradeChange = (value: boolean) => {
    setOomRetryDowngrade(value);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      oomRetryDowngrade: value,
    });
  };

  const toolProfileOverride = toolId
    ? shared.toolQueueQualityProfiles?.[toolId]
    : undefined;

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
    saveSharedSettings({
      ...loadSettingsCache().shared,
      toolQueueQualityProfiles: nextProfiles,
    });
    onSharedSettingsChange?.({ toolQueueQualityProfiles: nextProfiles });
  };

  const handleRecipesApplied = (next: SharedToolSettings) => {
    setQueueQualityProfile(
      normalizeQueueQualityProfile(next.queueQualityProfile ?? queueQualityProfile),
    );
    setSamplerPreset(
      normalizeModelSamplerPresetTier(next.modelSamplerPreset ?? samplerPreset),
    );
    setResolutionOrientation(
      normalizeResolutionOrientation(
        next.modelResolutionOrientation ?? resolutionOrientation,
      ),
    );
    setResolutionSizeTier(
      normalizeResolutionSizeTier(next.modelResolutionSizeTier ?? resolutionSizeTier),
    );
    const nextByModel =
      next.sessionActiveLoraIds !== undefined
        ? setSessionLoraIdsForModel(
            next.sessionActiveLoraIdsByModel ??
              loadSettingsCache().shared.sessionActiveLoraIdsByModel,
            next.model,
            next.sessionActiveLoraIds,
          )
        : (next.sessionActiveLoraIdsByModel ??
          loadSettingsCache().shared.sessionActiveLoraIdsByModel);
    setSessionActiveLoraIds(next.sessionActiveLoraIds);
    setSessionActiveLoraIdsByModel(nextByModel ?? {});
    if (next.model !== shared.model) {
      onModelChange(next.model);
    }
    onSharedSettingsChange?.({
      model: next.model,
      queueQualityProfile: next.queueQualityProfile,
      sessionQueueMode: next.sessionQueueMode,
      sessionActiveLoraIds: next.sessionActiveLoraIds,
      sessionActiveLoraIdsByModel: nextByModel,
      modelSamplerPreset: next.modelSamplerPreset,
      modelResolutionOrientation: next.modelResolutionOrientation,
      modelResolutionSizeTier: next.modelResolutionSizeTier,
      editDenoiseStrength: next.editDenoiseStrength,
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
    }),
    [
      shared,
      queueQualityProfile,
      resolutionOrientation,
      resolutionSizeTier,
      sessionActiveLoraIds,
      sessionActiveLoraIdsByModel,
    ],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <FieldLabel
          hint={
            shared.useSystemWorkflows === true
              ? undefined
              : shared.autoSelectWorkflowForModel !== false
                ? "Choosing a model auto-selects its mapped ComfyUI workflow below (when configured)."
                : "Shared across tools and remembered between page reloads."
          }
        >
          {shared.useSystemWorkflows === true ? "Model" : "Target model"}
        </FieldLabel>
        <ModelSelector
          value={shared.model}
          allowedModels={
            pickerModels.length < COMFY_IMAGE_MODELS.length
              ? pickerModels
              : undefined
          }
          filterHint={modelFilterHint}
          onShowAllModels={
            shared.useSystemWorkflows === true ||
            showAllModelsOverride ||
            supportedModels.source === "disabled"
              ? undefined
              : handleShowAllModels
          }
          onChange={handleModelChange}
        />
        {shared.useSystemWorkflows === true ? (
          <div className="space-y-2">
            <FieldLabel hint="Steps, resolution, and polish scale with this choice.">
              Queue quality
            </FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "draft" as const, label: "Draft" },
                  { id: "final" as const, label: "Final" },
                  { id: "max" as const, label: "Max" },
                ] as const
              ).map((option) => (
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
              <p className="text-xs leading-relaxed text-zinc-500">
                {systemQualityHint}
              </p>
            ) : null}
            {systemWorkflowChoice ? (
              <p className="text-xs leading-relaxed text-zinc-500">
                Graph:{" "}
                <span className="text-zinc-300">
                  {systemWorkflowChoice.display}
                </span>
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
          </div>
        ) : null}
        {toolId === "generate" &&
        /qwen-image-edit-2511-lightning/i.test(shared.model) ? (
          <div className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
            <p className="text-xs leading-relaxed text-amber-100/85">
              Edit-2511 Lightning on Generate runs as T2I (reference images
              disconnected). For clean scene generation prefer{" "}
              <span className="font-medium text-amber-50">
                Qwen-Image-2512 Lightning
              </span>
              ; keep Edit Lightning for Refine / img2img.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 text-xs"
              onClick={() =>
                handleModelChange(resolveTxt2iCounterpartForGenerate(shared.model))
              }
            >
              Switch to{" "}
              {
                getComfyModelDefinition(
                  resolveTxt2iCounterpartForGenerate(shared.model),
                ).label
              }
            </Button>
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
              { label: "Concise", value: "concise" },
              { label: "Balanced", value: "balanced" },
              { label: "Rich", value: "rich" },
            ] as const
          ).map((preset) => (
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

      {onWorkflowPresetChange &&
        workflowSelection.mounted &&
        shared.useSystemWorkflows !== true && (
        <ComfyWorkflowSelector
          selectedId={selectedWorkflowId}
          defaultLabel={workflowSelection.defaultLabel}
          localFiles={workflowSelection.localFiles}
          serverFiles={workflowSelection.serverFiles}
          helpText={
            shared.autoSelectWorkflowForModel !== false
              ? "Your picker choice is used at queue time unless Settings → model→workflow map assigns a file for this model."
              : undefined
          }
          onChange={(fileId) => {
            workflowManualOverrideRef.current = true;
            workflowSelection.setSelectedId(fileId);
            onWorkflowPresetChange(fileId);
          }}
        />
      )}

      {(() => {
        const advancedSections = (
          <>
      <CollapsibleSection
        title="LoRA stack"
        summary={
          sessionActiveLoraIds !== undefined
            ? `${sessionActiveLoraIds.length} selected for this model`
            : "Pick LoRAs for this model without trigger keywords"
        }
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
          checkboxClassName={checkboxClass}
          onChange={handleSessionActiveLoraIdsChange}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Quality & sampling"
        summary={
          shared.useSystemWorkflows === true
            ? "Sampler, resolution, realism, and anatomy overrides."
            : "Sampler, resolution, queue quality, realism, anatomy, and model recommendations."
        }
        defaultOpen={advancedOpenByDefault}
        persistKey="shared-quality-sampling"
      >
        <ModelSamplerHints
          model={shared.model}
          preset={samplerPreset}
          onPresetChange={handleSamplerPresetChange}
        />

        <ModelResolutionHints
          model={shared.model}
          orientation={resolutionOrientation}
          sizeTier={resolutionSizeTier}
          onOrientationChange={handleResolutionOrientationChange}
          onSizeTierChange={handleResolutionSizeTierChange}
        />

        {shared.useSystemWorkflows !== true ? (
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
        />

        {recommendFromText ? (
          <ModelRecommenderHints
            text={recommendFromText}
            currentModel={shared.model}
            onApplyModel={(model) => handleModelChange(model)}
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
            onChange={(e) => handleExpandWildcardsChange(e.target.checked)}
            className={checkboxClass}
          />
          <span className="space-y-1">
            <span className="type-heading block">Expand wildcards</span>
            <span className="type-caption block">
              Replace <code>__color__</code> / <code>{"{a|b|c}"}</code> style
              tokens in the prompt before queueing.
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
              onChange={(e) => handleWildcardSeedChange(e.target.value)}
              placeholder="e.g. my-batch-01"
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
            {textHasWildcardTokens(wildcardPreviewText ?? recommendFromText) ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const source = (wildcardPreviewText ?? recommendFromText ?? "").trim();
                      if (!source) {
                        setWildcardPreview(null);
                        return;
                      }
                      const seed =
                        wildcardSeed.trim() ||
                        `preview-${Math.floor(Math.random() * 1e9)}`;
                      setWildcardPreview(
                        expandWildcardText(source, {
                          seed,
                          wildcards: shared.wildcardLists,
                        }),
                      );
                    }}
                  >
                    {wildcardPreview ? "Roll again" : "Preview expand"}
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
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 text-xs leading-relaxed text-zinc-300">
                    {wildcardPreview}
                  </pre>
                ) : null}
              </div>
            ) : (
              <p className="type-caption text-zinc-500">
                Add <code>__list__</code> or <code>{"{a|b}"}</code> tokens to the
                draft/hints to preview expansion here.
              </p>
            )}
          </div>
        )}

        <FieldDivider />

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={autoRetryOnOom}
            onChange={(e) => handleAutoRetryOnOomChange(e.target.checked)}
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
            autoRetryOnOom ? "cursor-pointer" : "cursor-not-allowed opacity-60"
          }`}
        >
          <input
            type="checkbox"
            checked={oomRetryDowngrade}
            disabled={!autoRetryOnOom}
            onChange={(e) => handleOomRetryDowngradeChange(e.target.checked)}
            className={checkboxClass}
          />
          <span className="space-y-1">
            <span className="type-heading block">Downgrade quality on retry</span>
            <span className="type-caption block">
              Max → Final / Final → Draft on the same host; if a pool has
              multiple endpoints, an alternate one is also tried.
            </span>
          </span>
        </label>
      </CollapsibleSection>

      {showWardrobeOption && onAlwaysIncludeClothingChange && (
        <>
          <FieldDivider />
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={alwaysIncludeClothing}
              onChange={(e) => onAlwaysIncludeClothingChange(e.target.checked)}
              className={checkboxClass}
            />
            <span className="space-y-1">
              <span className="type-heading block">Always include wardrobe</span>
              <span className="type-caption block">
                {wardrobeHelp ??
                  "Rolls catalog outfits for people in the prompt and appends assigned clothing if the model omits it."}
              </span>
            </span>
          </label>
        </>
      )}

      {(lockedWardrobeId ||
        lockedLocation ||
        lockedVariationSeed ||
        onAutoFixRulesChange) && (
        <CollapsibleSection
          title="Pins & automation"
          summary="Locked scene ingredients and post-generation fixes."
          persistKey="shared-pins-automation"
          defaultOpen={Boolean(
            lockedWardrobeId || lockedLocation || lockedVariationSeed,
          )}
        >
          {lockedWardrobeId && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-caption rounded-[var(--radius-full)] border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2.5 py-1 text-[var(--tint-info-text)]">
                Locked kit: {lockedWardrobeLabel ?? lockedWardrobeId}
              </span>
              {onClearLockedWardrobe && (
                <Button variant="ghost" onClick={onClearLockedWardrobe} className="!min-h-8 px-2 type-caption">
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
                <Button variant="ghost" onClick={onClearLockedLocation} className="!min-h-8 px-2 type-caption">
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
                {PINNED_VARIATION_SEED_LABEL}:{" "}
                {lockedVariationSeed.length > 48
                  ? `${lockedVariationSeed.slice(0, 48)}…`
                  : lockedVariationSeed}
              </span>
              {onClearLockedVariationSeed && (
                <Button variant="ghost" onClick={onClearLockedVariationSeed} className="!min-h-8 px-2 type-caption">
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
                onChange={(e) => onAutoFixRulesChange(e.target.checked)}
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
                value={activeCharacterDescriptor ?? ""}
                onChange={(event) =>
                  onActiveCharacterDescriptorChange(event.target.value)
                }
                rows={3}
                placeholder="e.g. athletic woman, mid-20s, short copper hair, green eyes"
                className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              />
            </div>
          )}
        </CollapsibleSection>
      )}
          </>
        );

        if (!showAdvancedInline) {
          return (
            <CollapsibleSection
              title="Advanced controls"
              summary="LoRA, sampling, wildcards, pins, and automation."
              defaultOpen={false}
              persistKey="shared-advanced-simple"
            >
              {advancedSections}
            </CollapsibleSection>
          );
        }
        return advancedSections;
      })()}
    </div>
  );
}
