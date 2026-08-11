'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import SharedToolControls from '@/components/SharedToolControls';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import { FieldError, FieldLabel, TextInput, TextArea } from '@/components/ui/Field';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { DEFAULT_OUTPAINT_DENOISE, isInpaintModel } from '@/lib/model-denoise-defaults';
import {
  buildOutpaintInstruction,
  normalizeOutpaintInsets,
  outpaintInsetsHavePad,
  renderOutpaintPadAndMask,
} from '@/lib/outpaint-canvas';
import { galleryPickPath, sharedPatchFromGalleryHandoff } from '@/lib/gallery-handoff';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { DEFAULT_OUTPAINT_TOOL_CACHE } from '@/lib/settings-cache';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';

const ACCENT = 'amber' as const;
const DEFAULT_OUTPAINT_MODEL: ComfyImageModel = 'flux-inpaint';

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(header ?? '')?.[1] ?? 'image/png';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

export default function OutpaintTool() {
  const description = useToolPageDescription(
    'Pad the canvas and inpaint the new border so the scene continues outward. Uses the same quality recipes, LoRA stack, and Final promote path as Inpaint.',
    'Extend the canvas outward — pad edges and inpaint the new border.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'outpaint',
    DEFAULT_OUTPAINT_TOOL_CACHE
  );
  const modelInitializedRef = useRef(false);

  const intent =
    toolSettings.intent?.trim() ||
    DEFAULT_OUTPAINT_TOOL_CACHE.intent ||
    'continue the scene naturally with matching lighting';
  const pad = {
    top: toolSettings.padTop ?? DEFAULT_OUTPAINT_TOOL_CACHE.padTop,
    right: toolSettings.padRight ?? DEFAULT_OUTPAINT_TOOL_CACHE.padRight,
    bottom: toolSettings.padBottom ?? DEFAULT_OUTPAINT_TOOL_CACHE.padBottom,
    left: toolSettings.padLeft ?? DEFAULT_OUTPAINT_TOOL_CACHE.padLeft,
  };

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [lastQueueOptions, setLastQueueOptions] = useState<{
    inputImage: File;
    maskImage: File;
    queueParamsBase: { width: string; height: string; denoise: string };
  } | null>(null);

  const actions = usePromptResultActions({
    tool: 'outpaint',
    model: shared.model,
    detail: shared.detail,
    hints: intent,
    autoFixRules: shared.autoFixRules !== false,
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const liveInstruction = useMemo(
    () => buildOutpaintInstruction(normalizeOutpaintInsets(pad), intent),
    [intent, pad]
  );
  const resultOutput = output.trim() || liveInstruction;

  useEffect(() => {
    if (!mounted || modelInitializedRef.current) {
      return;
    }
    modelInitializedRef.current = true;
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_OUTPAINT_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const setIntent = useCallback(
    (value: string) => {
      updateToolSettings({ intent: value });
      rememberDraftFields({
        toolKey: 'outpaint',
        label: 'Outpaint',
        href: '/outpaint',
        fields: [value],
      });
    },
    [updateToolSettings]
  );

  const setPadSide = useCallback(
    (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
      const key =
        side === 'top'
          ? 'padTop'
          : side === 'right'
            ? 'padRight'
            : side === 'bottom'
              ? 'padBottom'
              : 'padLeft';
      updateToolSettings({ [key]: Math.max(0, Math.min(1024, Math.round(value) || 0)) });
    },
    [updateToolSettings]
  );

  const revokeSourceUrl = useCallback((url: string | null) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

  const onFile = useCallback(
    (file: File | null) => {
      setSourceUrl(current => {
        revokeSourceUrl(current);
        return file ? URL.createObjectURL(file) : null;
      });
      setError(null);
      setStatus(file ? `Loaded ${file.name}` : null);
    },
    [revokeSourceUrl]
  );

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      file: File | null;
      previewUrl: string | null;
      payload: import('@/lib/gallery-handoff').GalleryHandoffPayload;
    }) => {
      if (handoff.prompt.trim()) {
        setIntent(handoff.prompt.trim());
      }
      if (handoff.file || handoff.previewUrl) {
        setSourceUrl(current => {
          revokeSourceUrl(current);
          return handoff.previewUrl;
        });
      }
      const patch = sharedPatchFromGalleryHandoff(handoff.payload);
      const modelPatch =
        handoff.model && isInpaintModel(handoff.model)
          ? { model: handoff.model as ComfyImageModel }
          : {};
      if (Object.keys(patch).length > 0 || Object.keys(modelPatch).length > 0) {
        updateShared({ ...patch, ...modelPatch });
      }
      setStatus('Loaded gallery handoff.');
    },
    [revokeSourceUrl, setIntent, updateShared]
  );

  useGalleryHandoff('outpaint', applyGalleryHandoff);

  const runOutpaint = useCallback(async () => {
    if (!sourceUrl) {
      setError('Choose a source image first.');
      return;
    }
    const insets = normalizeOutpaintInsets(pad);
    if (!outpaintInsetsHavePad(insets)) {
      setError('Set at least one pad side above zero.');
      return;
    }
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_OUTPAINT_MODEL });
    }
    setBusy(true);
    setError(null);
    setStatus('Preparing padded canvas + mask…');
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode source image.'));
        img.src = sourceUrl;
      });
      const rendered = await renderOutpaintPadAndMask(image, insets);
      const imageFile = dataUrlToFile(rendered.imageDataUrl, 'outpaint-source.png');
      const maskFile = dataUrlToFile(rendered.maskDataUrl, 'outpaint-mask.png');
      const instruction = buildOutpaintInstruction(insets, intent);
      const denoise =
        typeof shared.editDenoiseStrength === 'number' &&
        Number.isFinite(shared.editDenoiseStrength)
          ? shared.editDenoiseStrength
          : DEFAULT_OUTPAINT_DENOISE;
      const queueOptions = {
        inputImage: imageFile,
        maskImage: maskFile,
        queueParamsBase: {
          width: String(rendered.width),
          height: String(rendered.height),
          denoise: String(denoise),
        },
      };
      setLastQueueOptions(queueOptions);
      setOutput(instruction);
      setStatus('Queueing outpaint…');
      await actions.sendComfyUi(instruction, undefined, undefined, queueOptions);
      setStatus(actions.comfyUiStatus ?? 'Outpaint queued.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Outpaint failed.');
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [actions, intent, pad, shared.editDenoiseStrength, shared.model, sourceUrl, updateShared]);

  const copyOutput = useCallback(async () => {
    if (!resultOutput.trim()) {
      return;
    }
    await navigator.clipboard.writeText(resultOutput);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [resultOutput]);

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Outpaint · {selectedModel.comfyNode}</ToolBadge>}
      title="Outpaint / expand"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="outpaint"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={intent}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.outpaint} />
      <EditToolRecipeStrip
        toolId="outpaint"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <HistoryHintSeedPanel
        tool="outpaint"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={intent}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setIntent}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            intent: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <ToolSection title="Source">
        <FieldLabel>Image</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={event => onFile(event.target.files?.[0] ?? null)}
            className={`block min-w-0 flex-1 text-sm text-[var(--text-muted)] file:mr-4 file:rounded-lg file:border-0 file:bg-amber-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 ${accentFocusClass(ACCENT)}`}
          />
          <ButtonLink href={galleryPickPath('outpaint')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
        </div>
        {sourceUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sourceUrl}
            alt="Outpaint source"
            className="mt-3 max-h-64 rounded-xl border border-[var(--border-subtle)]/80 object-contain shadow-[0_12px_40px_-24px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-100/85">
            Upload a source image, or send one here from the Gallery Outpaint action.
          </p>
        )}
      </ToolSection>

      <ToolSection title="Expand">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['top', 'right', 'bottom', 'left'] as const).map(side => (
            <label key={side} className="space-y-1.5 text-xs text-[var(--text-muted)]">
              <span className="capitalize">{side} (px)</span>
              <TextInput
                type="number"
                min={0}
                max={1024}
                value={String(pad[side])}
                onChange={event => setPadSide(side, Number(event.target.value) || 0)}
                className={accentFocusClass(ACCENT)}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 space-y-1.5">
          <FieldLabel hint="Describes what should appear in the new border.">
            Intent for the new border
          </FieldLabel>
          <TextArea
            rows={3}
            value={intent}
            onChange={event => setIntent(event.target.value)}
            placeholder="continue the scene naturally with matching lighting"
            className={accentFocusClass(ACCENT)}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            type="button"
            data-action="primary-generate"
            disabled={busy || !sourceUrl}
            onClick={() => void runOutpaint()}
          >
            {busy ? 'Working…' : 'Queue outpaint'}
          </PrimaryButton>
          <Button
            type="button"
            variant="secondary"
            disabled={!sourceUrl && !intent}
            onClick={() => {
              onFile(null);
              setStatus(null);
              setError(null);
            }}
          >
            Clear source
          </Button>
          {status ? <p className="text-xs text-[var(--text-muted)]">{status}</p> : null}
        </div>
        <FieldError>{error}</FieldError>
      </ToolSection>

      <EnhancedPromptResult
        output={resultOutput}
        onOutputChange={setOutput}
        provider={resultOutput ? 'template' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        readinessHints={intent}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: resultOutput,
            hints: intent,
          })
        }
        onSendComfyUi={() => void runOutpaint()}
        {...promptResultPreviewProps(actions, resultOutput)}
        {...continueEditResultProps(actions, resultOutput, {
          queueImageOptions: lastQueueOptions ?? undefined,
          includeSeedBatch: Boolean(lastQueueOptions),
        })}
        onFixPrompt={() => void actions.fixPrompt(resultOutput, setOutput, intent)}
        onCopyPair={() => void actions.copyPromptPair(resultOutput)}
        onCompact={() => void actions.compactPrompt(resultOutput, setOutput)}
        onReformat={() => void actions.reformatForModel(resultOutput, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onExportSidecar={() =>
          void actions.exportSidecar(resultOutput, { comfyNode: selectedModel.comfyNode })
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
        disabled={busy || !sourceUrl}
        label="Queue outpaint"
        status={status ?? actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => void runOutpaint()}
      >
        <div className="mb-2">
          <EditToolRecipeStrip
            toolId="outpaint"
            shared={shared}
            onApplied={next => updateShared(next)}
            compact
          />
        </div>
      </MobileStickyQueueBar>
    </ToolLayout>
  );
}
