'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applySceneStarterWorkflowHints } from '@/lib/scene-starter-workflow-hints';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRecentClothing } from '@/hooks/useRecentClothing';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import { readClothingIdsFromMetadata } from '@/lib/recent-clothing';
import { readSceneLocationFromMetadata } from '@/lib/recent-locations';
import type { DetailLevel } from '@/lib/detail-level';
import { getDetailLimits } from '@/lib/detail-level';
import { getComfyModelDefinition, type ComfyImageModel } from '@/lib/comfy-models/client';
import { DEFAULT_GENERATE_TOOL_CACHE } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { readVariationSeedFromResult } from '@/lib/variation-seed-metadata';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { applyRatingDrivenWildness } from '@/lib/rating-driven-random';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { streamGeneratePrompt } from '@/lib/generate-stream-client';
import { applyLockedLocation } from '@/lib/locked-location';
import { resolveModelForPromptGeneration } from '@/lib/queue-tool-model';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { applyShareableSceneParams, parseScenePresetFromSearch } from '@/lib/scene-preset-url';
import { getSportPreset, isSportStarterPreset } from '@/lib/sport-presets';
import { applyHintSourceFromSearchParams } from '@/lib/tool-url-params';
import { markOnboardingFirstGenerate } from '@/lib/onboarding-hooks';
import { markComfyQueueIntent } from '@/lib/comfy-setup-intent';
import { consumeGenerateHandoff } from '@/lib/generate-handoff';
import { normalizeHistorySeedScope, resolveGenerateHintSource } from '@/lib/scene-hint-source';
import { countHistorySeedCandidates } from '@/lib/history-hint-seed';

export type PromptMode = 'positive' | 'negative';

export type GenerateResponse = {
  prompt: string;
  mode: PromptMode;
  provider: 'llm' | 'template';
  model: ComfyImageModel;
  comfyNode: string;
  limits: {
    minChars?: number;
    maxChars: number;
    maxSentences: number;
    maxTokens: number;
  };
  metadata?: {
    rawPrompt?: string;
    wardrobeAssignments?: Array<{
      wardrobeId?: string | null;
      footwearId?: string | null;
      accessoriesId?: string | null;
    }>;
  };
};

export const EXAMPLE_INPUTS = [
  'neon alley, rain, black cat',
  'two women, rooftop bar, city lights',
  'gothic cathedral, candles, fog',
  'cyberpunk city at night',
];

export function useGenerateToolOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'generate',
    DEFAULT_GENERATE_TOOL_CACHE
  );
  const { getRecent, record: recordLocation } = useRecentLocations();
  const { getRecent: getRecentClothing, record: recordClothing } = useRecentClothing();
  const { getBlocklist } = useLocationBlocklist();
  const [mode, setMode] = useState<PromptMode>(DEFAULT_GENERATE_TOOL_CACHE.mode ?? 'positive');
  const [output, setOutput] = useState('');
  const [handoffNegative, setHandoffNegative] = useState('');
  const [showHandoffNegative, setShowHandoffNegative] = useState(false);
  const [provider, setProvider] = useState<'llm' | 'template' | null>(null);
  const [randomResult, setRandomResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [randomSeed, setRandomSeed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resultMeta, setResultMeta] = useState<Pick<
    GenerateResponse,
    'model' | 'comfyNode' | 'limits' | 'metadata'
  > | null>(null);

  const pendingFirstRunRef = useRef({
    autogen: false,
    autoqueue: false,
    generated: false,
    queued: false,
  });

  const input = toolSettings.hints ?? '';
  const setInput = useCallback(
    (value: string) => {
      updateToolSettings({ hints: value });
      rememberDraftFields({
        toolKey: 'generate',
        label: 'Generate',
        href: '/',
        fields: [value],
      });
    },
    [updateToolSettings]
  );

  useSeedToolDraft(mounted, {
    toolKey: 'generate',
    label: 'Generate',
    href: '/',
    fields: [input],
  });

  const hintSource = resolveGenerateHintSource(toolSettings);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const genre = toolSettings.genre ?? '';
  const includePeople = toolSettings.includePeople !== false;
  const wildness = toolSettings.wildness ?? 65;
  const effectiveWildness = useMemo(() => applyRatingDrivenWildness(wildness), [wildness]);

  const queueModel = shared.model;
  const generateModel = useMemo(
    () => resolveModelForPromptGeneration(queueModel, 'generate'),
    [queueModel]
  );
  const detail = shared.detail;
  const variationEnabled = toolSettings.variationEnabled ?? true;
  const variationStrength = toolSettings.variationStrength ?? 65;
  const distinctPeople = toolSettings.distinctPeople ?? true;
  const alwaysIncludeClothing = shared.alwaysIncludeClothing !== false;
  const seedLlmWithIngredients = shared.seedLlmWithIngredients !== false;
  const autoFixRules = shared.autoFixRules !== false;

  const actions = usePromptResultActions({
    tool: hintSource === 'random' ? 'randomScene' : 'generate',
    model: queueModel,
    detail,
    hints: hintSource === 'random' ? genre : input,
    autoFixRules,
    reformatTarget: getReformatTargetModel(generateModel),
  });

  const queueGenerate = useCallback(() => {
    markComfyQueueIntent();
    const explicitNegative = handoffNegative.trim() || undefined;
    void actions.sendComfyUi(output, undefined, undefined, { explicitNegative });
  }, [actions, handoffNegative, output]);

  const variationSeed = readVariationSeedFromResult(
    randomResult ?? { metadata: undefined, seed: undefined }
  );

  const setQueueModel = (model: ComfyImageModel) => updateShared({ model });
  const setDetail = (value: DetailLevel) => updateShared({ detail: value });
  const setVariationEnabled = (enabled: boolean) =>
    updateToolSettings({ variationEnabled: enabled });
  const setVariationStrength = (strength: number) =>
    updateToolSettings({ variationStrength: strength });
  const setDistinctPeople = (value: boolean) => updateToolSettings({ distinctPeople: value });
  const setModeAndCache = (value: PromptMode) => {
    setMode(value);
    updateToolSettings({ mode: value });
  };

  const selectedModel = useMemo(() => getComfyModelDefinition(generateModel), [generateModel]);

  const activeLimits = useMemo(
    () => getDetailLimits(detail, generateModel),
    [detail, generateModel]
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (toolSettings.mode) {
        setMode(toolSettings.mode);
      }
    });
  }, [toolSettings.mode]);

  const setHintSource = (value: import('@/lib/scene-hint-source').SceneHintSource) =>
    updateToolSettings({
      hintSource: value,
      generateSource: value === 'random' ? 'random' : 'keywords',
    });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    scheduleAfterCommit(() => {
      const params = new URLSearchParams(window.location.search);
      applyHintSourceFromSearchParams(params, updateToolSettings);
      if (params.get('source') === 'random') {
        updateToolSettings({ generateSource: 'random', hintSource: 'random' });
      }
      const autogen = params.get('autogen') === '1';
      const autoqueue = params.get('autoqueue') === '1';
      if (autogen || autoqueue) {
        pendingFirstRunRef.current = { autogen, autoqueue, generated: false, queued: false };
      }
      const seed = params.get('seed');
      if (seed?.trim()) {
        updateShared({ lockedVariationSeed: seed.trim() });
      }

      const prefilled = params.get('input') ?? params.get('hints');
      if (prefilled?.trim()) {
        setInput(prefilled.trim());
        if (params.get('hintSource') === 'manual') {
          updateToolSettings({ hintSource: 'manual', generateSource: 'keywords' });
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
  }, [updateShared, updateToolSettings, setInput]);

  useEffect(() => {
    const handoff = consumeGenerateHandoff();
    if (!handoff) {
      return;
    }
    scheduleAfterCommit(() => {
      setOutput(handoff.prompt);
      const negative = handoff.negativePrompt?.trim() || '';
      setHandoffNegative(negative);
      setShowHandoffNegative(Boolean(negative));
      updateToolSettings({ hintSource: 'manual', generateSource: 'keywords' });
    });
  }, [updateToolSettings]);

  const historyCandidateCount = mounted
    ? countHistorySeedCandidates('generate', historySeedScope)
    : 0;
  const generateDisabledReason =
    hintSource === 'history' && historyCandidateCount === 0
      ? 'Save a few prompts to Studio history first, or switch hint source.'
      : hintSource === 'manual' && !input.trim()
        ? 'Enter scene keywords above to enable generation.'
        : null;

  const submitDisabled =
    !mounted ||
    loading ||
    (hintSource === 'random'
      ? false
      : hintSource === 'history'
        ? historyCandidateCount === 0
        : !input.trim());
  const submitDisabledReason = generateDisabledReason ?? (loading ? 'Generating…' : null);

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
      const response = await fetch('/api/random-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          seedLlmWithIngredients,
          ...avoidedTokensRequestBody(),
          ...sharedLlmRequestBody(shared),
        }),
      });

      const data = (await response.json()) as EnrichedToolGenerateResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? 'Generation failed.');
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
        metadata: data.metadata,
      });
      markOnboardingFirstGenerate();
    } catch (err) {
      setOutput('');
      setRandomResult(null);
      setRandomSeed(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
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
    shared,
    effectiveWildness,
    seedLlmWithIngredients,
  ]);

  const generate = useCallback(async () => {
    if (hintSource === 'random') {
      await generateRandom();
      return;
    }

    if (!input.trim()) {
      setError('Enter a topic or keywords first.');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    const effectiveInput =
      (mode === 'positive' && seedLlmWithIngredients
        ? applyLockedLocation(input, shared.lockedLocation)
        : null) ?? input.trim();

    try {
      if (mode === 'positive' && effectiveInput.trim()) {
        await actions.runPreLint(effectiveInput);
      }

      const requestBody = {
        input: effectiveInput,
        mode,
        variation: {
          enabled: mode === 'positive' && variationEnabled,
          strength: variationStrength,
        },
        distinctPeople: mode === 'positive' && distinctPeople,
        alwaysIncludeClothing: mode === 'positive' && alwaysIncludeClothing,
        seedLlmWithIngredients: mode === 'positive' && seedLlmWithIngredients,
        recentClothing: getRecentClothing(),
        detail: mode === 'positive' ? detail : 'balanced',
        model: queueModel,
        lockedWardrobeId: shared.lockedWardrobeId,
        lockedLocation: shared.lockedLocation,
        variationSeed: shared.lockedVariationSeed,
        ...avoidedTokensRequestBody(),
        ...sharedLlmRequestBody(shared),
      };

      let data: GenerateResponse;
      try {
        data = (await streamGeneratePrompt(requestBody, {
          onDelta: (_delta, accumulated) => setOutput(accumulated),
        })) as GenerateResponse;
      } catch (streamErr) {
        console.warn(
          '[generate] stream failed, falling back to /api/generate:',
          streamErr instanceof Error ? streamErr.message : streamErr
        );

        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const fallback = (await response.json()) as GenerateResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(fallback.error ?? 'Generation failed.');
        }

        data = fallback;
      }

      recordClothing(readClothingIdsFromMetadata(data.metadata));

      const prompt =
        mode === 'positive'
          ? await actions.finalizePrompt(data.prompt, effectiveInput)
          : data.prompt;
      setOutput(prompt);
      setProvider(data.provider);
      setResultMeta({
        model: data.model,
        comfyNode: data.comfyNode,
        limits: data.limits,
        metadata: data.metadata,
      });
      markOnboardingFirstGenerate();
    } catch (err) {
      setOutput('');
      setProvider(null);
      setResultMeta(null);
      setRandomResult(null);
      setRandomSeed(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [
    generateRandom,
    hintSource,
    input,
    mode,
    variationEnabled,
    variationStrength,
    distinctPeople,
    alwaysIncludeClothing,
    seedLlmWithIngredients,
    detail,
    queueModel,
    getRecentClothing,
    recordClothing,
    actions,
    shared,
  ]);

  const copyOutput = useCallback(async () => {
    if (!output) return;

    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  useEffect(() => {
    if (!mounted || loading || pendingFirstRunRef.current.generated) {
      return;
    }
    if (!pendingFirstRunRef.current.autogen || hintSource !== 'random') {
      return;
    }
    pendingFirstRunRef.current.generated = true;
    void generateRandom();
  }, [generateRandom, hintSource, loading, mounted]);

  useEffect(() => {
    if (!mounted || loading || !output.trim() || pendingFirstRunRef.current.queued) {
      return;
    }
    if (!pendingFirstRunRef.current.autoqueue) {
      return;
    }
    pendingFirstRunRef.current.autoqueue = false;
    pendingFirstRunRef.current.queued = true;
    queueGenerate();
  }, [loading, mounted, output, queueGenerate]);

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    mode,
    output,
    setOutput,
    handoffNegative,
    setHandoffNegative,
    showHandoffNegative,
    provider,
    randomResult,
    randomSeed,
    loading,
    error,
    copied,
    resultMeta,
    input,
    setInput,
    hintSource,
    historySeedScope,
    genre,
    includePeople,
    wildness,
    queueModel,
    generateModel,
    detail,
    variationEnabled,
    variationStrength,
    distinctPeople,
    alwaysIncludeClothing,
    seedLlmWithIngredients,
    autoFixRules,
    actions,
    queueGenerate,
    variationSeed,
    setQueueModel,
    setDetail,
    setVariationEnabled,
    setVariationStrength,
    setDistinctPeople,
    setModeAndCache,
    selectedModel,
    setHintSource,
    historyCandidateCount,
    submitDisabled,
    submitDisabledReason,
    generateRandom,
    generate,
    copyOutput,
  };
}
