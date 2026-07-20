"use client";

import ModelSelector from "@/components/ModelSelector";
import ComfyWorkflowSelector from "@/components/ComfyWorkflowSelector";
import { useComfyWorkflowSelection } from "@/hooks/useComfyWorkflowSelection";
import type { DetailLevel } from "@/lib/detail-level";
import { getDetailLimits } from "@/lib/detail-level";
import ModelRecommenderHints from "@/components/ModelRecommenderHints";
import ModelSamplerHints from "@/components/ModelSamplerHints";
import ModelResolutionHints from "@/components/ModelResolutionHints";
import { getComfyModelDefinition } from "@/lib/comfy-models";
import { patchSharedForModelChange } from "@/lib/model-workflow-map";
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
import type { SharedToolSettings } from "@/lib/settings-cache";
import { loadSettingsCache, saveSharedSettings } from "@/lib/settings-cache";
import { PINNED_VARIATION_SEED_LABEL } from "@/lib/tool-ui-labels";
import { accentRingClass } from "@/lib/tool-theme";
import { CollapsibleSection } from "@/components/ui/ToolPageShell";
import { ChipButton, FieldDivider, FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    setSamplerPreset(normalizeModelSamplerPresetTier(shared.modelSamplerPreset));
  }, [shared.modelSamplerPreset]);

  useEffect(() => {
    setResolutionOrientation(normalizeResolutionOrientation(shared.modelResolutionOrientation));
  }, [shared.modelResolutionOrientation]);

  useEffect(() => {
    setResolutionSizeTier(normalizeResolutionSizeTier(shared.modelResolutionSizeTier));
  }, [shared.modelResolutionSizeTier]);

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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <FieldLabel hint="Shared across tools and remembered between page reloads.">
          Target model
        </FieldLabel>
        <ModelSelector
          value={shared.model}
          onChange={(model) => {
            onModelChange(model);
            const patch = patchSharedForModelChange(model, shared);
            if (patch.selectedWorkflowFileId && onWorkflowPresetChange) {
              onWorkflowPresetChange(patch.selectedWorkflowFileId);
            }
          }}
        />
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

      {recommendFromText ? (
        <ModelRecommenderHints
          text={recommendFromText}
          currentModel={shared.model}
          onApplyModel={(model) => {
            onModelChange(model);
            const patch = patchSharedForModelChange(model, shared);
            if (patch.selectedWorkflowFileId && onWorkflowPresetChange) {
              onWorkflowPresetChange(patch.selectedWorkflowFileId);
            }
          }}
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
          selectedId={
            shared.selectedWorkflowFileId ??
            shared.selectedWorkflowPresetId ??
            workflowSelection.selectedId
          }
          defaultLabel={workflowSelection.defaultLabel}
          localFiles={workflowSelection.localFiles}
          serverFiles={workflowSelection.serverFiles}
          onChange={(fileId) => {
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
