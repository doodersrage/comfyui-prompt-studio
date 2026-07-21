"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import BackgroundPresetControls from "@/components/BackgroundPresetControls";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";
import RegionalPromptBuilderPanel from "@/components/RegionalPromptBuilderPanel";
import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import SharedToolControls from "@/components/SharedToolControls";
import { applySceneStarterWorkflowHints } from "@/lib/scene-starter-workflow-hints";
import { applyHintSourceFromSearchParams } from "@/lib/tool-url-params";
import { rememberDraftFields } from "@/lib/remember-draft-fields";
import { SubjectShotScaleControl } from "@/components/ShotScaleControl";
import {
  SceneGenerateFooter,
  SceneHintsField,
  SceneQuickTags,
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
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useSeedToolDraft } from "@/hooks/useSeedToolDraft";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import { useRecentClothing } from "@/hooks/useRecentClothing";
import { useLocationBlocklist } from "@/hooks/useLocationBlocklist";
import { fetchClothingLabels, getCachedClothingLabel } from "@/lib/clothing-catalog-client";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { presetOptionsFromBackgroundCache } from "@/lib/background-options";
import { readSceneLocationFromMetadata } from "@/lib/recent-locations";
import { readClothingIdsFromMetadata } from "@/lib/recent-clothing";
import { getComfyModelDefinition } from "@/lib/comfy-models/client";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import { avoidedTokensRequestBody } from "@/lib/avoided-tokens";
import { sharedLlmRequestBody } from "@/lib/llm-request-options";
import { presetOptionsFromCache } from "@/lib/character-options-ui";
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
  rollVariationLabel,
} from "@/lib/tool-ui-labels";
import { downloadTextFile } from "@/lib/prompt-pair";
import {
  applyShareableSceneParams,
  parseScenePresetFromSearch,
} from "@/lib/scene-preset-url";
import { getSportPreset } from "@/lib/sport-presets";
import { isSportStarterPreset } from "@/lib/scene-starter-presets";
import {
  accentFocusClass,
  accentRingClass,
  type ToolAccent,
} from "@/lib/tool-theme";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
} from "@/components/ui/ToolPageShell";
import { ChipButton, FieldDivider, FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const SceneStarterPresetChips = dynamic(
  () => import("@/components/SceneStarterPresetChips"),
  {
    loading: () => (
      <div className="h-24 animate-pulse rounded-xl bg-zinc-800/40" aria-hidden />
    ),
  },
);
const CharacterPresetControls = dynamic(
  () => import("@/components/CharacterPresetControls"),
  {
    loading: () => (
      <div className="h-48 animate-pulse rounded-xl bg-zinc-800/40" aria-hidden />
    ),
  },
);

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
  useSeedToolDraft(mounted, {
    toolKey: "character",
    label: "Character",
    href: "/character",
    fields: [toolSettings.hints],
  });
  const [output, setOutput] = useState("");
  const [batchResults, setBatchResults] = useState<EnrichedToolGenerateResult[]>([]);
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lockedWardrobeLabel, setLockedWardrobeLabel] = useState<string | undefined>();

  useEffect(() => {
    const id = shared.lockedWardrobeId?.trim();
    if (!id) {
      scheduleAfterCommit(() => setLockedWardrobeLabel(undefined));
      return;
    }

    const cached = getCachedClothingLabel(id);
    if (cached) {
      scheduleAfterCommit(() => setLockedWardrobeLabel(cached));
      return;
    }

    let cancelled = false;
    void fetchClothingLabels([id]).then((labels) => {
      if (cancelled) {
        return;
      }
      setLockedWardrobeLabel(labels.get(id) ?? id);
    });

    return () => {
      cancelled = true;
    };
  }, [shared.lockedWardrobeId]);

  const sceneMode = toolSettings.sceneMode ?? "solo";
  const accent = accentForSceneMode(sceneMode);
  const historyTool = historyToolForSceneMode(sceneMode);
  const hintSource = normalizeSceneHintSource(toolSettings.hintSource);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const historyCandidateCount = countHistorySeedCandidates(historyTool, historySeedScope);
  const generateDisabledReason =
    hintSource === "history" && historyCandidateCount === 0
      ? "Save a few character prompts to Studio history first, or switch hint source."
      : null;
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
    applyHintSourceFromSearchParams(params, updateToolSettings);
    const mode = parseSceneMode(params.get("mode"));
    if (mode) {
      updateToolSettings({ sceneMode: mode });
    }

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
        const effectiveHints = resolveSceneHintsForGeneration({
          hintSource,
          hints: toolSettings.hints,
          randomTheme: toolSettings.randomTheme,
        });

        await actions.runPreLint(effectiveHints);

        if (sceneMode === "compose") {
          const response = await fetch("/api/compose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: shared.model,
              detail: shared.detail,
              subjectMode: toolSettings.composeSubjectMode ?? "duo",
              hints: effectiveHints,
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
          const prompt = await actions.finalizePrompt(data.prompt, effectiveHints);
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
            hints: effectiveHints,
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
            ? await actions.finalizePrompt(firstPrompt, effectiveHints)
            : "";
          setOutput(finalized || firstPrompt);
          setResult(data.results[0] ?? null);
        } else {
          recordLocation(readSceneLocationFromMetadata(data.metadata));
          recordClothing(readClothingIdsFromMetadata(data.metadata));
          const prompt = await actions.finalizePrompt(data.prompt, effectiveHints);
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
      hintSource,
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
          toolId="character"
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
              ? lockedWardrobeLabel ?? shared.lockedWardrobeId
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
          recommendFromText={output || toolSettings.hints || ""}
        />
      }
    >
      <ToolSection
        title="Scene setup"
        description="Choose a mode, refine presets, add hints, then generate."
      >
        <FieldLabel>Scene mode</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {SCENE_MODE_OPTIONS.map((option) => (
            <ChipButton
              key={option.value}
              active={sceneMode === option.value}
              onClick={() =>
                updateToolSettings({
                  sceneMode: option.value,
                  portraitStyle: defaultPortraitStyle(option.value),
                })
              }
            >
              {option.label}
            </ChipButton>
          ))}
        </div>

        <FieldDivider />

        {sceneMode === "solo" ? (
          <SceneStarterPresetChips
            mode="solo"
            accent={accent}
            currentHints={toolSettings.hints ?? ""}
            variationsTarget="character"
            category={toolSettings.sceneStarterCategory ?? "all"}
            onCategoryChange={(category) =>
              updateToolSettings({ sceneStarterCategory: category })
            }
            filterState={{
              category: toolSettings.sceneStarterCategory ?? "all",
              framing: toolSettings.sceneStarterFraming ?? "all",
              query: toolSettings.sceneStarterQuery ?? "",
              tags: toolSettings.sceneStarterTags ?? [],
            }}
            onFilterChange={(filter) =>
              updateToolSettings({
                sceneStarterCategory: filter.category,
                sceneStarterFraming: filter.framing,
                sceneStarterQuery: filter.query,
                sceneStarterTags: filter.tags,
              })
            }
            selectedId={toolSettings.sceneStarterPresetId}
            onSelect={(preset) => {
              updateToolSettings({
                sceneStarterPresetId: preset.id,
                hints: preset.hints,
                portraitStyle: preset.portraitStyle ?? "portrait",
                sportPresetId: undefined,
                hintSource: "manual",
              });
              applySceneStarterWorkflowHints(preset, updateShared);
            }}
          />
        ) : null}

        {sceneMode === "duo" ? (
          <SceneStarterPresetChips
            mode="duo"
            accent={accent}
            currentHints={toolSettings.hints ?? ""}
            variationsTarget="duo"
            category={toolSettings.sceneStarterCategory ?? "all"}
            onCategoryChange={(category) =>
              updateToolSettings({ sceneStarterCategory: category })
            }
            filterState={{
              category: toolSettings.sceneStarterCategory ?? "all",
              framing: toolSettings.sceneStarterFraming ?? "all",
              query: toolSettings.sceneStarterQuery ?? "",
              tags: toolSettings.sceneStarterTags ?? [],
            }}
            onFilterChange={(filter) =>
              updateToolSettings({
                sceneStarterCategory: filter.category,
                sceneStarterFraming: filter.framing,
                sceneStarterQuery: filter.query,
                sceneStarterTags: filter.tags,
              })
            }
            selectedId={
              toolSettings.sceneStarterPresetId ?? toolSettings.sportPresetId
            }
            onSelect={(preset) => {
              updateToolSettings({
                sceneStarterPresetId: preset.id,
                sportPresetId: isSportStarterPreset(preset.id) ? preset.id : undefined,
                hints: preset.hints,
                portraitStyle: preset.portraitStyle ?? "action",
                teamKit: preset.teamKit ?? false,
                hintSource: "manual",
              });
              applySceneStarterWorkflowHints(preset, updateShared);
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
                <ChipButton
                  key={option.value}
                  active={(toolSettings.composeSubjectMode ?? "duo") === option.value}
                  onClick={() =>
                    updateToolSettings({ composeSubjectMode: option.value })
                  }
                >
                  {option.label}
                </ChipButton>
              ))}
            </div>

            <FieldDivider />

            <SceneQuickTags
              settingType={toolSettings.settingType ?? ""}
              timeOfDay={toolSettings.timeOfDay ?? ""}
              mood={toolSettings.mood ?? ""}
              onSettingTypeChange={(value) => updateToolSettings({ settingType: value })}
              onTimeOfDayChange={(value) => updateToolSettings({ timeOfDay: value })}
              onMoodChange={(value) => updateToolSettings({ mood: value })}
              inputClassName={accentFocusClass(accent)}
            />

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

        <CharacterPresetControls
          mounted={mounted}
          settings={toolSettings}
          onChange={updateToolSettings}
          variant={presetVariantForSceneMode(sceneMode)}
        />

        <FieldDivider />

        <HistoryHintSeedPanel
          tool={historyTool}
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.hints ?? ""}
          randomTheme={toolSettings.randomTheme ?? ""}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={(source) => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={(scope) =>
            updateToolSettings({ historySeedScope: scope })
          }
          onHintsChange={(value) => {
            updateToolSettings({ hints: value });
            rememberDraftFields({
              toolKey: "character",
              label: "Character",
              href: "/character",
              fields: [value],
            });
          }}
          onRandomThemeChange={(value) => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={(result) =>
            updateToolSettings({
              hints: result.hints,
              lastHistorySeedEntryId: result.entryId,
            })
          }
          accentFocusClassName={accentFocusClass(accent)}
        />

        {hintSource !== "random" ? (
          <>
            <FieldDivider />
            <SceneHintsField
              value={toolSettings.hints ?? ""}
              onChange={(value) => {
                updateToolSettings({ hints: value });
                rememberDraftFields({
                  toolKey: "character",
                  label: "Character",
                  href: "/character",
                  fields: [value],
                });
              }}
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
          </>
        ) : null}

        {hintSource !== "random" ? (
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
        ) : null}

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

        <FieldDivider />

        <SubjectShotScaleControl
          value={portraitStyle}
          onChange={(value) => updateToolSettings({ portraitStyle: value })}
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
                <ChipButton
                  key={option.value}
                  active={(toolSettings.composeStyle ?? "layered") === option.value}
                  onClick={() => updateToolSettings({ composeStyle: option.value })}
                >
                  {option.label}
                </ChipButton>
              ))}
            </div>
          </>
        ) : null}

        <FieldDivider />

        <VariationSliderField
          label={ROLL_VARIATION_LABEL}
          value={toolSettings.variationStrength ?? 50}
          onChange={(value) => updateToolSettings({ variationStrength: value })}
          valueLabel={`${rollVariationLabel(toolSettings.variationStrength ?? 50)} (${toolSettings.variationStrength ?? 50})`}
          accentRingClassName={accentRingClass(accent)}
        />

        <SceneGenerateFooter
          accent={accent}
          label={
            sceneMode === "compose"
              ? "Compose scene prompt"
              : sceneMode === "duo"
                ? "Generate duo"
                : "Generate character prompt"
          }
          onClick={() => void generate(false)}
          disabled={!mounted || Boolean(generateDisabledReason)}
          loading={loading}
          loadingLabel="Generating character prompt"
          error={error ?? generateDisabledReason}
        >
          {sceneMode !== "compose" ? (
            <Button
              variant="secondary"
              disabled={!mounted || Boolean(generateDisabledReason)}
              loading={loading}
              loadingLabel="Rolling batch variations"
              onClick={() => void generate(true)}
            >
              Batch {sceneMode === "duo" ? toolSettings.batchCount ?? 3 : SOLO_BATCH_COUNT}
            </Button>
          ) : null}
        </SceneGenerateFooter>
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
        onEditPrompt={() =>
          actions.editPromptOutput(
            output,
            actions.comfyUiPreviewUrl,
            undefined,
            toolSettings.hints,
          )
        }
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
