'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { useCallback, useMemo, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import InpaintMaskEditor from '@/components/InpaintMaskEditor';
import RegionalEditPanel, { regionalSlotsQueueExtras } from '@/components/RegionalEditPanel';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { resolveCollabFieldValue } from '@/lib/collab-presence';
import CollabPresenceBar from '@/components/CollabPresenceBar';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { isInpaintModel, isBooguEditModel, isZImageModel } from '@/lib/model-denoise-defaults';
import { isKleinDistilledModel } from '@/lib/model-sampler-defaults';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { diffPromptWords } from '@/lib/prompt-diff';
import { resolveParentHistoryId } from '@/lib/prompt-lineage-session';
import { DEFAULT_REFINE_TOOL_CACHE } from '@/lib/settings-cache';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { createDefaultRegionalSlots } from '@/lib/regional-prompt-slots';
import {
  galleryPickPath,
  sharedPatchFromGalleryHandoff,
  type GalleryHandoffPayload,
} from '@/lib/gallery-handoff';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import {
  parseVisionScanApiResponse,
  prepareVisionScanImagePayload,
  resolveStillFileForVisionScan,
} from '@/lib/vision-scan-still';

const ACCENT = 'fuchsia' as const;

export default function RefineTool() {
  const description = useToolPageDescription(
    'Upload a reference image and refine a prompt against your intent.',
    'Upload a reference image and refine the prompt to match your intent.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'refine',
    DEFAULT_REFINE_TOOL_CACHE
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const currentPrompt = toolSettings.currentPrompt ?? '';
  const intentHints = toolSettings.intentHints ?? '';
  const setCurrentPrompt = useCallback(
    (value: string) => {
      updateToolSettings({ currentPrompt: value });
      rememberDraftFields({
        toolKey: 'refine',
        label: 'Refine',
        href: '/refine',
        fields: [intentHints, value],
      });
    },
    [intentHints, updateToolSettings]
  );
  const setIntentHints = useCallback(
    (value: string) => {
      updateToolSettings({ intentHints: value });
      rememberDraftFields({
        toolKey: 'refine',
        label: 'Refine',
        href: '/refine',
        fields: [value, currentPrompt],
      });
    },
    [currentPrompt, updateToolSettings]
  );
  useSeedToolDraft(mounted, {
    toolKey: 'refine',
    label: 'Refine',
    href: '/refine',
    fields: [intentHints, currentPrompt],
  });
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sourceHistoryId, setSourceHistoryId] = useState<string | undefined>();
  const [beforePrompt, setBeforePrompt] = useState('');
  const [handoffQueueParams, setHandoffQueueParams] = useState<WorkflowParamValues | undefined>();

  const actions = usePromptResultActions({
    tool: 'refine',
    model: shared.model,
    detail: shared.detail,
    hints: intentHints,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const needsInpaintMask = isInpaintModel(shared.model);

  const regionalSlots = toolSettings.regionalSlots ?? createDefaultRegionalSlots();
  const regionalQueue = useMemo(() => regionalSlotsQueueExtras(regionalSlots), [regionalSlots]);

  const queueImageOptions = {
    inputImage: file,
    inputImageUrl: !file ? (previewUrl ?? undefined) : undefined,
    maskImage: needsInpaintMask ? maskFile : undefined,
    maskImageUrl: needsInpaintMask && !maskFile ? (maskPreviewUrl ?? undefined) : undefined,
    queueParamsBase: handoffQueueParams,
    customTokens: regionalQueue.customTokens,
    regionalSlots: regionalQueue.regionalSlots,
  };

  const assertInpaintMaskReady = useCallback(() => {
    if (!needsInpaintMask) {
      return true;
    }
    if (maskFile || maskPreviewUrl) {
      return true;
    }
    setError('Upload an inpaint mask (white = edit region) before queueing.');
    return false;
  }, [maskFile, maskPreviewUrl, needsInpaintMask]);

  const onMaskChange = useCallback((nextFile: File | null, nextPreviewUrl: string | null) => {
    setMaskFile(nextFile);
    setMaskPreviewUrl(current => {
      if (current && current !== nextPreviewUrl) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });
  }, []);

  const clearMaskState = useCallback(() => {
    setMaskFile(null);
    setMaskPreviewUrl(current => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      improveIntent?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
      payload: GalleryHandoffPayload;
    }) => {
      setCurrentPrompt(handoff.prompt);
      setBeforePrompt(handoff.prompt);
      setSourceHistoryId(handoff.payload.historyId ?? resolveParentHistoryId());
      setHandoffQueueParams(handoff.queueParams);
      if (handoff.improveIntent) {
        setIntentHints(handoff.improveIntent);
      }
      const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
      if (handoff.model) {
        updateShared({
          model: handoff.model as ComfyImageModel,
          ...sharedPatch,
        });
      } else if (Object.keys(sharedPatch).length > 0) {
        updateShared(sharedPatch);
      }
      if (handoff.file) {
        setFile(handoff.file);
        setPreviewUrl(handoff.previewUrl);
      } else if (handoff.previewUrl) {
        setPreviewUrl(handoff.previewUrl);
      }
      clearMaskState();
    },
    [clearMaskState, updateShared]
  );

  useGalleryHandoff('refine', applyGalleryHandoff);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
      clearMaskState();
    },
    [clearMaskState, previewUrl]
  );

  const scanWithVision = useCallback(async () => {
    if (!file && !previewUrl) {
      setError('Upload a reference image first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const still = await resolveStillFileForVisionScan({
        file,
        urls: [previewUrl],
        fallbackName: 'refine-source.jpg',
      });
      const { image, mimeType } = await prepareVisionScanImagePayload(still);
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'scan',
          image,
          mimeType,
          model: shared.model,
          detail: shared.detail,
          intentHints: intentHints.trim() || undefined,
          ...sharedLlmRequestBody(shared),
        }),
      });
      const data = await parseVisionScanApiResponse<{
        currentPrompt?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data.currentPrompt?.trim()) {
        throw new Error(data.error ?? 'Vision scan failed.');
      }
      setCurrentPrompt(data.currentPrompt.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }, [file, intentHints, previewUrl, setCurrentPrompt, shared]);

  const refine = useCallback(async () => {
    if (!file && !previewUrl) {
      setError('Upload a reference image first.');
      return;
    }
    if (!intentHints.trim() && !currentPrompt.trim()) {
      setError('Enter intent hints or a current prompt to refine against.');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    let stage = 'load-image';
    try {
      const still = await resolveStillFileForVisionScan({
        file,
        urls: [previewUrl],
        fallbackName: 'refine-source.jpg',
      });
      stage = 'read-image';
      const { image, mimeType } = await prepareVisionScanImagePayload(still);
      stage = 'request';
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          mimeType,
          model: shared.model,
          detail: shared.detail,
          currentPrompt: currentPrompt.trim() || undefined,
          intentHints: intentHints.trim() || undefined,
          ...sharedLlmRequestBody(shared),
        }),
      });

      stage = 'parse-response';
      const data = (await response.json()) as {
        prompt?: string;
        error?: string;
        stage?: string;
      };

      if (!response.ok) {
        const serverStage = data.stage ? ` [${data.stage}]` : '';
        throw new Error(`${data.error ?? 'Refine failed.'}${serverStage}`);
      }

      stage = 'finalize';
      const prompt = await actions.finalizePrompt(
        data.prompt ?? '',
        intentHints.trim() || currentPrompt.trim()
      );
      setBeforePrompt(currentPrompt.trim() || beforePrompt);
      setOutput(prompt);
    } catch (err) {
      setOutput('');
      const message = err instanceof Error ? err.message : 'Refine failed.';
      setError(
        message.includes('[') || message.startsWith('Refine failed')
          ? message
          : `Refine failed at ${stage}: ${message}`
      );
    } finally {
      setLoading(false);
    }
  }, [actions, beforePrompt, currentPrompt, file, intentHints, previewUrl, shared]);

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

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Refine · {selectedModel.comfyNode}</ToolBadge>}
      title="Refine"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="refine"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || currentPrompt || intentHints}
          onSharedSettingsChange={updateShared}
          preferEditModels
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.refine} />
      <EditToolRecipeStrip toolId="refine" shared={shared} onApplied={next => updateShared(next)} />
      <HistoryHintSeedPanel
        tool="refine"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={intentHints}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setIntentHints}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            intentHints: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <CollabPresenceBar
        tool="refine"
        draft={[intentHints, currentPrompt].filter(Boolean).join('\n\n')}
        draftFields={{ hints: intentHints, positive: currentPrompt }}
        onApplyRemoteDraft={payload => {
          const hints = resolveCollabFieldValue(payload, 'hints');
          const positive = resolveCollabFieldValue(payload, 'positive');
          if (hints || positive) {
            updateToolSettings({
              ...(hints ? { intentHints: hints } : {}),
              ...(positive ? { currentPrompt: positive } : {}),
            });
            return;
          }
          const parts = payload.draft.split(/\n\n+/);
          updateToolSettings({
            intentHints: parts[0] ?? payload.draft,
            currentPrompt: parts.slice(1).join('\n\n') || toolSettings.currentPrompt,
          });
        }}
      />
      <ToolSection>
        {isBooguEditModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Boogu Edit: TextEncodeBooguEdit vision-encodes your reference at denoise 1 — write a
            short instruction (e.g. &quot;Replace the background with a rainy neon alley. Keep the
            subject&apos;s pose.&quot;). Full scene essays rewrite too much on Turbo.
          </p>
        ) : isZImageModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Z-Image: VAEEncode img2img on your reference. Turbo defaults to a soft denoise so
            identity holds — use Gentle / Balanced / Strong instead of the Settings 0.65 slider.
          </p>
        ) : isKleinDistilledModel(shared.model) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Klein Distilled: ReferenceLatent instruction edit at denoise 1 (4-step CFG 1). Write a
            short command and use Gentle / Balanced / Strong — full scene essays rewrite the frame.
          </p>
        ) : null}
        <TurboEditStrengthControls
          model={shared.model}
          tool="refine"
          value={normalizeTurboEditStrength(shared.turboEditStrength)}
          onChange={turboEditStrength => updateShared({ turboEditStrength })}
        />
        <FieldLabel>Reference image</FieldLabel>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={event => onFileChange(event.target.files?.[0] ?? null)}
              className="ui-file-input block min-w-0 flex-1"
            />
            <ButtonLink href={galleryPickPath('refine')} variant="secondary" size="sm">
              Choose from Gallery
            </ButtonLink>
            <Button
              variant="secondary"
              size="sm"
              disabled={(!file && !previewUrl) || scanning || loading}
              loading={scanning}
              loadingLabel="Scanning still"
              onClick={() => void scanWithVision()}
            >
              Scan with vision
            </Button>
          </div>
          <p className="type-caption text-[var(--text-muted)]">
            Scan with vision fills Current prompt from the still. Add intent hints, then Refine.
          </p>
        </div>
        {previewUrl && !needsInpaintMask ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Reference preview"
            className="max-h-64 rounded-xl border border-[var(--border-subtle)] object-contain"
          />
        ) : null}

        {needsInpaintMask && previewUrl ? (
          <InpaintMaskEditor
            key={previewUrl}
            sourceImageUrl={previewUrl}
            onMaskChange={onMaskChange}
          />
        ) : needsInpaintMask ? (
          <p className="rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5 text-xs text-[var(--tint-warning-text)]">
            Upload a reference image first, then draw or upload an inpaint mask.
          </p>
        ) : null}

        <RegionalEditPanel
          slots={regionalSlots}
          onSlotsChange={next => updateToolSettings({ regionalSlots: next })}
          sourceImageUrl={previewUrl}
          accentClassName={accentFocusClass(ACCENT)}
          persistKey="refine-regional-edit"
        />

        <FieldLabel>Current prompt (optional)</FieldLabel>
        <TextArea
          rows={4}
          value={currentPrompt}
          onChange={event => setCurrentPrompt(event.target.value)}
          placeholder="Paste the prompt you want corrected…"
          className={`font-mono ${accentFocusClass(ACCENT)}`}
        />

        <FieldLabel>Intent hints</FieldLabel>
        <TextArea
          rows={3}
          value={intentHints}
          onChange={event => setIntentHints(event.target.value)}
          placeholder="What you wanted: gravel cyclists with helmets, muddy doubletrack, no street clothes…"
          className={accentFocusClass(ACCENT)}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          data-action="primary-generate"
          onClick={() => void refine()}
          disabled={(!file && !previewUrl) || scanning}
          loading={loading}
          loadingLabel="Refining prompt"
        >
          Refine prompt
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      {output && beforePrompt && beforePrompt !== output ? (
        <ToolSection title="Refine diff">
          <div className="grid gap-4 lg:grid-cols-2">
            <pre className="ui-code-block max-h-48 overflow-auto p-3 text-xs" data-tone="muted">
              {beforePrompt}
            </pre>
            <pre className="ui-code-block max-h-48 overflow-auto p-3 text-xs">{output}</pre>
          </div>
          {diffPromptWords(beforePrompt, output)
            .segments.filter(segment => segment.type === 'add')
            .slice(0, 12)
            .map(segment => segment.text)
            .join(', ') ? (
            <p className="text-xs text-[var(--text-muted)]">
              Added/changed:{' '}
              {diffPromptWords(beforePrompt, output)
                .segments.filter(segment => segment.type === 'add')
                .slice(0, 12)
                .map(segment => segment.text)
                .join(', ')}
            </p>
          ) : null}
        </ToolSection>
      ) : null}

      <EnhancedPromptResult
        output={output}
        onOutputChange={setOutput}
        provider={output ? 'llm' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: intentHints || currentPrompt,
            parentHistoryId: sourceHistoryId,
          })
        }
        onSendComfyUi={() => {
          if (!assertInpaintMaskReady()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
        {...promptResultPreviewProps(actions, output)}
        {...continueEditResultProps(actions, output, { queueImageOptions })}
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, intentHints)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertInpaintMaskReady()) {
            return;
          }
          void actions.runExportPipeline(output, setOutput, {
            queueComfyUi: true,
            ...queueImageOptions,
          });
        }}
        onExportSidecar={() =>
          void actions.exportSidecar(output, { comfyNode: selectedModel.comfyNode })
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
        label="Queue refine"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => {
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
      >
        <div className="mb-2">
          <EditToolRecipeStrip
            toolId="refine"
            shared={shared}
            onApplied={next => updateShared(next)}
            compact
          />
        </div>
      </MobileStickyQueueBar>
    </ToolLayout>
  );
}
