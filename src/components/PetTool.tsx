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
import { applyHintSourceFromSearchParams } from "@/lib/tool-url-params";
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
  SceneGenerateFooter,
  SceneHintsField,
  VariationSliderField,
} from "@/components/scene-tool/SceneToolSections";
import {
  HistoryHintSeedPanel,
  resolveSceneHintsForGeneration,
} from "@/components/scene-tool/HistoryHintSeedPanel";
import {
  normalizeHistorySeedScope,
  normalizeSceneHintSource,
} from "@/lib/scene-hint-source";
import { countHistorySeedCandidates } from "@/lib/history-hint-seed";
import {
  ROLL_VARIATION_LABEL,
  rollVariationLabel,
} from "@/lib/tool-ui-labels";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentFocusClass,
  accentRingClass,
} from "@/components/ui/ToolPageShell";
import { FieldDivider } from "@/components/ui/Field";

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
  const hintSource = normalizeSceneHintSource(toolSettings.hintSource);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const historyCandidateCount = countHistorySeedCandidates("pet", historySeedScope);
  const generateDisabledReason =
    hintSource === "history" && historyCandidateCount === 0
      ? "Save a few pet or related prompts to Studio history first, or switch hint source."
      : null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    applyHintSourceFromSearchParams(params, updateToolSettings);
    const hints = params.get("hints");
    const seed = params.get("seed");
    if (hints?.trim()) {
      updateToolSettings({
        hints: hints.trim(),
        ...(params.get("hintSource") === "manual" ? { hintSource: "manual" } : {}),
      });
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
      const effectiveHints = resolveSceneHintsForGeneration({
        hintSource,
        hints: toolSettings.hints,
        randomTheme: toolSettings.randomTheme,
      });
      const response = await fetch("/api/pet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: shared.model,
          detail: shared.detail,
          hints: effectiveHints,
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

      const prompt = await actions.finalizePrompt(data.prompt, effectiveHints);
      setOutput(prompt);
      setResult({ ...data, prompt });
    } catch (err) {
      setOutput("");
      setResult(null);
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [shared, toolSettings, hintSource, getRecent, record, getBlocklist, actions]);

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
          recommendFromText={output}
        />
      }
    >
      <ToolSection
        title="Scene setup"
        description="Pick a preset, refine options, then add freeform hints before generating."
      >
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

        <HistoryHintSeedPanel
          tool="pet"
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.hints ?? ""}
          randomTheme={toolSettings.randomTheme ?? ""}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={(source) => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={(scope) =>
            updateToolSettings({ historySeedScope: scope })
          }
          onHintsChange={(value) =>
            updateToolSettings({ hints: value, petPresetId: undefined })
          }
          onRandomThemeChange={(value) => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={(result) =>
            updateToolSettings({
              hints: result.hints,
              lastHistorySeedEntryId: result.entryId,
              petPresetId: undefined,
            })
          }
          accentFocusClassName={accentFocusClass(ACCENT)}
        />

        {hintSource !== "random" ? (
          <>
            <FieldDivider />
            <SceneHintsField
              value={toolSettings.hints ?? ""}
              onChange={(value) =>
                updateToolSettings({ hints: value, petPresetId: undefined })
              }
              placeholder="e.g. golden retriever puppy playing fetch, location: sunny dog park"
              className={accentFocusClass(ACCENT)}
            />
          </>
        ) : null}

        <FieldDivider />

        <SubjectShotScaleControl
          value={toolSettings.portraitStyle ?? "portrait"}
          onChange={(value) => updateToolSettings({ portraitStyle: value })}
        />

        <FieldDivider />

        <VariationSliderField
          label={ROLL_VARIATION_LABEL}
          value={toolSettings.variationStrength ?? 50}
          onChange={(value) => updateToolSettings({ variationStrength: value })}
          valueLabel={`${rollVariationLabel(toolSettings.variationStrength ?? 50)} (${toolSettings.variationStrength ?? 50})`}
          accentRingClassName={accentRingClass(ACCENT)}
        />

        <SceneGenerateFooter
          accent={ACCENT}
          label="Generate pet scene prompt"
          onClick={() => void generate()}
          disabled={!mounted || Boolean(generateDisabledReason)}
          loading={loading}
          loadingLabel="Generating pet scene prompt"
          error={error ?? generateDisabledReason}
        />
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
