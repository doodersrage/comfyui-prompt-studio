"use client";

import { useCallback, useEffect, useState } from "react";
import EnhancedPromptResult from "@/components/EnhancedPromptResult";
import PetPresetControls from "@/components/PetPresetControls";
import PetPresetChips from "@/components/PetPresetChips";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import { useLocationBlocklist } from "@/hooks/useLocationBlocklist";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { presetOptionsFromPetCache } from "@/lib/pet-options";
import { getComfyModelDefinition } from "@/lib/comfy-models";
import { avoidedTokensRequestBody } from "@/lib/avoided-tokens";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import {
  applyShareableSceneParams,
  parseScenePresetFromSearch,
} from "@/lib/scene-preset-url";
import { getPetPreset } from "@/lib/pet-presets";
import { readSceneLocationFromMetadata } from "@/lib/recent-locations";
import { DEFAULT_PET_TOOL_CACHE } from "@/lib/settings-cache";
import type { EnrichedToolGenerateResult } from "@/lib/specialized/types";
import { readVariationSeedFromResult } from "@/lib/variation-seed-metadata";
import { SubjectShotScaleControl } from "@/components/ShotScaleControl";
import {
  ROLL_VARIATION_LABEL,
  SCENE_HINTS_LABEL,
  rollVariationLabel,
} from "@/lib/tool-ui-labels";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from "@/components/ui/ToolPageShell";
import { FieldDivider, FieldError, FieldLabel, TextArea } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";

const ACCENT = "rose" as const;

export default function PetTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("pet", DEFAULT_PET_TOOL_CACHE);
  const { getRecent, record } = useRecentLocations();
  const { getBlocklist } = useLocationBlocklist();
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const actions = usePromptResultActions({
    tool: "pet",
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.hints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const variationSeed = readVariationSeedFromResult(result ?? {});

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const hints = new URLSearchParams(window.location.search).get("hints");
    const seed = new URLSearchParams(window.location.search).get("seed");
    if (hints?.trim()) {
      updateToolSettings({ hints: hints.trim() });
    }
    if (seed?.trim()) {
      updateShared({ lockedVariationSeed: seed.trim() });
    }

    const scene = parseScenePresetFromSearch(window.location.search);
    if (!scene) {
      return;
    }

    const applied = applyShareableSceneParams(scene);
    if (applied.hints?.trim()) {
      updateToolSettings({ hints: applied.hints.trim() });
    }
    updateShared({
      lockedWardrobeId: applied.lockedWardrobeId,
      lockedLocation: applied.lockedLocation,
      lockedVariationSeed: applied.lockedVariationSeed,
    });
    if (scene.petPresetId) {
      updateToolSettings({ petPresetId: scene.petPresetId });
      const preset = getPetPreset(scene.petPresetId);
      if (preset?.hints?.trim()) {
        updateToolSettings({ hints: preset.hints.trim() });
      }
    }
  }, [updateShared, updateToolSettings]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const response = await fetch("/api/pet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: shared.model,
          detail: shared.detail,
          hints: toolSettings.hints,
          portraitStyle: toolSettings.portraitStyle,
          variationStrength: toolSettings.variationStrength,
          presetOptions: presetOptionsFromPetCache(toolSettings),
          recentLocations: getRecent(),
          blockedLocations: getBlocklist(),
          lockedLocation: shared.lockedLocation,
          variationSeed: shared.lockedVariationSeed,
          ...avoidedTokensRequestBody(),
        }),
      });

      const data = (await response.json()) as EnrichedToolGenerateResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed.");
      }

      record(readSceneLocationFromMetadata(data.metadata));

      const prompt = await actions.finalizePrompt(data.prompt, toolSettings.hints);
      setOutput(prompt);
      setResult({ ...data, prompt });
    } catch (err) {
      setOutput("");
      setResult(null);
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [shared, toolSettings, getRecent, record, getBlocklist, actions]);

  const copyOutput = useCallback(async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, [output]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Pet scene · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Pet Scene Generator"
      description={
        <>
          Builds a detailed animal-focused prompt for dogs, cats, birds, rabbits,
          and more. The pet is the hero subject—no people or human hands. Add breed
          or species in hints, pin a place with{" "}
          <code className="text-rose-300">location: …</code>, or start from a
          preset chip below.
        </>
      }
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={false}
          lockedLocation={shared.lockedLocation}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedVariationSeed={() =>
            updateShared({ lockedVariationSeed: undefined })
          }
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={(value) => updateShared({ autoFixRules: value })}
        />
      }
    >
      <ToolSection>
        <PetPresetChips
          selectedId={toolSettings.petPresetId}
          category={toolSettings.presetCategory ?? "all"}
          onCategoryChange={(category) =>
            updateToolSettings({ presetCategory: category })
          }
          onSelect={(preset) => {
            updateToolSettings({
              hints: preset.hints,
              portraitStyle: preset.portraitStyle ?? "portrait",
              petPresetId: preset.id,
              presetCategory: preset.category,
              ...(preset.presetOptions ?? {}),
            });
          }}
        />

        <FieldDivider />

        <PetPresetControls
          mounted={mounted}
          settings={toolSettings}
          onChange={(patch) =>
            updateToolSettings({ ...patch, petPresetId: undefined })
          }
        />

        <FieldDivider />

        <FieldLabel>{SCENE_HINTS_LABEL}</FieldLabel>
        <TextArea
          value={toolSettings.hints ?? ""}
          onChange={(event) =>
            updateToolSettings({ hints: event.target.value, petPresetId: undefined })
          }
          placeholder="e.g. golden retriever puppy playing fetch, location: sunny dog park"
          rows={3}
          className={accentFocusClass(ACCENT)}
        />

        <FieldDivider />

        <SubjectShotScaleControl
          value={toolSettings.portraitStyle ?? "portrait"}
          onChange={(value) => updateToolSettings({ portraitStyle: value })}
          activeClassName="border-rose-500 bg-rose-500/15 text-rose-200"
        />

        <FieldDivider />

        <FieldLabel>{ROLL_VARIATION_LABEL}</FieldLabel>
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Stable</span>
          <span className="font-medium text-rose-300">
            {rollVariationLabel(toolSettings.variationStrength ?? 50)} (
            {toolSettings.variationStrength ?? 50})
          </span>
          <span>Varied</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={toolSettings.variationStrength ?? 50}
          onChange={(event) =>
            updateToolSettings({ variationStrength: Number(event.target.value) })
          }
          className={`h-2 w-full ${accentRingClass(ACCENT)}`}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void generate()}
          disabled={!mounted}
          loading={loading}
          loadingLabel="Generating pet scene prompt"
        >
          Generate pet scene prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        provider={result?.provider ?? null}
        comfyNode={result?.comfyNode}
        limits={result?.limits}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics ?? result?.diagnostics ?? null}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: toolSettings.hints,
            metadata: result?.metadata,
          })
        }
        onSendComfyUi={() => void actions.sendComfyUi(output)}
        onImprove={() => actions.improveOutput(output, actions.comfyUiPreviewUrl)}
        onRefine={() => actions.refineOutput(output, actions.comfyUiPreviewUrl)}
        {...promptResultPreviewProps(actions, output)}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, toolSettings.hints)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(output, setOutput, {
            maxChars: result?.limits?.maxChars,
            queueComfyUi: true,
          })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(output, {
            comfyNode: result?.comfyNode ?? selectedModel.comfyNode,
            variationSeed: variationSeed ?? shared.lockedVariationSeed,
            metadata: result?.metadata,
          })
        }
        onLockSeed={() => {
          if (variationSeed) {
            updateShared({ lockedVariationSeed: variationSeed });
          }
        }}
        fixStatus={actions.fixStatus}
        compactStatus={actions.compactStatus}
        reformatStatus={actions.reformatStatus}
        pipelineStatus={actions.pipelineStatus}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
        historySaved={actions.historySaved}
        pairCopied={actions.pairCopied}
      />
    </ToolLayout>
  );
}
