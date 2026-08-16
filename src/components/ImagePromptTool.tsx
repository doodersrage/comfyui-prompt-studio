'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { readRawPrompt } from '@/lib/raw-prompt';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { isBooguEditModel, isZImageModel } from '@/lib/model-denoise-defaults';
import { isKleinDistilledModel } from '@/lib/model-sampler-defaults';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { DEFAULT_IMAGE_PROMPT_TOOL_CACHE } from '@/lib/settings-cache';
import { appendSharedLlmFormData, sharedLlmRequestBody } from '@/lib/llm-request-options';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import type {
  EnrichedToolGenerateResult,
  ImagePromptFocus,
  ToolGenerateResult,
} from '@/lib/specialized/types';
import {
  IMAGE_PROMPT_DESCRIPTION_PRESETS,
  getImagePromptPreset,
  type ImagePromptDescriptionPreset,
} from '@/lib/image-prompt-presets';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { FieldDivider, FieldError, FieldLabel, TextArea, ChipButton } from '@/components/ui/Field';
import {
  DESCRIPTION_FOCUS_LABEL,
  DESCRIPTION_PRESET_LABEL,
  EXTRA_HINTS_LABEL,
} from '@/lib/tool-ui-labels';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import { galleryPickPath } from '@/lib/gallery-handoff';

const ACCENT = 'fuchsia' as const;

type RefImageUpload = {
  id: string;
  file: File;
  previewUrl: string;
  role: string;
  strength: number;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export default function ImagePromptTool() {
  const description = useToolPageDescription(
    'Upload a reference image and convert it into a model-ready prompt.',
    'Upload a reference image to build a prompt.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'imagePrompt',
    DEFAULT_IMAGE_PROMPT_TOOL_CACHE
  );
  const [refImages, setRefImages] = useState<RefImageUpload[]>([]);
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<
    (ToolGenerateResult & { diagnostics?: EnrichedToolGenerateResult['diagnostics'] }) | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refineIntent, setRefineIntent] = useState('');
  const [handoffQueueParams, setHandoffQueueParams] = useState<WorkflowParamValues | undefined>();

  useSeedToolDraft(mounted, {
    toolKey: 'image-prompt',
    label: 'Image → Prompt',
    href: '/image-prompt',
    fields: [toolSettings.extraHints, output],
  });

  const actions = usePromptResultActions({
    tool: 'imagePrompt',
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.extraHints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const inferredSport = result?.diagnostics?.inferred.sport ?? null;

  const selectedPreset = getImagePromptPreset(toolSettings.descriptionPreset ?? 'standard');

  const addRefImage = useCallback((nextFile: File, role = '', replace = false) => {
    setRefImages(previous => {
      if (!replace && previous.length >= 4) {
        return previous;
      }
      const entry: RefImageUpload = {
        id: `${Date.now()}-${nextFile.name}`,
        file: nextFile,
        previewUrl: URL.createObjectURL(nextFile),
        role: role || (replace ? 'primary' : `reference ${previous.length + 1}`),
        strength: replace || previous.length === 0 ? 1 : 0.75,
      };
      if (replace) {
        for (const image of previous) {
          URL.revokeObjectURL(image.previewUrl);
        }
        return [entry];
      }
      return [...previous, entry];
    });
  }, []);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
    }) => {
      updateToolSettings({
        extraHints: `Reference prompt from gallery:\n${handoff.prompt.slice(0, 1200)}`,
      });
      rememberDraftFields({
        toolKey: 'image-prompt',
        label: 'Image → Prompt',
        href: '/image-prompt',
        fields: [handoff.prompt.slice(0, 240)],
      });
      setHandoffQueueParams(handoff.queueParams);
      if (handoff.model) {
        updateShared({ model: handoff.model as ComfyImageModel });
      }
      if (handoff.file) {
        addRefImage(handoff.file, 'gallery reference');
      }
    },
    [addRefImage, updateShared, updateToolSettings]
  );

  useGalleryHandoff('imagePrompt', applyGalleryHandoff);

  const removeRefImage = useCallback((id: string) => {
    setRefImages(previous => {
      const target = previous.find(entry => entry.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return previous.filter(entry => entry.id !== id);
    });
  }, []);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      if (!nextFile) {
        setRefImages(previous => {
          for (const entry of previous) {
            URL.revokeObjectURL(entry.previewUrl);
          }
          return [];
        });
        return;
      }
      addRefImage(nextFile, 'primary', true);
    },
    [addRefImage]
  );

  const generate = useCallback(async () => {
    if (refImages.length === 0) {
      setError('Upload at least one image.');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      let data: ToolGenerateResult & { error?: string };

      if (refImages.length === 1) {
        const formData = new FormData();
        formData.append('image', refImages[0].file);
        formData.append('model', shared.model);
        formData.append('detail', shared.detail);
        formData.append('focus', toolSettings.focus ?? 'full');
        formData.append('descriptionPreset', toolSettings.descriptionPreset ?? 'standard');
        if (toolSettings.extraHints?.trim()) {
          formData.append('extraHints', toolSettings.extraHints.trim());
        }
        appendSharedLlmFormData(formData, shared);

        const response = await fetch('/api/image-prompt', {
          method: 'POST',
          body: formData,
        });
        data = (await response.json()) as ToolGenerateResult & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? 'Generation failed.');
        }
      } else {
        const images = await Promise.all(
          refImages.map(async entry => ({
            image: await fileToDataUrl(entry.file),
            mimeType: entry.file.type || 'image/jpeg',
            role: entry.role,
            focus: toolSettings.focus ?? 'full',
            strength: entry.strength,
          }))
        );
        const response = await fetch('/api/image-prompt/multi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images,
            model: shared.model,
            detail: shared.detail,
            descriptionPreset: toolSettings.descriptionPreset ?? 'standard',
            extraHints: toolSettings.extraHints?.trim() || undefined,
            ...sharedLlmRequestBody(shared),
          }),
        });
        data = (await response.json()) as ToolGenerateResult & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? 'Generation failed.');
        }
      }

      const prompt = await actions.finalizePrompt(data.prompt, toolSettings.extraHints);
      setOutput(prompt);
      setResult({ ...data, prompt });
      rememberDraftFields({
        toolKey: 'image-prompt',
        label: 'Image → Prompt',
        href: '/image-prompt',
        fields: [prompt, toolSettings.extraHints],
      });
    } catch (err) {
      setOutput('');
      setResult(null);
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [refImages, shared, toolSettings, actions]);

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

  const refine = useCallback(async () => {
    const primary = refImages[0];
    if (!primary || !refineIntent.trim()) {
      setError('Upload an image and describe what you wanted.');
      return;
    }

    setLoading(true);
    setError(null);
    actions.resetStatuses();

    let stage = 'read-image';
    try {
      const image = await fileToDataUrl(primary.file);
      stage = 'request';
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          mimeType: primary.file.type || 'image/png',
          model: shared.model,
          detail: shared.detail,
          currentPrompt: output || undefined,
          intentHints: refineIntent.trim(),
          ...sharedLlmRequestBody(shared),
        }),
      });

      stage = 'parse-response';
      const data = (await response.json()) as EnrichedToolGenerateResult & {
        error?: string;
        stage?: string;
      };

      if (!response.ok) {
        const serverStage = data.stage ? ` [${data.stage}]` : '';
        throw new Error(`${data.error ?? 'Refine failed.'}${serverStage}`);
      }

      stage = 'finalize';
      const prompt = await actions.finalizePrompt(data.prompt, refineIntent);
      setOutput(prompt);
      setResult({
        ...data,
        prompt,
        diagnostics: data.diagnostics ?? actions.diagnostics ?? undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refine failed.';
      setError(
        message.includes('[') || message.startsWith('Refine failed')
          ? message
          : `Refine failed at ${stage}: ${message}`
      );
    } finally {
      setLoading(false);
    }
  }, [refImages, refineIntent, output, shared, actions]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          {TOOL_SETUP_LABELS.imagePrompt} · {selectedModel.comfyNode}
        </ToolBadge>
      }
      title="Image → Prompt"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="imagePrompt"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.imagePrompt} />
      <EditToolRecipeStrip
        toolId="imagePrompt"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <HistoryHintSeedPanel
        tool="imagePrompt"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={toolSettings.extraHints ?? ''}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={value => updateToolSettings({ extraHints: value })}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            extraHints: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <ToolSection>
        {isBooguEditModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Boogu Edit queues as instruction TI2I (TextEncodeBooguEdit, denoise 1). Keep the prompt
            to a short edit — Turbo rewrites too much from a full scene essay. Vision caption above
            is separate from the ComfyUI stack.
          </p>
        ) : isZImageModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Z-Image queues as VAEEncode img2img. Turbo uses a soft denoise so identity holds — pick
            Gentle / Balanced / Strong below. Vision caption above is separate from the ComfyUI
            stack.
          </p>
        ) : isKleinDistilledModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Klein Distilled queues as ReferenceLatent instruction edit (denoise 1, 4-step CFG 1).
            Keep the prompt to a short edit and pick Gentle / Balanced / Strong. Vision caption
            above is separate from the ComfyUI stack.
          </p>
        ) : null}
        <TurboEditStrengthControls
          model={shared.model}
          tool="imagePrompt"
          value={normalizeTurboEditStrength(shared.turboEditStrength)}
          onChange={turboEditStrength => updateShared({ turboEditStrength })}
        />
        <FieldLabel>Upload images (up to 4)</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={e => onFileChange(e.target.files?.[0] ?? null)}
            className="ui-file-input block min-w-0 flex-1"
          />
          <ButtonLink href={galleryPickPath('imagePrompt')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
        </div>
        {refImages.length > 0 && refImages.length < 4 ? (
          <label className="mt-2 block text-sm text-[var(--text-muted)]">
            Add another reference
            <input
              type="file"
              accept="image/*"
              className="ui-file-input mt-1 w-full"
              onChange={event => {
                const next = event.target.files?.[0];
                if (next) {
                  addRefImage(next);
                }
                event.target.value = '';
              }}
            />
          </label>
        ) : null}
        {refImages.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {refImages.map(entry => (
              <li key={entry.id} className="ui-surface-inset space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    value={entry.role}
                    onChange={event =>
                      setRefImages(previous =>
                        previous.map(item =>
                          item.id === entry.id ? { ...item, role: event.target.value } : item
                        )
                      )
                    }
                    className="ui-input min-w-0 flex-1 px-(--input-padding-x) py-1 type-caption"
                    placeholder="Reference role"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => removeRefImage(entry.id)}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1">
                  <span className="type-caption text-[var(--text-muted)]">Strength</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(entry.strength * 100)}
                    onChange={event =>
                      setRefImages(previous =>
                        previous.map(item =>
                          item.id === entry.id
                            ? { ...item, strength: Number(event.target.value) / 100 }
                            : item
                        )
                      )
                    }
                    aria-label={`Strength for ${entry.role}`}
                    className="h-8 w-full min-w-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="text-right text-xs tabular-nums text-[var(--text-secondary)]">
                    {Math.round(entry.strength * 100)}%
                  </span>
                </div>

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.previewUrl}
                  alt={entry.role}
                  className="max-h-48 rounded-lg border border-[var(--border-subtle)] object-contain"
                />
              </li>
            ))}
          </ul>
        ) : null}

        <FieldDivider />

        <FieldLabel hint="Choose how much emphasis the vision model puts on different visible details.">
          {DESCRIPTION_PRESET_LABEL}
        </FieldLabel>
        <div className="flex flex-wrap gap-2">
          {IMAGE_PROMPT_DESCRIPTION_PRESETS.map(preset => (
            <ChipButton
              key={preset.id}
              active={(toolSettings.descriptionPreset ?? 'standard') === preset.id}
              onClick={() =>
                updateToolSettings({
                  descriptionPreset: preset.id as ImagePromptDescriptionPreset,
                })
              }
            >
              {preset.label}
            </ChipButton>
          ))}
        </div>
        <p className="type-caption">{selectedPreset.summary}</p>
        {selectedPreset.suggestedDetail && selectedPreset.suggestedDetail !== shared.detail ? (
          <p className="type-caption text-[var(--accent-text)]">
            Works best with{' '}
            <strong className="font-medium capitalize">{selectedPreset.suggestedDetail}</strong>{' '}
            detail in the sidebar.
          </p>
        ) : null}

        <FieldDivider />

        <FieldLabel>{DESCRIPTION_FOCUS_LABEL}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { label: 'Full image', value: 'full' },
              { label: 'Subject', value: 'subject' },
              { label: 'Background', value: 'background' },
              { label: 'Style', value: 'style' },
            ] as const
          ).map(option => (
            <ChipButton
              key={option.value}
              active={(toolSettings.focus ?? 'full') === option.value}
              onClick={() => updateToolSettings({ focus: option.value as ImagePromptFocus })}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>

        <FieldDivider />

        <FieldLabel>{EXTRA_HINTS_LABEL}</FieldLabel>
        <TextArea
          value={toolSettings.extraHints ?? ''}
          onChange={e => {
            const value = e.target.value;
            updateToolSettings({ extraHints: value });
            rememberDraftFields({
              toolKey: 'image-prompt',
              label: 'Image → Prompt',
              href: '/image-prompt',
              fields: [value],
            });
          }}
          placeholder="e.g. two cyclists side by side, gravel bikes, helmets on"
          rows={2}
          className={accentFocusClass(ACCENT)}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          data-action="primary-generate"
          onClick={() => void generate()}
          disabled={!mounted || refImages.length === 0}
          loading={loading}
          loadingLabel="Analyzing image"
        >
          Generate prompt from image
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      {output && (
        <ToolSection title="Refine against intent">
          <TextArea
            rows={2}
            value={refineIntent}
            onChange={event => setRefineIntent(event.target.value)}
            placeholder="What you wanted: two gravel cyclists with helmets, not street clothes…"
            className={accentFocusClass(ACCENT)}
          />
          <Button
            variant="accent-outline"
            loading={loading}
            loadingLabel="Refining prompt from image"
            disabled={refImages.length === 0}
            onClick={() => void refine()}
          >
            Refine prompt from image
          </Button>
        </ToolSection>
      )}

      <EnhancedPromptResult
        output={output}
        provider={result?.provider ?? null}
        comfyNode={result?.comfyNode}
        limits={result?.limits}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        readinessHints={toolSettings.extraHints}
        copied={copied}
        onCopy={() => void copyOutput()}
        extraMeta={
          typeof result?.metadata?.qualityWarning === 'string'
            ? `shorter than ideal: ${result.metadata.qualityWarning}`
            : undefined
        }
        diagnostics={actions.diagnostics ?? result?.diagnostics ?? null}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: toolSettings.extraHints,
            metadata: result?.metadata,
          })
        }
        onOutputChange={setOutput}
        rawPrompt={readRawPrompt(result?.metadata)}
        onSendComfyUi={() =>
          void actions.sendComfyUi(output, inferredSport, undefined, {
            inputImage: refImages[0]?.file ?? null,
            queueParamsBase: handoffQueueParams,
          })
        }
        onEditPrompt={() =>
          actions.editPromptOutput(
            output,
            actions.comfyUiPreviewUrl,
            undefined,
            toolSettings.extraHints
          )
        }
        showWeightInspector={Boolean(output)}
        {...promptResultPreviewProps(actions, output, inferredSport)}
        {...continueEditResultProps(actions, output, {
          queueImageOptions: {
            inputImage: refImages[0]?.file ?? null,
            queueParamsBase: handoffQueueParams,
          },
        })}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, toolSettings.extraHints)}
        onCopyPair={() => void actions.copyPromptPair(output, inferredSport)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(output, setOutput, {
            maxChars: result?.limits?.maxChars,
            queueComfyUi: true,
            inputImage: refImages[0]?.file ?? null,
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
      {output.trim() ? (
        <div
          data-testid="image-prompt-scene-handoffs"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 px-3 py-2"
        >
          <span className="type-caption text-[var(--text-muted)]">Use as hints</span>
          <Link
            href={`/?hints=${encodeURIComponent(output.slice(0, 500))}&hintSource=manual`}
            className="ui-chip px-2.5 py-1 text-[11px]"
            data-active="true"
          >
            Scene / Generate
          </Link>
          <Link
            href={`/character?hints=${encodeURIComponent(output.slice(0, 500))}&hintSource=manual&mode=solo`}
            className="ui-chip px-2.5 py-1 text-[11px] border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)]"
          >
            Character
          </Link>
          <Link
            href={`/character?mode=duo&hints=${encodeURIComponent(output.slice(0, 500))}&hintSource=manual`}
            className="ui-chip px-2.5 py-1 text-[11px] border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]"
          >
            Duo
          </Link>
        </div>
      ) : null}
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue image prompt"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() =>
          void actions.sendComfyUi(output, inferredSport, undefined, {
            inputImage: refImages[0]?.file ?? null,
            queueParamsBase: handoffQueueParams,
          })
        }
      />
    </ToolLayout>
  );
}
