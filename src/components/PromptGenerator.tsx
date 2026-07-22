"use client";

import { promptResultPreviewProps } from "@/lib/prompt-result-preview-props";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { applySceneStarterWorkflowHints } from "@/lib/scene-starter-workflow-hints";
import EnhancedPromptResult from "@/components/LazyEnhancedPromptResult";

const SceneStarterPresetChips = dynamic(
  () => import("@/components/SceneStarterPresetChips"),
  { loading: () => <div className="h-24 animate-pulse rounded-xl bg-zinc-800/40" aria-hidden /> },
);
const TagAssistToolbar = dynamic(() => import("@/components/TagAssistToolbar"), {
  ssr: false,
  loading: () => <div className="h-12 animate-pulse rounded-xl bg-zinc-800/40" aria-hidden />,
});
import SharedToolControls from "@/components/SharedToolControls";
import {
  VariationSliderField,
} from "@/components/scene-tool/SceneToolSections";
import {
  HistoryHintSeedPanel,
} from "@/components/scene-tool/HistoryHintSeedPanel";
import {
  normalizeHistorySeedScope,
  resolveGenerateHintSource,
} from "@/lib/scene-hint-source";
import { countHistorySeedCandidates } from "@/lib/history-hint-seed";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useSeedToolDraft } from "@/hooks/useSeedToolDraft";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import { useRecentClothing } from "@/hooks/useRecentClothing";
import { useRecentLocations } from "@/hooks/useRecentLocations";
import { useLocationBlocklist } from "@/hooks/useLocationBlocklist";
import { readClothingIdsFromMetadata } from "@/lib/recent-clothing";
import { readSceneLocationFromMetadata } from "@/lib/recent-locations";
import type { DetailLevel } from "@/lib/detail-level";
import { getDetailLimits } from "@/lib/detail-level";
import {
  getComfyModelDefinition,
  type ComfyImageModel,
} from "@/lib/comfy-models/client";
import {
  DEFAULT_GENERATE_TOOL_CACHE,
} from "@/lib/settings-cache";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { rememberDraftFields } from "@/lib/remember-draft-fields";
import type { EnrichedToolGenerateResult } from "@/lib/specialized/types";
import { readVariationSeedFromResult } from "@/lib/variation-seed-metadata";
import { modelUsesTagAssist } from "@/lib/tag-assist";
import { avoidedTokensRequestBody } from "@/lib/avoided-tokens";
import {
  applyRatingDrivenWildness,
  ratingDrivenWildnessLabel,
} from "@/lib/rating-driven-random";
import { sharedLlmRequestBody } from "@/lib/llm-request-options";
import { streamGeneratePrompt } from "@/lib/generate-stream-client";
import { applyLockedLocation } from "@/lib/locked-location";
import { resolveModelForPromptGeneration } from "@/lib/queue-tool-model";
import { getReformatTargetLabel, getReformatTargetModel } from "@/lib/reformat-target";
import {
  applyShareableSceneParams,
  parseScenePresetFromSearch,
} from "@/lib/scene-preset-url";
import { getSportPreset } from "@/lib/sport-presets";
import { isSportStarterPreset } from "@/lib/scene-starter-presets";
import { applyHintSourceFromSearchParams } from "@/lib/tool-url-params";
import {
  RANDOMIZE_INGREDIENTS_LABEL,
  SCENE_WILDNESS_LABEL,
  rollVariationLabel,
  sceneWildnessLabel,
} from "@/lib/tool-ui-labels";
import {
  CollapsibleSection,
  CodeBlock,
  SegmentedControl,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from "@/components/ui/ToolPageShell";
import { ChipButton, FieldDivider, FieldError, FieldLabel, TextArea, TextInput } from "@/components/ui/Field";
import { markOnboardingFirstGenerate } from "@/lib/onboarding-hooks";
import { Button, PrimaryButton } from "@/components/ui/Button";

const ACCENT = "violet" as const;

type PromptMode = "positive" | "negative";

type GenerateResponse = {
  prompt: string;
  mode: PromptMode;
  provider: "llm" | "template";
  model: ComfyImageModel;
  comfyNode: string;
  limits: {
    minChars?: number;
    maxChars: number;
    maxSentences: number;
    maxTokens: number;
  };
  metadata?: {
    wardrobeAssignments?: Array<{
      wardrobeId?: string | null;
      footwearId?: string | null;
      accessoriesId?: string | null;
    }>;
  };
};

const EXAMPLE_INPUTS = [
  "neon alley, rain, black cat",
  "two women, rooftop bar, city lights",
  "gothic cathedral, candles, fog",
  "cyberpunk city at night",
];

export default function PromptGenerator() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("generate", DEFAULT_GENERATE_TOOL_CACHE);
  const { getRecent, record: recordLocation } = useRecentLocations();
  const { getRecent: getRecentClothing, record: recordClothing } = useRecentClothing();
  const { getBlocklist } = useLocationBlocklist();
  const [mode, setMode] = useState<PromptMode>(
    DEFAULT_GENERATE_TOOL_CACHE.mode ?? "positive",
  );
  const [output, setOutput] = useState("");
  const [provider, setProvider] = useState<"llm" | "template" | null>(null);
  const [randomResult, setRandomResult] = useState<EnrichedToolGenerateResult | null>(
    null,
  );
  const [randomSeed, setRandomSeed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resultMeta, setResultMeta] = useState<Pick<
    GenerateResponse,
    "model" | "comfyNode" | "limits"
  > | null>(null);

  const input = toolSettings.hints ?? "";
  const setInput = useCallback(
    (value: string) => {
      updateToolSettings({ hints: value });
      rememberDraftFields({
        toolKey: "generate",
        label: "Generate",
        href: "/",
        fields: [value],
      });
    },
    [updateToolSettings],
  );

  useSeedToolDraft(mounted, {
    toolKey: "generate",
    label: "Generate",
    href: "/",
    fields: [input],
  });

  const hintSource = resolveGenerateHintSource(toolSettings);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const generateSource = hintSource === "random" ? "random" : "keywords";
  const genre = toolSettings.genre ?? "";
  const includePeople = toolSettings.includePeople !== false;
  const wildness = toolSettings.wildness ?? 65;
  const effectiveWildness = useMemo(
    () => applyRatingDrivenWildness(wildness),
    [wildness],
  );

  const queueModel = shared.model;
  // Prompt writing uses a T2I profile when an edit checkpoint is selected for queueing.
  const generateModel = useMemo(
    () => resolveModelForPromptGeneration(queueModel, "generate"),
    [queueModel],
  );
  const detail = shared.detail;
  const variationEnabled = toolSettings.variationEnabled ?? true;
  const variationStrength = toolSettings.variationStrength ?? 65;
  const distinctPeople = toolSettings.distinctPeople ?? true;
  const alwaysIncludeClothing = shared.alwaysIncludeClothing !== false;
  const autoFixRules = shared.autoFixRules !== false;

  const actions = usePromptResultActions({
    tool: hintSource === "random" ? "randomScene" : "generate",
    model: queueModel,
    detail,
    hints: hintSource === "random" ? genre : input,
    autoFixRules,
    reformatTarget: getReformatTargetModel(generateModel),
  });

  const variationSeed = readVariationSeedFromResult(
    randomResult ?? { metadata: undefined, seed: undefined },
  );

  const setQueueModel = (model: ComfyImageModel) => updateShared({ model });
  const setDetail = (value: DetailLevel) => updateShared({ detail: value });
  const setVariationEnabled = (enabled: boolean) =>
    updateToolSettings({ variationEnabled: enabled });
  const setVariationStrength = (strength: number) =>
    updateToolSettings({ variationStrength: strength });
  const setDistinctPeople = (value: boolean) =>
    updateToolSettings({ distinctPeople: value });
  const setModeAndCache = (value: PromptMode) => {
    setMode(value);
    updateToolSettings({ mode: value });
  };

  const selectedModel = useMemo(
    () => getComfyModelDefinition(generateModel),
    [generateModel],
  );

  const activeLimits = useMemo(
    () => getDetailLimits(detail, generateModel),
    [detail, generateModel],
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (toolSettings.mode) {
        setMode(toolSettings.mode);
      }
    });
  }, [toolSettings.mode]);

  const setHintSource = (value: import("@/lib/scene-hint-source").SceneHintSource) =>
    updateToolSettings({
      hintSource: value,
      generateSource: value === "random" ? "random" : "keywords",
    });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    scheduleAfterCommit(() => {
      const params = new URLSearchParams(window.location.search);
      applyHintSourceFromSearchParams(params, updateToolSettings);
      if (params.get("source") === "random") {
        updateToolSettings({ generateSource: "random", hintSource: "random" });
      }
      const seed = params.get("seed");
      if (seed?.trim()) {
        updateShared({ lockedVariationSeed: seed.trim() });
      }

      const prefilled = params.get("input") ?? params.get("hints");
      if (prefilled?.trim()) {
        setInput(prefilled.trim());
        if (params.get("hintSource") === "manual") {
          updateToolSettings({ hintSource: "manual", generateSource: "keywords" });
        }
      }

      const scene = parseScenePresetFromSearch(window.location.search);
      if (!scene) {
        return;
      }

      const applied = applyShareableSceneParams(scene);
      if (applied.hints?.trim()) {
        setInput(applied.hints.trim());
      }
      updateShared({
        lockedWardrobeId: applied.lockedWardrobeId,
        lockedLocation: applied.lockedLocation,
        lockedVariationSeed: applied.lockedVariationSeed,
      });
      if (applied.sportPresetId) {
        updateToolSettings({ sportPresetId: applied.sportPresetId });
        const preset = getSportPreset(applied.sportPresetId);
        if (preset) {
          setInput(preset.hints);
        }
      }
    });
  }, [updateShared, updateToolSettings]);

  const historyCandidateCount = countHistorySeedCandidates("generate", historySeedScope);
  const generateDisabledReason =
    hintSource === "history" && historyCandidateCount === 0
      ? "Save a few prompts to Studio history first, or switch hint source."
      : hintSource === "manual" && !input.trim()
        ? "Enter scene keywords above to enable generation."
        : null;

  const submitDisabled =
    !mounted ||
    loading ||
    (hintSource === "random"
      ? false
      : hintSource === "history"
        ? historyCandidateCount === 0
        : !input.trim());
  const submitDisabledReason =
    generateDisabledReason ??
    (loading ? "Generating…" : null);

  const generateRandom = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();
    setRandomResult(null);
    setRandomSeed(null);
    setProvider(null);
    setResultMeta(null);

    try {
      const response = await fetch("/api/random-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: queueModel,
          detail,
          genre,
          includePeople,
          wildness: effectiveWildness,
          recentLocations: getRecent(),
          recentClothing: getRecentClothing(),
          blockedLocations: getBlocklist(),
          lockedWardrobeId: shared.lockedWardrobeId,
          lockedLocation: shared.lockedLocation,
          variationSeed: shared.lockedVariationSeed,
          alwaysIncludeClothing: alwaysIncludeClothing,
          ...avoidedTokensRequestBody(),
          ...sharedLlmRequestBody(shared),
        }),
      });

      const data = (await response.json()) as EnrichedToolGenerateResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed.");
      }

      recordLocation(readSceneLocationFromMetadata(data.metadata));
      recordClothing(readClothingIdsFromMetadata(data.metadata));

      const prompt = await actions.finalizePrompt(data.prompt, genre);
      setOutput(prompt);
      setRandomResult({ ...data, prompt });
      setRandomSeed(data.seed ?? null);
      setProvider(data.provider ?? null);
      setResultMeta({
        model: data.model ?? queueModel,
        comfyNode: data.comfyNode ?? selectedModel.comfyNode,
        limits: data.limits ?? activeLimits,
      });
      markOnboardingFirstGenerate();
    } catch (err) {
      setOutput("");
      setRandomResult(null);
      setRandomSeed(null);
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [
    actions,
    activeLimits,
    alwaysIncludeClothing,
    detail,
    genre,
    getBlocklist,
    getRecent,
    getRecentClothing,
    includePeople,
    queueModel,
    recordClothing,
    recordLocation,
    selectedModel.comfyNode,
    shared.lockedLocation,
    shared.lockedVariationSeed,
    shared.lockedWardrobeId,
    effectiveWildness,
  ]);

  const generate = useCallback(async () => {
    if (hintSource === "random") {
      await generateRandom();
      return;
    }

    if (!input.trim()) {
      setError("Enter a topic or keywords first.");
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    const effectiveInput =
      applyLockedLocation(input, shared.lockedLocation) ?? input.trim();

    try {
      if (mode === "positive" && effectiveInput.trim()) {
        await actions.runPreLint(effectiveInput);
      }

      const requestBody = {
        input: effectiveInput,
        mode,
        variation: {
          enabled: mode === "positive" && variationEnabled,
          strength: variationStrength,
        },
        distinctPeople: mode === "positive" && distinctPeople,
        alwaysIncludeClothing: mode === "positive" && alwaysIncludeClothing,
        recentClothing: getRecentClothing(),
        detail: mode === "positive" ? detail : "balanced",
        model: queueModel,
        lockedWardrobeId: shared.lockedWardrobeId,
        lockedLocation: shared.lockedLocation,
        variationSeed: shared.lockedVariationSeed,
        ...avoidedTokensRequestBody(),
        ...sharedLlmRequestBody(shared),
      };

      let data: GenerateResponse;
      try {
        // Prefer the streaming endpoint for progressive fill; fall back to the
        // plain JSON endpoint on busy (429), network, or parse failures.
        data = (await streamGeneratePrompt(requestBody, {
          onDelta: (_delta, accumulated) => setOutput(accumulated),
        })) as GenerateResponse;
      } catch (streamErr) {
        console.warn(
          "[generate] stream failed, falling back to /api/generate:",
          streamErr instanceof Error ? streamErr.message : streamErr,
        );

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const fallback = (await response.json()) as GenerateResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(fallback.error ?? "Generation failed.");
        }

        data = fallback;
      }

      recordClothing(readClothingIdsFromMetadata(data.metadata));

      const prompt =
        mode === "positive"
          ? await actions.finalizePrompt(data.prompt, effectiveInput)
          : data.prompt;
      setOutput(prompt);
      setProvider(data.provider);
      setResultMeta({
        model: data.model,
        comfyNode: data.comfyNode,
        limits: data.limits,
      });
      markOnboardingFirstGenerate();
    } catch (err) {
      setOutput("");
      setProvider(null);
      setResultMeta(null);
      setRandomResult(null);
      setRandomSeed(null);
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }, [generateRandom, hintSource, input, mode, variationEnabled, variationStrength, distinctPeople, alwaysIncludeClothing, detail, queueModel, getRecentClothing, recordClothing, actions, shared.lockedLocation, shared.lockedWardrobeId, shared.lockedVariationSeed]);

  const copyOutput = useCallback(async () => {
    if (!output) return;

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
          ComfyUI · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="ComfyUI Image Prompt Generator"
      description={
        <>
          Enter a topic or keywords. The generator formats natural-language
          prompts for your chosen ComfyUI image model—{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-violet-300">
            {selectedModel.comfyNode}
          </code>
          , ready to paste and run.
        </>
      }
      sidebarTitle="Generation settings"
      sidebarDescription="Model, detail, and wardrobe options for this run."
      sidebar={
        <SharedToolControls
          toolId="generate"
          shared={shared}
          onSharedSettingsChange={updateShared}
          onModelChange={setQueueModel}
          onDetailChange={setDetail}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={
            mode === "positive" && (hintSource !== "random" || includePeople)
          }
          alwaysIncludeClothing={alwaysIncludeClothing}
          onAlwaysIncludeClothingChange={(value) =>
            updateShared({ alwaysIncludeClothing: value })
          }
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedLocation={shared.lockedLocation}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          onClearLockedVariationSeed={() =>
            updateShared({ lockedVariationSeed: undefined })
          }
          autoFixRules={autoFixRules}
          onAutoFixRulesChange={(value) => updateShared({ autoFixRules: value })}
          recommendFromText={input || output}
        />
      }
    >
      <ToolSection
        title="Scene setup"
        description="Describe what you want to generate, or roll a random surprise scene."
      >
        <HistoryHintSeedPanel
          tool="generate"
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={input}
          randomTheme={genre}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={setHintSource}
          onHistorySeedScopeChange={(scope) =>
            updateToolSettings({ historySeedScope: scope })
          }
          onHintsChange={setInput}
          onRandomThemeChange={(value) => updateToolSettings({ genre: value })}
          onHistorySeedApplied={(result) => {
            setInput(result.hints);
            updateToolSettings({ lastHistorySeedEntryId: result.entryId });
          }}
          accentFocusClassName={accentFocusClass(ACCENT)}
        />

        <FieldDivider />

        {hintSource === "random" ? (
          <>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={includePeople}
                onChange={(e) =>
                  updateToolSettings({ includePeople: e.target.checked })
                }
                className="ui-checkbox"
              />
              Include people in random ingredients
            </label>

            <FieldDivider />

            <VariationSliderField
              label={SCENE_WILDNESS_LABEL}
              value={wildness}
              onChange={(value) => updateToolSettings({ wildness: value })}
              valueLabel={ratingDrivenWildnessLabel(wildness)}
              minLabel="Safe"
              maxLabel="Wild"
              accentRingClassName={accentRingClass(ACCENT)}
            />
          </>
        ) : (
          <>
        {mode === "positive" && (
          <CollapsibleSection
            title="Browse presets & scene setup"
            summary="Scene starters, example tags, people handling, and variation strength."
            defaultOpen={false}
            persistKey="generate-browse-presets"
          >
            <SceneStarterPresetChips
              mode="all"
              accent={ACCENT}
              currentHints={input}
              variationsTarget="generate"
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
              selectedId={toolSettings.sceneStarterPresetId ?? toolSettings.sportPresetId}
              onSelect={(preset) => {
                updateToolSettings({
                  sceneStarterPresetId: preset.id,
                  sportPresetId: isSportStarterPreset(preset.id) ? preset.id : undefined,
                  hintSource: "manual",
                  generateSource: "keywords",
                });
                setInput(preset.hints);
                applySceneStarterWorkflowHints(preset, updateShared);
              }}
            />

            <FieldDivider />

            <div className="flex flex-wrap gap-2">
              {EXAMPLE_INPUTS.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setInput(example)}
                  className="ui-tag"
                >
                  {example}
                </button>
              ))}
            </div>

            <FieldDivider />

            <div className="space-y-3">
              <FieldLabel hint="Choose how multiple people are written into the prompt.">
                People in scene
              </FieldLabel>
              <div className="flex flex-wrap gap-2">
                <ChipButton
                  active={distinctPeople}
                  onClick={() => setDistinctPeople(true)}
                >
                  Distinct individuals
                </ChipButton>
                <ChipButton
                  active={!distinctPeople}
                  onClick={() => setDistinctPeople(false)}
                >
                  Grouped / couple
                </ChipButton>
              </div>
              <p className="type-caption text-[var(--text-muted)]">
                {distinctPeople
                  ? "Splits two men / two women into separate left-right descriptions. Gender from your input is enforced."
                  : "Writes pairs as one unified couple or ensemble—not split into separate people."}
              </p>
            </div>

            <FieldDivider />

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <FieldLabel hint="Randomize people, lighting, framing, and palette each run.">
                  {RANDOMIZE_INGREDIENTS_LABEL}
                </FieldLabel>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <span className="type-caption text-[var(--text-tertiary)]">
                    {variationEnabled ? "On" : "Off"}
                  </span>
                  <input
                    type="checkbox"
                    checked={variationEnabled}
                    onChange={(e) => setVariationEnabled(e.target.checked)}
                    className="ui-checkbox"
                  />
                </label>
              </div>

              {variationEnabled && (
                <div className="space-y-3">
                  <VariationSliderField
                    showLabel={false}
                    value={variationStrength}
                    onChange={setVariationStrength}
                    valueLabel={`${rollVariationLabel(variationStrength)} (${variationStrength})`}
                    minLabel="Subtle"
                    maxLabel="Wild"
                    accentRingClassName={accentRingClass(ACCENT)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Subtle", value: 20 },
                      { label: "Light", value: 40 },
                      { label: "Balanced", value: 65 },
                      { label: "Wild", value: 95 },
                    ].map((preset) => (
                      <ChipButton
                        key={preset.label}
                        active={variationStrength === preset.value}
                        onClick={() => setVariationStrength(preset.value)}
                      >
                        {preset.label}
                      </ChipButton>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        <FieldDivider />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="edit-input" className="text-sm font-medium text-[var(--text-primary)]">
            Scene idea or keywords
          </label>
          <SegmentedControl
            aria-label="Prompt mode"
            value={mode}
            onChange={setModeAndCache}
            options={[
              { value: "positive", label: "Positive" },
              { value: "negative", label: "Negative / Preserve", tone: "danger" },
            ]}
          />
        </div>

        <TextArea
          id="edit-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void generate();
            }
          }}
          placeholder={
            mode === "positive"
              ? "e.g. neon alley, rain, black cat — any topic or words to paint into a scene"
              : "e.g. do not change face, skin tone, or pose"
          }
          rows={5}
          className={`text-base ${accentFocusClass(ACCENT)}`}
        />

        {modelUsesTagAssist(queueModel) ? (
          <TagAssistToolbar value={input} onChange={setInput} textareaId="edit-input" />
        ) : null}
          </>
        )}

        <FieldDivider />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          type="button"
          data-action="primary-generate"
          onClick={() => void generate()}
          disabled={submitDisabled}
          loading={loading}
          loadingLabel={
            hintSource === "random"
              ? "Generating random scene"
              : "Generating scene prompt"
          }
          title={submitDisabledReason ?? undefined}
          aria-disabled={submitDisabled}
        >
          {hintSource === "random"
            ? "Generate random scene"
            : "Generate scene prompt"}
        </PrimaryButton>

        {submitDisabledReason && !loading && (
          <FieldError>{submitDisabledReason}</FieldError>
        )}

        {error && <FieldError>{error}</FieldError>}
      </ToolSection>

      {output && (hintSource === "random" || mode === "positive") && (
        <EnhancedPromptResult
          output={output}
          provider={provider}
          comfyNode={resultMeta?.comfyNode ?? selectedModel.comfyNode}
          limits={resultMeta?.limits}
          readinessModel={shared.model}
          readinessDetail={shared.detail}
          copied={copied}
          onCopy={() => void copyOutput()}
          extraMeta={
            hintSource === "random" && randomSeed
              ? `seed: ${randomSeed}`
              : resultMeta
                ? `${resultMeta.limits.minChars ? `${resultMeta.limits.minChars}–` : ""}${resultMeta.limits.maxChars} char limit · ${output.length} chars`
                : undefined
          }
          diagnostics={actions.diagnostics ?? randomResult?.diagnostics ?? null}
          preDiagnostics={actions.preDiagnostics}
          onSaveHistory={() =>
            actions.saveHistory({
              prompt: output,
              hints: hintSource === "random" ? genre : input,
              metadata: randomResult?.metadata,
            })
          }
          onSendComfyUi={() => void actions.sendComfyUi(output)}
          onEditPrompt={() =>
            actions.editPromptOutput(
              output,
              actions.comfyUiPreviewUrl,
              undefined,
              hintSource === "random" ? genre : input,
            )
          }
          {...promptResultPreviewProps(actions, output)}
          onFixPrompt={() =>
            void actions.fixPrompt(
              output,
              setOutput,
              hintSource === "random" ? genre : input,
            )
          }
          onCopyPair={() => void actions.copyPromptPair(output)}
          onCompact={() => void actions.compactPrompt(output, setOutput)}
          onReformat={() => void actions.reformatForModel(output, setOutput)}
          reformatTargetLabel={getReformatTargetLabel(generateModel)}
          onRunPipeline={() =>
            void actions.runExportPipeline(output, setOutput, {
              maxChars: resultMeta?.limits?.maxChars,
              queueComfyUi: true,
            })
          }
          onExportSidecar={() =>
            void actions.exportSidecar(output, {
              comfyNode: resultMeta?.comfyNode ?? selectedModel.comfyNode,
              variationSeed: variationSeed ?? shared.lockedVariationSeed,
              metadata: randomResult?.metadata,
            })
          }
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
        />
      )}

      {output && mode === "negative" && (
        <ToolSection title="Generated preserve / negative prompt">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {provider ? (
              <p className="type-caption">
                via {provider === "llm" ? "LLM" : "template fallback"}
              </p>
            ) : (
              <span />
            )}
            <Button variant="secondary" size="sm" onClick={() => void copyOutput()}>
              {copied ? "Copied!" : "Copy for ComfyUI"}
            </Button>
          </div>
          <CodeBlock>{output}</CodeBlock>
        </ToolSection>
      )}

      {output && hintSource !== "random" && mode === "positive" && (
        <p className="-mt-4 text-xs text-zinc-500">
          Paste into{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            {resultMeta?.comfyNode ?? selectedModel.comfyNode}
          </code>
          . Press Ctrl+Enter to regenerate.
        </p>
      )}

      <ToolSection className="text-sm text-zinc-500">
        <h3 className="font-medium text-zinc-300">How it works</h3>
        <ul className="mt-3 list-inside list-disc space-y-2 leading-relaxed">
          <li>
            Pick your{" "}
            <strong className="font-medium text-zinc-400">target model</strong>
            —SD1.5, SDXL, SD3, Flux, Qwen Image, Hunyuan, PixArt, and more—each
            uses a prompt style tuned for that architecture.
          </li>
          <li>
            <strong className="font-medium text-zinc-400">Edit-2511</strong>{" "}
            favors explicit keep/change instructions and Figure 1 / Figure 2
            references for multi-image workflows.
          </li>
          <li>
            <strong className="font-medium text-zinc-400">FLUX.2 Klein</strong>{" "}
            wants subject-first photographic prose—materials, lighting, camera.
            Negative prompts are ignored; use positive phrasing instead.
          </li>
          <li>
            <strong className="font-medium text-zinc-400">Image-2512</strong>{" "}
            favors concise factual prose with color, texture, and spatial
            relationships—quote visible text in double quotes.
          </li>
          <li>
            <strong className="font-medium text-zinc-400">Image-2.0</strong>{" "}
            Rich detail targets at least ~1100 characters (max ~1400).
          </li>
          <li>
            Use <strong className="font-medium text-zinc-400">Concise</strong>{" "}
            if Qwen output still looks jumbled; use{" "}
            <strong className="font-medium text-zinc-400">Rich</strong> when
            scenes feel too thin.
          </li>
          <li>
            Separate ideas with commas, but keep the output focused—Qwen renders
            cleaner with 2–3 short sentences, not dense prose.
          </li>
          <li>
            Use <strong className="font-medium text-zinc-400">Distinct
            individuals</strong> when your input has two or more people—it
            breaks them into separate, fully described characters.
          </li>
          <li>
            Use the variation seed toggle to control randomness—off for
            consistent output, higher strength for more diverse scenes.
          </li>
          <li>
            Add &quot;keep face/pose&quot; if you want the subject preserved while
            the surroundings are repainted in words.
          </li>
        </ul>
      </ToolSection>
    </ToolLayout>
  );
}
