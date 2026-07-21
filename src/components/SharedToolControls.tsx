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
  type QueueQualityProfile,
} from "@/lib/queue-quality-profile";
import {
  normalizeRenderRealismMode,
  type RenderRealismMode,
} from "@/lib/render-realism";
import type { SharedToolSettings } from "@/lib/settings-cache";
import { loadSettingsCache, saveSharedSettings } from "@/lib/settings-cache";
import { PINNED_VARIATION_SEED_LABEL } from "@/lib/tool-ui-labels";
import { accentRingClass } from "@/lib/tool-theme";
import { CollapsibleSection } from "@/components/ui/ToolPageShell";
import { ChipButton, FieldDivider, FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { resolveModelStackFamily } from "@/lib/workflow-stack-fingerprint";

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
  toolId,
  onSharedSettingsChange,
}: SharedToolControlsProps) {
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
        limitEnabled: shared.limitModelsToAvailableWorkflows !== false,
        showAllOverride: showAllModelsOverride,
      }),
    [
      shared.model,
      shared.modelWorkflowMap,
      shared.limitModelsToAvailableWorkflows,
      showAllModelsOverride,
      suggestedWorkflowMap,
      workflowCatalog,
    ],
  );

  const pickerModels = useMemo(() => {
    const filtered = filterModelsForQueueTool(supportedModels.models, toolId, {
      includeEditModels: showAllModelsOverride,
    });
    if (filtered.length > 0) {
      return filtered;
    }
    // Never fall back to an edit-heavy list on Generate — prefer scene models.
    if (toolId && shouldUseSceneGenerationModel(toolId)) {
      const sceneOnly = COMFY_IMAGE_MODELS.filter((entry) =>
        isSceneGenerationModel(entry.id),
      ).map((entry) => entry.id);
      if (sceneOnly.length > 0) {
        return sceneOnly;
      }
    }
    return supportedModels.models;
  }, [
    showAllModelsOverride,
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

      // Heal stale map entries (e.g. Lightning-8 still pointing at vanilla 2512
      // after an earlier bad Suggested assign).
      const mappedId = shared.modelWorkflowMap?.[model]?.trim();
      if (mappedId && mappedId !== workflowId) {
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
    },
    [applyWorkflowForModel, onModelChange, showAllModelsOverride],
  );

  const handleShowAllModels = useCallback(() => {
    setShowAllModelsOverride(true);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      showAllModelsOverride: true,
    });
  }, []);

  const modelFilterHint = supportedModelsFilterHint(
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

  useEffect(() => {
    scheduleAfterCommit(() => {
      setSamplerPreset(normalizeModelSamplerPresetTier(shared.modelSamplerPreset));
    });
  }, [shared.modelSamplerPreset]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setResolutionOrientation(normalizeResolutionOrientation(shared.modelResolutionOrientation));
    });
  }, [shared.modelResolutionOrientation]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setResolutionSizeTier(normalizeResolutionSizeTier(shared.modelResolutionSizeTier));
    });
  }, [shared.modelResolutionSizeTier]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setRenderRealismMode(normalizeRenderRealismMode(shared.renderRealismMode));
    });
  }, [shared.renderRealismMode]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setAnatomyGuardMode(normalizeAnatomyGuardMode(shared.anatomyGuardMode));
    });
  }, [shared.anatomyGuardMode]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setQueueQualityProfile(normalizeQueueQualityProfile(shared.queueQualityProfile));
    });
  }, [shared.queueQualityProfile]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setShowAllModelsOverride(shared.showAllModelsOverride === true);
    });
  }, [shared.showAllModelsOverride]);

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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <FieldLabel
          hint={
            shared.autoSelectWorkflowForModel !== false
              ? "Choosing a model auto-selects its mapped ComfyUI workflow below (when configured)."
              : "Shared across tools and remembered between page reloads."
          }
        >
          Target model
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
            showAllModelsOverride || supportedModels.source === "disabled"
              ? undefined
              : handleShowAllModels
          }
          onChange={handleModelChange}
        />
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

      <QueueQualityProfileHints
        profile={queueQualityProfile}
        samplerPreset={samplerPreset}
        resolutionSizeTier={resolutionSizeTier}
        onProfileChange={handleQueueQualityProfileChange}
        toolId={toolId}
        toolProfile={toolProfileOverride}
        onToolProfileChange={handleToolQueueQualityChange}
      />

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

      <FieldDivider />

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

      {onWorkflowPresetChange && workflowSelection.mounted && (
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
    </div>
  );
}
