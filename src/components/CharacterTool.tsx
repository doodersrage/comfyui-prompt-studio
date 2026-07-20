"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BackgroundPresetControls from "@/components/BackgroundPresetControls";
import CharacterPresetControls from "@/components/CharacterPresetControls";
import EnhancedPromptResult from "@/components/EnhancedPromptResult";
import RegionalPromptBuilderPanel from "@/components/RegionalPromptBuilderPanel";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import SharedToolControls from "@/components/SharedToolControls";
import SportPresetChips from "@/components/SportPresetChips";
import { SubjectShotScaleControl } from "@/components/ShotScaleControl";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import { useRecentClothing } from "@/hooks/useRecentClothing";
import { useLocationBlocklist } from "@/hooks/useLocationBlocklist";
import { getClothingLabel } from "@/lib/clothing-catalog";
import { presetOptionsFromBackgroundCache } from "@/lib/background-options";
import { readSceneLocationFromMetadata } from "@/lib/recent-locations";
import { readClothingIdsFromMetadata } from "@/lib/recent-clothing";
import { getComfyModelDefinition } from "@/lib/comfy-models";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { avoidedTokensRequestBody } from "@/lib/avoided-tokens";
import { sharedLlmRequestBody } from "@/lib/llm-request-options";
import { presetOptionsFromCache } from "@/lib/character-options";
import {
  DEFAULT_CHARACTER_TOOL_CACHE,
  type CharacterSceneMode,
} from "@/lib/settings-cache";
import type { EnrichedToolGenerateResult } from "@/lib/specialized/types";
import {
  readVariationSeedFromMetadata,
  readVariationSeedFromResult,
} from "@/lib/variation-seed-metadata";
import {
  ROLL_VARIATION_LABEL,
  SCENE_HINTS_LABEL,
  rollVariationLabel,
} from "@/lib/tool-ui-labels";
import { downloadTextFile } from "@/lib/prompt-pair";
import {
  applyShareableSceneParams,
  parseScenePresetFromSearch,
} from "@/lib/scene-preset-url";
import { getSportPreset } from "@/lib/sport-presets";
import {
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
  type ToolAccent,
} from "@/lib/tool-theme";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
} from "@/components/ui/ToolPageShell";
import { FieldDivider, FieldError, FieldLabel, TextArea } from "@/components/ui/Field";
import { Button, PrimaryButton } from "@/components/ui/Button";

const SOLO_BATCH_COUNT = 3;

const SCENE_MODE_OPTIONS: Array<{
  value: CharacterSceneMode;
  label: string;
  description: string;
}> = [
  { value: "solo", label: "Solo", description: "Single person portrait or action" },
  { value: "duo", label: "Duo / sport", description: "Two people, teams, and competition" },
  {
    value: "compose",
    label: "With background",
    description: "Subject plus generated environment merged together",
  },
];

function accentForSceneMode(mode: CharacterSceneMode): ToolAccent {
  if (mode === "duo") {
    return "emerald";
  }
  if (mode === "compose") {
    return "cyan";
  }
  return "sky";
}

function historyToolForSceneMode(mode: CharacterSceneMode): "character" | "duo" | "compose" {
  if (mode === "duo") {
    return "duo";
  }
  if (mode === "compose") {
    return "compose";
  }
  return "character";
}

function presetVariantForSceneMode(
  mode: CharacterSceneMode,
): "solo" | "duo" | "compose" {
  if (mode === "duo") {
    return "duo";
  }
  if (mode === "compose") {
    return "compose";
  }
  return "solo";
}

function defaultPortraitStyle(mode: CharacterSceneMode): "portrait" | "full-body" | "action" {
  return mode === "solo" ? "portrait" : "action";
}

function parseSceneMode(value: string | null): CharacterSceneMode | null {
  if (value === "solo" || value === "duo" || value === "compose") {
    return value;
  }
  return null;
}

export default function CharacterTool() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("character", DEFAULT_CHARACTER_TOOL_CACHE);
  const { getRecent, record: recordLocation } = useRecentLocations();
  const { getRecent: getRecentClothing, record: recordClothing } = useRecentClothing();
  const { getBlocklist } = useLocationBlocklist();
  const [output, setOutput] = useState("");
  const [batchResults, setBatchResults] = useState<EnrichedToolGenerateResult[]>([]);
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sceneMode = toolSettings.sceneMode ?? "solo";
  const accent = accentForSceneMode(sceneMode);
  const historyTool = historyToolForSceneMode(sceneMode);
  const portraitStyle =
    toolSettings.portraitStyle ?? defaultPortraitStyle(sceneMode);

  const actions = usePromptResultActions({
    tool: historyTool,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.hints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const inferredSport = result?.diagnostics?.inferred.sport ?? null;
  const variationSeed = readVariationSeedFromResult(result ?? {});

  const modeDescription = useMemo(() => {
    if (sceneMode === "duo") {
      return "Two-person action scenes with sport-aware wardrobe, competition kits, helmets, and distinct identities.";
    }
    if (sceneMode === "compose") {
      return "Generates a subject and background prompt, then merges them into one scene-ready block.";
    }
    return "Builds a detailed single-person prompt—face, hair, clothing, pose, and expression.";
  }, [sceneMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const mode = parseSceneMode(params.get("mode"));
    if (mode) {
      updateToolSettings({ sceneMode: mode });
    }

    const hints = params.get("hints");
    const seed = params.get("seed");
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
    if (applied.sportPresetId) {
      updateToolSettings({ sceneMode: "duo", sportPresetId: applied.sportPresetId });
      const preset = getSportPreset(applied.sportPresetId);
      if (preset?.hints?.trim()) {
        updateToolSettings({ hints: preset.hints.trim() });
      }
    }
  }, [updateShared, updateToolSettings]);

  const generate = useCallback(
    async (batch = false) => {
      setLoading(true);
      setError(null);
      setCopied(false);
      actions.resetStatuses();
      setBatchResults([]);

      try {
        await actions.runPreLint(toolSettings.hints);

        if (sceneMode === "compose") {
          const response = await fetch("/api/compose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: shared.model,
              detail: shared.detail,
              subjectMode: toolSettings.composeSubjectMode ?? "duo",
              hints: toolSettings.hints,
              portraitStyle,
              variationStrength: toolSettings.variationStrength,
              presetOptions: presetOptionsFromCache(toolSettings),
              background: {
                settingType: toolSettings.settingType,
                timeOfDay: toolSettings.timeOfDay,
                mood: toolSettings.mood,
                presetOptions: presetOptionsFromBackgroundCache(toolSettings),
              },
              composeStyle: toolSettings.composeStyle ?? "layered",
              recentLocations: getRecent(),
              recentClothing: getRecentClothing(),
              blockedLocations: getBlocklist(),
              lockedWardrobeId: shared.lockedWardrobeId,
              lockedLocation: shared.lockedLocation,
              variationSeed: shared.lockedVariationSeed,
              alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
              teamKit: toolSettings.teamKit === true,
              ...avoidedTokensRequestBody(),
            }),
          });

          const data = (await response.json()) as EnrichedToolGenerateResult & {
            error?: string;
          };

          if (!response.ok) {
            throw new Error(data.error ?? "Composition failed.");
          }

          recordLocation(readSceneLocationFromMetadata(data.metadata));
          recordClothing(readClothingIdsFromMetadata(data.metadata));
          const prompt = await actions.finalizePrompt(data.prompt, toolSettings.hints);
          setOutput(prompt);
          setResult({ ...data, prompt });
          return;
        }

        const presetOptions =
          sceneMode === "duo"
            ? { ...presetOptionsFromCache(toolSettings), headcount: "duo" as const }
            : presetOptionsFromCache(toolSettings);

        const endpoint = batch ? "/api/batch" : sceneMode === "duo" ? "/api/duo" : "/api/character";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: shared.model,
            detail: shared.detail,
            hints: toolSettings.hints,
            portraitStyle,
            variationStrength: toolSettings.variationStrength,
            presetOptions,
            recentLocations: getRecent(),
            recentClothing: getRecentClothing(),
            blockedLocations: getBlocklist(),
            lockedWardrobeId: shared.lockedWardrobeId,
            lockedLocation: shared.lockedLocation,
            variationSeed: shared.lockedVariationSeed,
            alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
            activeCharacterDescriptor: shared.activeCharacterDescriptor,
            teamKit: sceneMode === "duo" ? toolSettings.teamKit === true : undefined,
            sportPresetId:
              sceneMode === "duo" ? toolSettings.sportPresetId || undefined : undefined,
            count:
              batch
                ? sceneMode === "duo"
                  ? toolSettings.batchCount ?? 3
                  : SOLO_BATCH_COUNT
                : undefined,
            ...avoidedTokensRequestBody(),
            ...sharedLlmRequestBody(shared),
          }),
        });

        const data = (await response.json()) as EnrichedToolGenerateResult & {
          error?: string;
          results?: EnrichedToolGenerateResult[];
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Generation failed.");
        }

        if (batch && data.results) {
          for (const entry of data.results) {
            recordLocation(readSceneLocationFromMetadata(entry.metadata));
            recordClothing(readClothingIdsFromMetadata(entry.metadata));
          }
          setBatchResults(data.results);
          const firstPrompt = data.results[0]?.prompt ?? "";
          const finalized = firstPrompt
            ? await actions.finalizePrompt(firstPrompt, toolSettings.hints)
            : "";
          setOutput(finalized || firstPrompt);
          setResult(data.results[0] ?? null);
        } else {
          recordLocation(readSceneLocationFromMetadata(data.metadata));
          recordClothing(readClothingIdsFromMetadata(data.metadata));
          const prompt = await actions.finalizePrompt(data.prompt, toolSettings.hints);
          setOutput(prompt);
          setResult({ ...data, prompt });
        }
      } catch (err) {
        setOutput("");
        setResult(null);
        setBatchResults([]);
        setError(err instanceof Error ? err.message : "Generation failed.");
      } finally {
        setLoading(false);
      }
    },
    [
      actions,
      getBlocklist,
      getRecent,
      getRecentClothing,
      portraitStyle,
      recordClothing,
      recordLocation,
      sceneMode,
      shared,
      toolSettings,
    ],
  );

  const exportBatch = useCallback(() => {
    if (batchResults.length === 0) {
      return;
    }

    downloadTextFile(
      `${historyTool}-batch-${Date.now()}.txt`,
      batchResults
        .map((entry, index) => `# ${index + 1}\n${entry.prompt}`)
        .join("\n\n"),
    );
  }, [batchResults, historyTool]);

  const batchPrompts = batchResults.map((entry) => entry.prompt);

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

  const activeClassName =
    accent === "emerald"
      ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
      : accent === "cyan"
        ? "border-cyan-500 bg-cyan-500/15 text-cyan-200"
        : "border-sky-500 bg-sky-500/15 text-sky-200";

  return (
    <ToolLayout
      accent={accent}
      badge={
        <ToolBadge accent={accent}>
          Character · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Character Generator"
      description={
        <>
          {modeDescription} Include sex/gender and age in hints when relevant. Add a
          place with <code className="text-sky-300">in/at/on …</code> or{" "}
          <code className="text-sky-300">location: …</code>.
        </>
      }
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={(model) => updateShared({ model })}
          onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          detailHelp={
            sceneMode === "duo"
              ? "Action mode works best with Rich detail for sport scenes."
              : "Rich detail recommended for character sheets and portraits."
          }
          showWardrobeOption
          alwaysIncludeClothing={shared.alwaysIncludeClothing !== false}
          onAlwaysIncludeClothingChange={(value) =>
            updateShared({ alwaysIncludeClothing: value })
          }
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
          activeCharacterDescriptor={shared.activeCharacterDescriptor}
          onActiveCharacterDescriptorChange={(value) =>
            updateShared({ activeCharacterDescriptor: value || undefined })
          }
        />
      }
    >
      <ToolSection>
        <FieldLabel>Scene mode</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {SCENE_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.description}
              onClick={() =>
                updateToolSettings({
                  sceneMode: option.value,
                  portraitStyle: defaultPortraitStyle(option.value),
                })
              }
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                sceneMode === option.value ? activeClassName : "border-zinc-700 text-zinc-400"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <FieldDivider />

        {sceneMode === "solo" ? (
          <SportPresetChips
            mode="solo"
            onSelect={(preset) => {
              updateToolSettings({
                hints: preset.hints,
                portraitStyle: preset.portraitStyle ?? "portrait",
              });
            }}
          />
        ) : null}

        {sceneMode === "duo" ? (
          <SportPresetChips
            mode="duo"
            selectedId={toolSettings.sportPresetId}
            onSelect={(preset) => {
              updateToolSettings({
                sportPresetId: preset.id,
                hints: preset.hints,
                portraitStyle: preset.portraitStyle ?? "action",
                teamKit: preset.teamKit ?? false,
              });
            }}
          />
        ) : null}

        {sceneMode === "compose" ? (
          <>
            <FieldLabel>Subject in scene</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { label: "Solo character", value: "character" },
                  { label: "Duo / sport", value: "duo" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    updateToolSettings({ composeSubjectMode: option.value })
                  }
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    (toolSettings.composeSubjectMode ?? "duo") === option.value
                      ? activeClassName
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <FieldDivider />

            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={toolSettings.settingType ?? ""}
                onChange={(e) => updateToolSettings({ settingType: e.target.value })}
                placeholder="Quick tag: place type"
                className={`ui-input px-3 py-2 text-sm ${accentFocusClass(accent)}`}
              />
              <input
                value={toolSettings.timeOfDay ?? ""}
                onChange={(e) => updateToolSettings({ timeOfDay: e.target.value })}
                placeholder="Quick tag: time / light"
                className={`ui-input px-3 py-2 text-sm ${accentFocusClass(accent)}`}
              />
              <input
                value={toolSettings.mood ?? ""}
                onChange={(e) => updateToolSettings({ mood: e.target.value })}
                placeholder="Quick tag: mood"
                className={`ui-input px-3 py-2 text-sm ${accentFocusClass(accent)}`}
              />
            </div>
            <p className="text-xs text-zinc-500">
              Quick tags are optional shortcuts—background presets below offer structured
              control.
            </p>

            <BackgroundPresetControls
              mounted={mounted}
              settings={toolSettings}
              onChange={(patch) =>
                updateToolSettings(patch as Partial<typeof toolSettings>)
              }
            />

            <FieldDivider />
          </>
        ) : null}

        {(sceneMode === "solo" || sceneMode === "duo") && <FieldDivider />}

        <FieldLabel>{SCENE_HINTS_LABEL}</FieldLabel>
        <TextArea
          value={toolSettings.hints ?? ""}
          onChange={(e) => updateToolSettings({ hints: e.target.value })}
          placeholder={
            sceneMode === "duo"
              ? "two female gravel cyclists in a fierce competition on a muddy doubletrack"
              : sceneMode === "compose"
                ? "two female gravel cyclists in fierce competition"
                : "e.g. young woman in her twenties, long dark hair; on a Tokyo rooftop at night"
          }
          rows={sceneMode === "duo" ? 4 : 3}
          className={accentFocusClass(accent)}
        />

        <RegionalPromptBuilderPanel
          accentClassName={accentFocusClass(accent)}
          onApply={(prompt) =>
            updateToolSettings({
              hints: toolSettings.hints?.trim()
                ? `${toolSettings.hints.trim()}. ${prompt}`
                : prompt,
            })
          }
        />

        {sceneMode === "duo" || sceneMode === "compose" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 p-3">
                <input
                  type="checkbox"
                  checked={toolSettings.teamKit === true}
                  onChange={(event) =>
                    updateToolSettings({ teamKit: event.target.checked })
                  }
                  className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentRingClass(accent)}`}
                />
                <span className="space-y-1">
                  <span className="text-sm font-medium text-zinc-200">Team kit</span>
                  <span className="block text-xs text-zinc-500">
                    Identical kits for both athletes. Off = rival accent colors.
                  </span>
                </span>
              </label>

              {sceneMode === "duo" ? (
                <div className="space-y-2">
                  <FieldLabel htmlFor="batch-count">Batch count</FieldLabel>
                  <input
                    id="batch-count"
                    type="number"
                    min={1}
                    max={12}
                    value={toolSettings.batchCount ?? 3}
                    onChange={(event) =>
                      updateToolSettings({
                        batchCount: Math.min(
                          12,
                          Math.max(1, Number(event.target.value) || 3),
                        ),
                      })
                    }
                    className="ui-input w-full px-4 py-2 text-sm"
                  />
                </div>
              ) : null}
            </div>

            <FieldDivider />
          </>
        ) : null}

        <CharacterPresetControls
          mounted={mounted}
          settings={toolSettings}
          onChange={updateToolSettings}
          variant={presetVariantForSceneMode(sceneMode)}
        />

        <FieldDivider />

        <SubjectShotScaleControl
          value={portraitStyle}
          onChange={(value) => updateToolSettings({ portraitStyle: value })}
          activeClassName={activeClassName}
        />

        {sceneMode === "compose" ? (
          <>
            <FieldDivider />
            <FieldLabel>Merge style</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { label: "Layered sections", value: "layered" },
                  { label: "Inline prose", value: "inline" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateToolSettings({ composeStyle: option.value })}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    (toolSettings.composeStyle ?? "layered") === option.value
                      ? activeClassName
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <FieldDivider />

        <FieldLabel>{ROLL_VARIATION_LABEL}</FieldLabel>
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Stable</span>
          <span
            className={`font-medium ${
              accent === "emerald"
                ? "text-emerald-300"
                : accent === "cyan"
                  ? "text-cyan-300"
                  : "text-sky-300"
            }`}
          >
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
          onChange={(e) =>
            updateToolSettings({ variationStrength: Number(e.target.value) })
          }
          className={`h-2 w-full ${accentRingClass(accent)}`}
        />

        <div className="flex flex-wrap gap-3">
          <PrimaryButton
            accentClassName={accentButtonClass(accent)}
            onClick={() => void generate(false)}
            disabled={!mounted}
            loading={loading}
            loadingLabel="Generating character prompt"
          >
            {sceneMode === "compose"
              ? "Compose scene prompt"
              : sceneMode === "duo"
                ? "Generate duo"
                : "Generate character prompt"}
          </PrimaryButton>
          {sceneMode !== "compose" ? (
            <Button
              variant="secondary"
              disabled={!mounted}
              loading={loading}
              loadingLabel="Rolling batch variations"
              onClick={() => void generate(true)}
            >
              Batch {sceneMode === "duo" ? toolSettings.batchCount ?? 3 : SOLO_BATCH_COUNT}
            </Button>
          ) : null}
        </div>

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
        preDiagnostics={actions.preDiagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: toolSettings.hints,
            metadata: result?.metadata,
          })
        }
        onSendComfyUi={() => void actions.sendComfyUi(output, inferredSport)}
        onImprove={() => actions.improveOutput(output, actions.comfyUiPreviewUrl)}
        onRefine={() => actions.refineOutput(output, actions.comfyUiPreviewUrl)}
        {...promptResultPreviewProps(actions, output, inferredSport)}
        onFixPrompt={() =>
          void actions.fixPrompt(output, setOutput, toolSettings.hints)
        }
        onCopyPair={() => void actions.copyPromptPair(output, inferredSport)}
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
        onExportBatch={batchResults.length > 1 ? exportBatch : undefined}
        onQueueBatchComfyUi={
          batchResults.length > 1
            ? () => void actions.sendBatchComfyUi(batchPrompts, inferredSport)
            : undefined
        }
        batchItems={
          batchResults.length > 1
            ? batchResults.map((entry) => ({
                prompt: entry.prompt,
                metadata: entry.metadata,
              }))
            : undefined
        }
        batchCrossLinks={{
          hintsForDuo: toolSettings.hints,
          hintsForCharacter: toolSettings.hints,
        }}
        batchPromptActions={{
          onQueueComfyUi: (prompt) => void actions.sendComfyUi(prompt, inferredSport),
          onSaveHistory: ({ prompt, metadata }) =>
            actions.saveHistory({
              prompt,
              hints: toolSettings.hints,
              metadata,
            }),
          onCopyPair: (prompt) => void actions.copyPromptPair(prompt, inferredSport),
          onExportSidecar: (prompt, _index, metadata) =>
            void actions.exportSidecar(prompt, {
              comfyNode: result?.comfyNode ?? selectedModel.comfyNode,
              metadata,
              variationSeed:
                readVariationSeedFromMetadata(metadata) ?? shared.lockedVariationSeed,
            }),
        }}
        onLockSeed={() => {
          if (variationSeed) {
            updateShared({ lockedVariationSeed: variationSeed });
          }
        }}
        variationSeed={variationSeed}
        seedLocked={
          Boolean(
            variationSeed &&
              shared.lockedVariationSeed?.trim() === variationSeed.trim(),
          )
        }
        fixStatus={actions.fixStatus}
        compactStatus={actions.compactStatus}
        reformatStatus={actions.reformatStatus}
        pipelineStatus={actions.pipelineStatus}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
        historySaved={actions.historySaved}
        pairCopied={actions.pairCopied}
        extraMeta={
          sceneMode === "duo" && toolSettings.sportPresetId
            ? getSportPreset(toolSettings.sportPresetId)?.label
            : undefined
        }
      />
    </ToolLayout>
  );
}
