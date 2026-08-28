'use client';

import { useCallback, useEffect } from 'react';
import { readClothingIdsFromMetadata } from '@/lib/recent-clothing';
import { readSceneLocationFromMetadata } from '@/lib/recent-locations';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { streamGeneratePrompt } from '@/lib/generate-stream-client';
import { applyLockedLocation } from '@/lib/locked-location';
import { applyShareableSceneParams, parseScenePresetFromSearch } from '@/lib/scene-preset-url';
import { getSportPreset } from '@/lib/sport-presets';
import { applyHintSourceFromSearchParams } from '@/lib/tool-url-params';
import { markOnboardingFirstGenerate } from '@/lib/onboarding-hooks';
import { markComfyQueueIntent } from '@/lib/comfy-setup-intent';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { GenerateResponse } from '@/hooks/generate/generate-tool-orchestration-types';
import type { GenerateToolOrchestrationCore } from '@/hooks/generate/useGenerateToolOrchestrationCore';

export function useGenerateToolOrchestrationPart2(ctx: GenerateToolOrchestrationCore) {
  const {
    mounted,
    shared,
    updateShared,
    updateToolSettings,
    mode,
    output,
    setOutput,
    handoffNegative,
    provider,
    setProvider,
    randomResult,
    setRandomResult,
    randomSeed,
    setRandomSeed,
    loading,
    setLoading,
    error,
    setError,
    copied,
    setCopied,
    resultMeta,
    setResultMeta,
    pendingFirstRunRef,
    input,
    setInput,
    hintSource,
    genre,
    includePeople,
    effectiveWildness,
    queueModel,
    detail,
    variationEnabled,
    variationStrength,
    distinctPeople,
    alwaysIncludeClothing,
    seedLlmWithIngredients,
    actions,
    selectedModel,
    activeLimits,
    getRecent,
    getRecentClothing,
    recordClothing,
    recordLocation,
    getBlocklist,
  } = ctx;

  const queueGenerate = useCallback(() => {
    markComfyQueueIntent();
    const explicitNegative = handoffNegative.trim() || undefined;
    void actions.sendComfyUi(output, undefined, undefined, { explicitNegative });
  }, [actions, handoffNegative, output]);

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
  }, [updateShared, updateToolSettings, setInput, pendingFirstRunRef]);

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
    setCopied,
    setError,
    setLoading,
    setOutput,
    setProvider,
    setRandomResult,
    setRandomSeed,
    setResultMeta,
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
    setCopied,
    setError,
    setLoading,
    setOutput,
    setProvider,
    setRandomResult,
    setRandomSeed,
    setResultMeta,
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
  }, [output, setCopied, setError]);

  useEffect(() => {
    if (!mounted || loading || pendingFirstRunRef.current.generated) {
      return;
    }
    if (!pendingFirstRunRef.current.autogen || hintSource !== 'random') {
      return;
    }
    pendingFirstRunRef.current.generated = true;
    void generateRandom();
  }, [generateRandom, hintSource, loading, mounted, pendingFirstRunRef]);

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
  }, [loading, mounted, output, queueGenerate, pendingFirstRunRef]);

  return {
    queueGenerate,
    generateRandom,
    generate,
    copyOutput,
  };
}
