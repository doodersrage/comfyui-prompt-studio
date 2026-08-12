'use client';

import { useCallback, useEffect, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import NsfwGeneratorPresetChips from '@/components/NsfwGeneratorPresetChips';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { SceneGenerateFooter, SceneHintsField } from '@/components/scene-tool/SceneToolSections';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import type { NsfwGeneratorPreset } from '@/lib/nsfw-generator-presets';
import {
  resolveNsfwGeneratorPreset,
  pickRandomNsfwGeneratorPreset,
} from '@/lib/nsfw-generator-presets';
import { DEFAULT_NSFW_GENERATOR_TOOL_CACHE } from '@/lib/settings-cache';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { readRawPrompt } from '@/lib/raw-prompt';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { applyHintSourceFromSearchParams } from '@/lib/tool-url-params';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { conceptWildnessLabel, CONCEPT_WILDNESS_LABEL } from '@/lib/tool-ui-labels';
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
import {
  CollapsibleSection,
  ToolBadge,
  ToolLayout,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { FieldDivider } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

const ACCENT = 'fuchsia' as const;
const TOOL_ID = 'nsfw-generator';

export default function NsfwGeneratorTool() {
  const description = useToolPageDescription(
    'Adult scene prompts with presets. Requires env flag on server and client.',
    'Explicit adult scenes — pick a preset, add hints, generate, and queue.'
  );
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
  }, [shared.model, shared.detail, toolSettings, actions]);

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

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Adult scene · {selectedModel.comfyNode}</ToolBadge>}
      title="Adult generator"
      description={description}
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={false}
          seedLlmWithIngredients={false}
          onSeedLlmWithIngredientsChange={() => undefined}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output}
          toolId={TOOL_ID}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.nsfwGenerator} />
      <CollapsibleSection
        title="Scene presets"
        summary={`${toolSettings.nsfwPresetId ? 'Preset selected' : 'Pick a starter mood or setting'}`}
        defaultOpen
        persistKey="nsfw-generator-presets"
      >
        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={toolSettings.duoOnly === true}
              onChange={event => updateToolSettings({ duoOnly: event.target.checked || undefined })}
              className={`h-4 w-4 rounded ${accentFocusClass(ACCENT)}`}
            />
            Duo presets only
          </label>
          <NsfwGeneratorPresetChips
            selectedId={toolSettings.nsfwPresetId}
            category={toolSettings.presetCategory ?? 'all'}
            onCategoryChange={category => updateToolSettings({ presetCategory: category })}
            userPresets={userPresets}
            favoriteIds={presetPrefs.favoriteIds}
            recentIds={presetPrefs.recentIds}
            duoOnly={toolSettings.duoOnly === true}
            onToggleFavorite={id => setPresetPrefs(toggleNsfwPresetFavorite(id))}
            onDeleteUserPreset={id => {
              deleteUserNsfwGeneratorPreset(id);
              setUserPresets(loadUserNsfwGeneratorPresets());
              setPresetPrefs(loadNsfwPresetPrefs());
              if (toolSettings.nsfwPresetId === id) {
                updateToolSettings({ nsfwPresetId: undefined });
              }
            }}
            onSelect={handlePresetSelect}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={saveCurrentAsPreset}>
              Save current hints as preset
            </Button>
            <Button variant="secondary" size="sm" onClick={pickRandomPreset}>
              Random preset
            </Button>
            <Button variant="secondary" size="sm" onClick={handoffToVariations}>
              Variations grid
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const payload = JSON.stringify(exportUserNsfwPresetPack(), null, 2);
                const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `adult-presets-${Date.now()}.json`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export presets
            </Button>
            <label className="ui-btn-secondary ui-btn-sm cursor-pointer px-4">
              Import presets
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
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
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </CollapsibleSection>

      <FieldDivider />

      <SceneHintsField
        label="Hints"
        hint="Optional extra direction — merged with the selected preset at generate time."
        value={toolSettings.hints ?? ''}
        onChange={value => updateToolSettings({ hints: value, hintSource: 'manual' })}
      />

      <label className="mt-4 block space-y-2">
        <span className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
          <span>{CONCEPT_WILDNESS_LABEL}</span>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {conceptWildnessLabel(toolSettings.wildness ?? 60)}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={toolSettings.wildness ?? 60}
          onChange={event => updateToolSettings({ wildness: Number(event.target.value) })}
          className={`h-8 w-full cursor-pointer accent-[var(--accent)] ${accentFocusClass(ACCENT)}`}
        />
      </label>

      <SceneGenerateFooter
        accent={ACCENT}
        label="Generate adult prompt"
        onClick={() => void generate()}
        loading={loading}
        loadingLabel="Generating adult prompt"
        error={error}
      />

      <EnhancedPromptResult
        output={output}
        onOutputChange={setOutput}
        rawPrompt={readRawPrompt(result?.metadata)}
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
            metadata: {
              ...(result?.metadata ?? {}),
              nsfwPresetId: toolSettings.nsfwPresetId,
            },
          })
        }
        onSendComfyUi={() => void actions.sendComfyUi(output)}
        onEditPrompt={() =>
          actions.editPromptOutput(output, actions.comfyUiPreviewUrl, undefined, toolSettings.hints)
        }
        {...promptResultPreviewProps(actions, output)}
        {...continueEditResultProps(actions, output)}
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
            metadata: result?.metadata,
          })
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
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue adult prompt"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => void actions.sendComfyUi(output)}
      />
    </ToolLayout>
  );
}
