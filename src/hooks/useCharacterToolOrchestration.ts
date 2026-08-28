'use client';

import { useCallback, useEffect, useState } from 'react';
import { applySceneStarterWorkflowHints } from '@/lib/scene-starter-workflow-hints';
import { applyHintSourceFromSearchParams } from '@/lib/tool-url-params';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { resolveSceneHintsForGeneration } from '@/components/scene-tool/HistoryHintSeedPanel';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { countHistorySeedCandidates } from '@/lib/history-hint-seed';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRecentLocations } from '@/hooks/useRecentLocations';
import { useRecentClothing } from '@/hooks/useRecentClothing';
import { useLocationBlocklist } from '@/hooks/useLocationBlocklist';
import { fetchClothingLabels, getCachedClothingLabel } from '@/lib/clothing-catalog-client';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { presetOptionsFromBackgroundCache } from '@/lib/background-options';
import { readSceneLocationFromMetadata } from '@/lib/recent-locations';
import { readClothingIdsFromMetadata } from '@/lib/recent-clothing';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { regionalPromptCustomTokens } from '@/lib/regional-prompt-builder';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { presetOptionsFromCache } from '@/lib/character-options-ui';
import { DEFAULT_CHARACTER_TOOL_CACHE, type CharacterSceneMode } from '@/lib/settings-cache';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import {
  readVariationSeedFromMetadata,
  readVariationSeedFromResult,
} from '@/lib/variation-seed-metadata';
import { downloadTextFile } from '@/lib/prompt-pair';
import { applyShareableSceneParams, parseScenePresetFromSearch } from '@/lib/scene-preset-url';
import { getSportPreset } from '@/lib/sport-presets';
import { type ToolAccent } from '@/lib/tool-theme';
import { resolveCollabFieldValue } from '@/lib/collab-presence';

const SOLO_BATCH_COUNT = 3;

export const CHARACTER_SCENE_MODE_OPTIONS: Array<{
  value: CharacterSceneMode;
  label: string;
  description: string;
}> = [
  { value: 'solo', label: 'Solo', description: 'Single person portrait or action' },
  { value: 'duo', label: 'Duo / sport', description: 'Two people, teams, and competition' },
  {
    value: 'compose',
    label: 'With background',
    description: 'Subject plus generated environment merged together',
  },
];

export function accentForSceneMode(mode: CharacterSceneMode): ToolAccent {
  if (mode === 'duo') {
    return 'emerald';
  }
  if (mode === 'compose') {
    return 'cyan';
  }
  return 'sky';
}

function historyToolForSceneMode(mode: CharacterSceneMode): 'character' | 'duo' | 'scene-compose' {
  if (mode === 'duo') {
    return 'duo';
  }
  if (mode === 'compose') {
    return 'scene-compose';
  }
  return 'character';
}

function historySeedToolForSceneMode(mode: CharacterSceneMode): 'character' | 'duo' | 'compose' {
  if (mode === 'duo') {
    return 'duo';
  }
  if (mode === 'compose') {
    return 'compose';
  }
  return 'character';
}

export function presetVariantForSceneMode(mode: CharacterSceneMode): 'solo' | 'duo' | 'compose' {
  if (mode === 'duo') {
    return 'duo';
  }
  if (mode === 'compose') {
    return 'compose';
  }
  return 'solo';
}

function defaultPortraitStyle(mode: CharacterSceneMode): 'portrait' | 'full-body' | 'action' {
  return mode === 'solo' ? 'portrait' : 'action';
}

function parseSceneMode(value: string | null): CharacterSceneMode | null {
  if (value === 'solo' || value === 'duo' || value === 'compose') {
    return value;
  }
  return null;
}

export function useCharacterToolOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'character',
    DEFAULT_CHARACTER_TOOL_CACHE
  );
  const { getRecent, record: recordLocation } = useRecentLocations();
  const { getRecent: getRecentClothing, record: recordClothing } = useRecentClothing();
  const { getBlocklist } = useLocationBlocklist();
  useSeedToolDraft(mounted, {
    toolKey: 'character',
    label: 'Character',
    href: '/character',
    fields: [toolSettings.hints],
  });
  const [output, setOutput] = useState('');
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
    void fetchClothingLabels([id]).then(labels => {
      if (cancelled) {
        return;
      }
      setLockedWardrobeLabel(labels.get(id) ?? id);
    });

    return () => {
      cancelled = true;
    };
  }, [shared.lockedWardrobeId]);

  const sceneMode = toolSettings.sceneMode ?? 'solo';
  const accent = accentForSceneMode(sceneMode);
  const historyTool = historyToolForSceneMode(sceneMode);
  const historySeedTool = historySeedToolForSceneMode(sceneMode);
  const hintSource = normalizeSceneHintSource(toolSettings.hintSource);
  const historySeedScope = normalizeHistorySeedScope(toolSettings.historySeedScope);
  const historyCandidateCount = countHistorySeedCandidates(historySeedTool, historySeedScope);
  const generateDisabledReason =
    hintSource === 'history' && historyCandidateCount === 0
      ? 'Save a few character prompts to Studio history first, or switch hint source.'
      : null;
  const portraitStyle = toolSettings.portraitStyle ?? defaultPortraitStyle(sceneMode);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    applyHintSourceFromSearchParams(params, updateToolSettings);
    const mode = parseSceneMode(params.get('mode'));
    if (mode) {
      updateToolSettings({ sceneMode: mode });
    }

    const hints = params.get('hints');
    const seed = params.get('seed');
    if (hints?.trim()) {
      updateToolSettings({
        hints: hints.trim(),
        ...(params.get('hintSource') === 'manual' ? { hintSource: 'manual' } : {}),
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
      updateToolSettings({ sceneMode: 'duo', sportPresetId: applied.sportPresetId });
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

        if (sceneMode === 'compose') {
          const response = await fetch('/api/compose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: shared.model,
              detail: shared.detail,
              subjectMode: toolSettings.composeSubjectMode ?? 'duo',
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
              composeStyle: toolSettings.composeStyle ?? 'layered',
              recentLocations: getRecent(),
              recentClothing: getRecentClothing(),
              blockedLocations: getBlocklist(),
              lockedWardrobeId: shared.lockedWardrobeId,
              lockedLocation: shared.lockedLocation,
              variationSeed: shared.lockedVariationSeed,
              alwaysIncludeClothing: shared.alwaysIncludeClothing !== false,
              seedLlmWithIngredients: shared.seedLlmWithIngredients !== false,
              teamKit: toolSettings.teamKit === true,
              ...avoidedTokensRequestBody(),
            }),
          });

          const data = (await response.json()) as EnrichedToolGenerateResult & {
            error?: string;
          };

          if (!response.ok) {
            throw new Error(data.error ?? 'Composition failed.');
          }

          recordLocation(readSceneLocationFromMetadata(data.metadata));
          recordClothing(readClothingIdsFromMetadata(data.metadata));
          const prompt = await actions.finalizePrompt(data.prompt, effectiveHints);
          setOutput(prompt);
          setResult({ ...data, prompt });
          return;
        }

        const presetOptions =
          sceneMode === 'duo'
            ? { ...presetOptionsFromCache(toolSettings), headcount: 'duo' as const }
            : presetOptionsFromCache(toolSettings);

        const endpoint = batch ? '/api/batch' : sceneMode === 'duo' ? '/api/duo' : '/api/character';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
            seedLlmWithIngredients: shared.seedLlmWithIngredients !== false,
            activeCharacterDescriptor: shared.activeCharacterDescriptor,
            teamKit: sceneMode === 'duo' ? toolSettings.teamKit === true : undefined,
            sportPresetId:
              sceneMode === 'duo' ? toolSettings.sportPresetId || undefined : undefined,
            count: batch
              ? sceneMode === 'duo'
                ? (toolSettings.batchCount ?? 3)
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
          throw new Error(data.error ?? 'Generation failed.');
        }

        if (batch && data.results) {
          for (const entry of data.results) {
            recordLocation(readSceneLocationFromMetadata(entry.metadata));
            recordClothing(readClothingIdsFromMetadata(entry.metadata));
          }
          setBatchResults(data.results);
          const firstPrompt = data.results[0]?.prompt ?? '';
          const finalized = firstPrompt
            ? await actions.finalizePrompt(firstPrompt, effectiveHints)
            : '';
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
        setOutput('');
        setResult(null);
        setBatchResults([]);
        setError(err instanceof Error ? err.message : 'Generation failed.');
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
    ]
  );

  const exportBatch = useCallback(() => {
    if (batchResults.length === 0) {
      return;
    }

    downloadTextFile(
      `${historyTool}-batch-${Date.now()}.txt`,
      batchResults.map((entry, index) => `# ${index + 1}\n${entry.prompt}`).join('\n\n')
    );
  }, [batchResults, historyTool]);

  const batchPrompts = batchResults.map(entry => entry.prompt);

  const copyOutput = useCallback(async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  const rememberHints = useCallback((value: string) => {
    rememberDraftFields({
      toolKey: 'character',
      label: 'Character',
      href: '/character',
      fields: [value],
    });
  }, []);

  const applyCollabDraft = useCallback(
    (payload: Parameters<typeof resolveCollabFieldValue>[0]) => {
      const nextHints = resolveCollabFieldValue(payload, 'hints');
      if (nextHints) {
        updateToolSettings({ hints: nextHints });
      }
    },
    [updateToolSettings]
  );

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    batchResults,
    setBatchResults,
    result,
    loading,
    error,
    copied,
    lockedWardrobeLabel,
    sceneMode,
    accent,
    historyTool,
    historySeedTool,
    hintSource,
    historySeedScope,
    generateDisabledReason,
    portraitStyle,
    actions,
    selectedModel,
    inferredSport,
    variationSeed,
    generate,
    exportBatch,
    batchPrompts,
    copyOutput,
    rememberHints,
    applyCollabDraft,
    soloBatchCount: SOLO_BATCH_COUNT,
  };
}
