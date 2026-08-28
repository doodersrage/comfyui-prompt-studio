'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import type { NsfwGeneratorPreset } from '@/lib/nsfw-generator-presets';
import {
  resolveNsfwGeneratorPreset,
  pickRandomNsfwGeneratorPreset,
} from '@/lib/nsfw-generator-presets';
import { DEFAULT_NSFW_GENERATOR_TOOL_CACHE } from '@/lib/settings-cache';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { applyHintSourceFromSearchParams } from '@/lib/tool-url-params';
import {
  createUserNsfwGeneratorPreset,
  deleteUserNsfwGeneratorPreset,
  loadNsfwPresetPrefs,
  loadUserNsfwGeneratorPresets,
  pushNsfwPresetRecent,
  toggleNsfwPresetFavorite,
  upsertUserNsfwGeneratorPreset,
  exportUserNsfwPresetPack,
  importUserNsfwPresetPack,
  type UserNsfwGeneratorPreset,
} from '@/lib/user-nsfw-generator-presets';
import {
  buildPresetVariationsHandoff,
  presetVariationsPath,
  savePresetVariationsHandoff,
} from '@/lib/preset-variations-handoff';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

const TOOL_ID = 'nsfw-generator';

export function useNsfwGeneratorToolOrchestration() {
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'nsfwGenerator',
    DEFAULT_NSFW_GENERATOR_TOOL_CACHE
  );
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<EnrichedToolGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [userPresets, setUserPresets] = useState<UserNsfwGeneratorPreset[]>([]);
  const [presetPrefs, setPresetPrefs] = useState(() => loadNsfwPresetPrefs());

  const selectedModel = getComfyModelDefinition(shared.model);
  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    hints: toolSettings.hints,
  });

  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      scheduleAfterCommit(() => {
        setUserPresets(loadUserNsfwGeneratorPresets());
        setPresetPrefs(loadNsfwPresetPrefs());
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    scheduleAfterCommit(() => {
      applyHintSourceFromSearchParams(params, updateToolSettings);

      const hints = params.get('hints');
      const presetId = params.get('nsfwPresetId');
      const model = params.get('model');
      if (model?.trim()) {
        updateShared({ model: model.trim() as typeof shared.model });
      }
      if (presetId?.trim()) {
        const preset = resolveNsfwGeneratorPreset(presetId.trim(), loadUserNsfwGeneratorPresets());
        if (preset) {
          updateToolSettings({
            nsfwPresetId: preset.id,
            presetCategory: preset.category,
            hints: hints?.trim() || preset.hints,
            hintSource: 'manual',
          });
          return;
        }
        updateToolSettings({ nsfwPresetId: presetId.trim() });
      }
      if (hints?.trim()) {
        updateToolSettings({
          hints: hints.trim(),
          ...(params.get('hintSource') === 'manual' ? { hintSource: 'manual' } : {}),
        });
      }
    });
  }, [updateShared, updateToolSettings]);

  const handlePresetSelect = useCallback(
    (preset: NsfwGeneratorPreset) => {
      setPresetPrefs(pushNsfwPresetRecent(preset.id));
      updateToolSettings({
        hints: preset.hints,
        nsfwPresetId: preset.id,
        presetCategory: preset.category,
      });
    },
    [updateToolSettings]
  );

  const saveCurrentAsPreset = useCallback(() => {
    const hints = toolSettings.hints?.trim();
    if (!hints) {
      setError('Add hints before saving a custom preset.');
      return;
    }
    const label =
      window
        .prompt('Preset name', toolSettings.nsfwPresetId ? 'My preset' : 'Custom scene')
        ?.trim() ?? '';
    if (!label) {
      return;
    }
    const base = resolveNsfwGeneratorPreset(toolSettings.nsfwPresetId ?? '', userPresets);
    const preset = createUserNsfwGeneratorPreset({
      label,
      hints,
      category: base?.category ?? 'subject',
      mood: base?.mood,
      duo: base?.duo,
    });
    upsertUserNsfwGeneratorPreset(preset);
    setUserPresets(loadUserNsfwGeneratorPresets());
    updateToolSettings({ nsfwPresetId: preset.id });
    setError(null);
  }, [toolSettings, userPresets, updateToolSettings]);

  const pickRandomPreset = useCallback(() => {
    const preset = pickRandomNsfwGeneratorPreset(userPresets, {
      category: toolSettings.presetCategory ?? 'all',
      duoOnly: toolSettings.duoOnly === true,
    });
    if (!preset) {
      setError('No presets match the current filters.');
      return;
    }
    handlePresetSelect(preset);
    setError(null);
  }, [handlePresetSelect, toolSettings.duoOnly, toolSettings.presetCategory, userPresets]);

  const handoffToVariations = useCallback(() => {
    const hints = toolSettings.hints?.trim();
    if (!hints) {
      setError('Add hints before opening Variations.');
      return;
    }
    savePresetVariationsHandoff(
      buildPresetVariationsHandoff({
        hints,
        target: 'generate',
        count: 4,
      })
    );
    window.location.href = presetVariationsPath();
  }, [toolSettings.hints]);

  const exportPresets = useCallback(() => {
    const payload = JSON.stringify(exportUserNsfwPresetPack(), null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `adult-presets-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const importPresetsFromFile = useCallback((file: File) => {
    void file.text().then(raw => {
      try {
        const pack = JSON.parse(
          raw
        ) as import('@/lib/user-nsfw-generator-presets').UserNsfwPresetPack;
        importUserNsfwPresetPack(pack, 'merge');
        setUserPresets(loadUserNsfwGeneratorPresets());
        setPresetPrefs(loadNsfwPresetPrefs());
        setError(null);
      } catch {
        setError('Invalid preset pack file.');
      }
    });
  }, []);

  const deleteUserPreset = useCallback(
    (id: string) => {
      deleteUserNsfwGeneratorPreset(id);
      setUserPresets(loadUserNsfwGeneratorPresets());
      setPresetPrefs(loadNsfwPresetPrefs());
      if (toolSettings.nsfwPresetId === id) {
        updateToolSettings({ nsfwPresetId: undefined });
      }
    },
    [toolSettings.nsfwPresetId, updateToolSettings]
  );

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/nsfw-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: shared.model,
          detail: shared.detail,
          hints: toolSettings.hints,
          wildness: toolSettings.wildness,
          presetId: toolSettings.nsfwPresetId,
          ...avoidedTokensRequestBody(),
          ...sharedLlmRequestBody(shared),
        }),
      });

      const data = (await response.json()) as EnrichedToolGenerateResult & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Generation failed.');
      }

      const prompt = await actions.finalizePrompt(data.prompt, toolSettings.hints);
      setOutput(prompt);
      setResult({ ...data, prompt });
      void dispatchWebhook({
        event: 'prompt.generated',
        tool: TOOL_ID,
        model: shared.model,
        prompt: prompt.slice(0, 500),
        completedAt: Date.now(),
      });
      void import('@/lib/plugin-queue-hooks').then(({ dispatchPluginLifecycleHooks }) => {
        void dispatchPluginLifecycleHooks({
          event: 'prompt-generated',
          tool: TOOL_ID,
          model: shared.model,
          prompt: prompt.slice(0, 500),
          completedAt: Date.now(),
        });
      });
    } catch (err) {
      setOutput('');
      setResult(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [shared, toolSettings, actions]);

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

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    result,
    loading,
    error,
    copied,
    userPresets,
    presetPrefs,
    selectedModel,
    actions,
    handlePresetSelect,
    saveCurrentAsPreset,
    pickRandomPreset,
    handoffToVariations,
    exportPresets,
    importPresetsFromFile,
    deleteUserPreset,
    setPresetPrefs,
    generate,
    copyOutput,
  };
}
