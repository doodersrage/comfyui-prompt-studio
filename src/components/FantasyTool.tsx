"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EnhancedPromptResult from "@/components/EnhancedPromptResult";
import FantasyPresetChips from "@/components/FantasyPresetChips";
import FantasyPresetControls from "@/components/FantasyPresetControls";
import SharedToolControls from "@/components/SharedToolControls";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import { useRecentClothing } from "@/hooks/useRecentClothing";
import { useLocationBlocklist } from "@/hooks/useLocationBlocklist";
import { getClothingLabel } from "@/lib/clothing-catalog";
import {
  presetOptionsFromFantasyCache,
  resolveFantasyFocus,
} from "@/lib/fantasy-options";
import { getComfyModelDefinition } from "@/lib/comfy-models";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { avoidedTokensRequestBody } from "@/lib/avoided-tokens";
import {
  applyShareableSceneParams,
  parseScenePresetFromSearch,
} from "@/lib/scene-preset-url";
import { getFantasyPreset } from "@/lib/fantasy-presets";
import { readSceneLocationFromMetadata } from "@/lib/recent-locations";
import { readClothingIdsFromMetadata } from "@/lib/recent-clothing";
import { DEFAULT_FANTASY_TOOL_CACHE } from "@/lib/settings-cache";
import type { EnrichedToolGenerateResult } from "@/lib/specialized/types";
import { readVariationSeedFromResult } from "@/lib/variation-seed-metadata";
import { FantasyShotScaleControl } from "@/components/ShotScaleControl";
import {
  CONCEPT_WILDNESS_LABEL,
  ROLL_VARIATION_LABEL,
  SCENE_HINTS_LABEL,
  conceptWildnessLabel,
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

const ACCENT = "violet" as const;

export default function FantasyTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("fantasy", DEFAULT_FANTASY_TOOL_CACHE);
  const { getRecent, record } = useRecentLocations();
  const { getRecent: getRecentClothing, record: recordClothing } =
    useRecentClothing();
  const { getBlocklist } = useLocationBlocklist();
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const presetOptions = useMemo(
    () => presetOptionsFromFantasyCache(toolSettings),
    [toolSettings],
  );
  const focus = resolveFantasyFocus(presetOptions, toolSettings.hints);
  const includePeople = focus === "character" || focus === "ensemble";
  const activeFraming =
    focus === "environment" ? "wide" : (toolSettings.portraitStyle ?? "portrait");

  const actions = usePromptResultActions({
    tool: "fantasy",
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
    if (scene.fantasyPresetId) {
      updateToolSettings({ fantasyPresetId: scene.fantasyPresetId });
      const preset = getFantasyPreset(scene.fantasyPresetId);
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
      const response = await fetch("/api/fantasy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: shared.model,
          detail: shared.detail,
          hints: toolSettings.hints,
          portraitStyle: activeFraming,
          wildness: toolSettings.wildness,
          variationStrength: toolSettings.variationStrength,
          presetOptions,
          recentLocations: getRecent(),
          recentClothing: getRecentClothing(),
          blockedLocations: getBlocklist(),
          lockedLocation: shared.lockedLocation,
          lockedWardrobeId: shared.lockedWardrobeId,
          variationSeed: shared.lockedVariationSeed,
          alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
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
      recordClothing(readClothingIdsFromMetadata(data.metadata));

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
  }, [
    shared,
    toolSettings,
    presetOptions,
    getRecent,
    record,
    getRecentClothing,
    recordClothing,
    getBlocklist,
    actions,
    activeFraming,
  ]);

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
          Fantasy scene · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Fantasy Scene Generator"
      description={
        <>
          Builds detailed fantasy prompts for characters, creatures, ensembles,
          or pure environments. Use presets and options for subgenre, magic,
          setting, and camera—or add freeform hints and pin a place with{" "}
          <code className="text-violet-300">location: …</code>.
        </>
      }
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={includePeople}
          alwaysIncludeClothing={shared.alwaysIncludeClothing !== false}
          onAlwaysIncludeClothingChange={(value) =>
            updateShared({ alwaysIncludeClothing: value })
          }
          wardrobeHelp="When focus is character or ensemble, rolls catalog outfits for heroes and adventurers."
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedWardrobeLabel={
            shared.lockedWardrobeId
              ? getClothingLabel(shared.lockedWardrobeId) ?? shared.lockedWardrobeId
              : undefined
          }
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
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
        <FantasyPresetChips
          selectedId={toolSettings.fantasyPresetId}
          category={toolSettings.presetCategory ?? "all"}
          onCategoryChange={(category) =>
            updateToolSettings({ presetCategory: category })
          }
          onSelect={(preset) => {
            updateToolSettings({
              hints: preset.hints,
              fantasyPresetId: preset.id,
              presetCategory: preset.category,
              ...(preset.presetOptions ?? {}),
            });
          }}
        />

        <FieldDivider />

        <FantasyPresetControls
          mounted={mounted}
          settings={toolSettings}
          onChange={(patch) =>
            updateToolSettings({ ...patch, fantasyPresetId: undefined })
          }
        />

        <FieldDivider />

        <FieldLabel>{SCENE_HINTS_LABEL}</FieldLabel>
        <TextArea
          value={toolSettings.hints ?? ""}
          onChange={(event) =>
            updateToolSettings({
              hints: event.target.value,
              fantasyPresetId: undefined,
            })
          }
          placeholder="e.g. elven spellblade in a crystal cavern, location: floating ruins above the clouds"
          rows={3}
          className={accentFocusClass(ACCENT)}
        />

        <FieldDivider />

        <FantasyShotScaleControl
          value={activeFraming}
          onChange={(value) => updateToolSettings({ portraitStyle: value })}
          activeClassName="border-violet-500 bg-violet-500/15 text-violet-200"
          environmentOnly={focus === "environment"}
        />

        <FieldDivider />

        <FieldLabel>{CONCEPT_WILDNESS_LABEL}</FieldLabel>
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Grounded</span>
          <span className="font-medium text-violet-300">
            {conceptWildnessLabel(toolSettings.wildness ?? 65)} (
            {toolSettings.wildness ?? 65})
          </span>
          <span>Surreal</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={toolSettings.wildness ?? 65}
          onChange={(event) =>
            updateToolSettings({ wildness: Number(event.target.value) })
          }
          className={`h-2 w-full ${accentRingClass(ACCENT)}`}
        />

        <FieldLabel>{ROLL_VARIATION_LABEL}</FieldLabel>
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Stable</span>
          <span className="font-medium text-violet-300">
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
          loadingLabel="Generating fantasy scene prompt"
        >
          Generate fantasy scene prompt
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
