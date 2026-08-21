'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import PromptResultPanel from '@/components/PromptResultPanel';
import PromptDiagnosticsPanel from '@/components/PromptDiagnosticsPanel';
import { useComfyWorkflowSelection } from '@/hooks/useComfyWorkflowSelection';
import {
  CollapsibleSection,
  ToolActionRow,
  ToolBlockGroup,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import { BatchPromptCard, type BatchPromptCrossLinks } from '@/components/ui/BatchPromptCard';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import ComfyUiJobStatusPanel from '@/components/ui/ComfyUiJobStatusPanel';
import GalleryKindPreview from '@/components/ui/GalleryKindPreview';
import StatusToastStrip, { type StatusToastNote } from '@/components/ui/StatusToastStrip';
import type { ComfyUiJobTrackerState } from '@/lib/comfyui-job-status';
import { isComfyUiJobProcessing } from '@/lib/comfyui-job-status';
import type { GenerationDiagnostics } from '@/lib/generation-diagnostics';
import { PINNED_VARIATION_SEED_LABEL } from '@/lib/tool-ui-labels';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { DetailLevel } from '@/lib/detail-level';
import { DEFAULT_READINESS_MIN_SCORE, isReadinessQueueAllowed } from '@/lib/readiness-gate';
import type { PromptReadinessResult } from '@/lib/prompt-readiness';
import { readRawPrompt } from '@/lib/raw-prompt';
import { loadSettingsCache } from '@/lib/settings-cache';
import { usesSystemWorkflowPath } from '@/lib/system-workflow-runtime';
import { markComfyQueueIntent } from '@/lib/comfy-setup-intent';
import { isHtmlVideoViewUrl, isMotionViewUrl, mediaKindFromViewUrl } from '@/lib/comfyui-outputs';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';

const WorkflowPreviewPanel = dynamic(() => import('@/components/WorkflowPreviewPanel'), {
  ssr: false,
  loading: () => null,
});
const ComfyWorkflowSelector = dynamic(() => import('@/components/ComfyWorkflowSelector'), {
  ssr: false,
  loading: () => null,
});
const ResultQuickActions = dynamic(() => import('@/components/ResultQuickActions'), {
  ssr: false,
  loading: () => null,
});
const QueueParamsPanel = dynamic(() => import('@/components/QueueParamsPanel'), {
  ssr: false,
  loading: () => null,
});
const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});
const ReadinessBadge = dynamic(() => import('@/components/ReadinessBadge'), {
  ssr: false,
  loading: () => null,
});
const PromptWeightInspector = dynamic(() => import('@/components/PromptWeightInspector'), {
  ssr: false,
  loading: () => null,
});
export type BatchPromptItem = {
  prompt: string;
  metadata?: Record<string, unknown>;
};

export type BatchPromptItemActions = {
  onQueueComfyUi?: (prompt: string, index: number) => void | Promise<void>;
  onSaveHistory?: (input: {
    prompt: string;
    index: number;
    metadata?: Record<string, unknown>;
  }) => void;
  onCopyPair?: (prompt: string, index: number) => void | Promise<void>;
  onExportSidecar?: (
    prompt: string,
    index: number,
    metadata?: Record<string, unknown>
  ) => void | Promise<void>;
};

type EnhancedPromptResultProps = {
  output: string;
  provider: 'llm' | 'template' | 'rules' | null;
  comfyNode?: string;
  limits?: {
    minChars?: number;
    maxChars: number;
  };
  copied: boolean;
  onCopy: () => void;
  extraMeta?: string;
  diagnostics?: GenerationDiagnostics | null;
  onSaveHistory?: () => void;
  onSendComfyUi?: () => void;
  onFixPrompt?: () => void;
  onCopyPair?: () => void;
  onExportBatch?: () => void;
  onQueueBatchComfyUi?: () => void;
  onCompact?: () => void;
  onReformat?: () => void;
  reformatTargetLabel?: string;
  onRunPipeline?: () => void;
  onExportSidecar?: () => void;
  onPreviewWorkflow?: () => void;
  onImprove?: () => void;
  onRefine?: () => void;
  onEditPrompt?: () => void;
  /** Continue-edit chain from the queued preview image. */
  onContinueInpaint?: () => void;
  onContinueOutpaint?: () => void;
  onContinueCompose?: () => void;
  onContinueVideo?: () => void;
  onContinueControlNet?: () => void;
  /** Queue N fresh-seed variations with the same prompt/images. */
  onQueueSeedBatch?: () => void;
  seedBatchLabel?: string;
  workflowPreview?: {
    workflowSource?: string;
    replacements?: {
      positive: number;
      negative: number;
      custom?: Record<string, number>;
    };
    resolvedParams?: {
      seed: string;
      width: string;
      height: string;
      cfg: string;
      steps: string;
    };
    snippets?: Array<{ path: string; value: string }>;
    workflowJson?: string;
    truncated?: boolean;
  } | null;
  previewStatus?: string | null;
  variationSeed?: string | null;
  onLockSeed?: () => void;
  seedLocked?: boolean;
  fixStatus?: string | null;
  compactStatus?: string | null;
  reformatStatus?: string | null;
  pipelineStatus?: string | null;
  preDiagnostics?: GenerationDiagnostics | null;
  comfyUiStatus?: string | null;
  comfyUiJob?: ComfyUiJobTrackerState | null;
  comfyUiPreviewUrl?: string | null;
  historySaved?: boolean;
  pairCopied?: boolean;
  batchOutputs?: string[];
  batchItems?: BatchPromptItem[];
  batchCrossLinks?: BatchPromptCrossLinks;
  batchPromptActions?: BatchPromptItemActions;
  readinessModel?: ComfyImageModel | string;
  readinessDetail?: DetailLevel | string;
  readinessHints?: string;
  negativePrompt?: string;
  readinessMinScore?: number;
  readinessGateEnabled?: boolean;
  showWeightInspector?: boolean;
  onOutputChange?: (value: string) => void;
  /** Pre-optimize LLM/template draft shown in a collapsed block. */
  rawPrompt?: string;
  /** Generate: primary Queue only; Copy / Save / lint stay in More actions. Default on outside Full workspace. */
  compactActions?: boolean;
  /** When set, batch prompt cards become editable. */
  onBatchPromptChange?: (index: number, value: string) => void;
};

export default function EnhancedPromptResult({
  diagnostics,
  onSaveHistory,
  onSendComfyUi,
  onFixPrompt,
  onCopyPair,
  onExportBatch,
  onQueueBatchComfyUi,
  onCompact,
  onReformat,
  reformatTargetLabel,
  onRunPipeline,
  onExportSidecar,
  onPreviewWorkflow,
  onImprove,
  onRefine,
  onEditPrompt,
  onContinueInpaint,
  onContinueOutpaint,
  onContinueCompose,
  onContinueVideo,
  onContinueControlNet,
  onQueueSeedBatch,
  seedBatchLabel,
  workflowPreview,
  previewStatus,
  variationSeed,
  onLockSeed,
  seedLocked,
  fixStatus,
  compactStatus,
  reformatStatus,
  pipelineStatus,
  preDiagnostics,
  comfyUiStatus,
  comfyUiJob,
  comfyUiPreviewUrl,
  historySaved,
  pairCopied,
  batchOutputs,
  batchItems,
  batchCrossLinks,
  batchPromptActions,
  readinessModel,
  readinessDetail,
  readinessHints,
  negativePrompt,
  readinessMinScore = DEFAULT_READINESS_MIN_SCORE,
  readinessGateEnabled = true,
  showWeightInspector = true,
  onOutputChange,
  rawPrompt,
  onBatchPromptChange,
  compactActions: compactActionsProp,
  ...panelProps
}: EnhancedPromptResultProps) {
  const workspaceMode = useWorkspaceMode();
  const compactActions = compactActionsProp ?? workspaceMode !== 'full';
  const workflowSelection = useComfyWorkflowSelection();
  const sharedSettings = loadSettingsCache().shared;
  const showComfyActions = Boolean(onSendComfyUi || onQueueBatchComfyUi || onPreviewWorkflow);
  const showWorkflowSelector =
    workflowSelection.mounted && !usesSystemWorkflowPath(sharedSettings, sharedSettings.model);
  const [readinessResult, setReadinessResult] = useState<PromptReadinessResult | null>(null);
  const [copiedBatchIndex, setCopiedBatchIndex] = useState<number | null>(null);
  const [savedBatchIndices, setSavedBatchIndices] = useState<Set<number>>(() => new Set());
  const [pairCopiedBatchIndex, setPairCopiedBatchIndex] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);

  const queueReadinessAllowed =
    !readinessGateEnabled ||
    !readinessResult ||
    isReadinessQueueAllowed(readinessResult.score, readinessMinScore);

  const parsedSeed = useMemo(() => {
    if (!variationSeed?.trim()) {
      return undefined;
    }
    const numeric = Number(variationSeed.trim());
    return Number.isFinite(numeric) ? numeric : undefined;
  }, [variationSeed]);

  const handleSendComfyUi = useCallback(() => {
    if (!onSendComfyUi) {
      return;
    }
    if (
      readinessGateEnabled &&
      readinessResult &&
      !isReadinessQueueAllowed(readinessResult.score, readinessMinScore)
    ) {
      const proceed = window.confirm(
        `Prompt readiness is ${readinessResult.score}/100 (recommended minimum ${readinessMinScore}). Queue anyway?`
      );
      if (!proceed) {
        return;
      }
    }
    markComfyQueueIntent();
    onSendComfyUi();
  }, [onSendComfyUi, readinessGateEnabled, readinessMinScore, readinessResult]);

  const resolvedBatchItems: BatchPromptItem[] =
    batchItems ?? batchOutputs?.map(prompt => ({ prompt })) ?? [];

  const copyBatchPrompt = useCallback(async (prompt: string, index: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedBatchIndex(index);
      window.setTimeout(() => setCopiedBatchIndex(null), 2000);
    } catch {
      // Parent surfaces clipboard errors when using the main copy action.
    }
  }, []);

  const openComfyPreviewLightbox = useCallback(() => {
    if (!comfyUiPreviewUrl) {
      return;
    }

    setLightbox({
      images: [comfyUiPreviewUrl],
      originalImages: [comfyUiPreviewUrl],
      mediaKinds: [mediaKindFromViewUrl(comfyUiPreviewUrl)],
      index: 0,
      title: panelProps.output ? panelProps.output.slice(0, 120) : 'ComfyUI output preview',
    });
  }, [comfyUiPreviewUrl, panelProps.output]);

  const statusNotes = useMemo(() => {
    const notes: StatusToastNote[] = [];
    const push = (
      id: string,
      text: string | null | undefined,
      tone: StatusToastNote['tone'] = 'neutral'
    ) => {
      const trimmed = text?.trim();
      if (trimmed) {
        notes.push({ id, text: trimmed, tone });
      }
    };
    push('pipeline', pipelineStatus, 'info');
    push('preview', previewStatus, 'info');
    push('fix', fixStatus, 'warning');
    push('compact', compactStatus, 'warning');
    push('reformat', reformatStatus, 'info');
    push('comfy', comfyUiStatus, /fail|error/i.test(comfyUiStatus ?? '') ? 'danger' : 'success');
    if (
      !fixStatus &&
      !comfyUiStatus &&
      !pipelineStatus &&
      !previewStatus &&
      !compactStatus &&
      !reformatStatus &&
      variationSeed
    ) {
      const seed = variationSeed.length > 120 ? `${variationSeed.slice(0, 120)}…` : variationSeed;
      push('seed', `${PINNED_VARIATION_SEED_LABEL}: ${seed}`, 'neutral');
    }
    return notes;
  }, [
    compactStatus,
    comfyUiStatus,
    fixStatus,
    pipelineStatus,
    previewStatus,
    reformatStatus,
    variationSeed,
  ]);

  if (!panelProps.output && resolvedBatchItems.length === 0) {
    return null;
  }

  const showBatchCards = resolvedBatchItems.length > 0;
  const showSingleActions = Boolean(
    panelProps.output &&
    !showBatchCards &&
    (onSaveHistory ||
      onSendComfyUi ||
      onFixPrompt ||
      onCopyPair ||
      onLockSeed ||
      onCompact ||
      onReformat ||
      onRunPipeline ||
      onExportSidecar ||
      onPreviewWorkflow ||
      onImprove ||
      onRefine ||
      onEditPrompt ||
      onContinueInpaint ||
      onContinueOutpaint ||
      onContinueCompose ||
      onContinueVideo ||
      onContinueControlNet ||
      onQueueSeedBatch)
  );

  const previewIsMotion = Boolean(comfyUiPreviewUrl && isMotionViewUrl(comfyUiPreviewUrl));
  const previewIsHtmlVideo = Boolean(comfyUiPreviewUrl && isHtmlVideoViewUrl(comfyUiPreviewUrl));
  const previewKind = comfyUiPreviewUrl ? mediaKindFromViewUrl(comfyUiPreviewUrl) : 'image';

  return (
    <div className="space-y-6">
      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        onIndexChange={index =>
          setLightbox(previous => (previous ? { ...previous, index } : previous))
        }
      />
      {preDiagnostics && (
        <section className="space-y-2">
          <p className="type-overline">Pre-generation lint</p>
          <PromptDiagnosticsPanel diagnostics={preDiagnostics} />
        </section>
      )}

      {showBatchCards ? (
        <ToolSection title={`Batch results (${resolvedBatchItems.length})`}>
          <div className="mb-[var(--group-gap)] flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {onExportBatch && (
              <Button variant="secondary" className="w-full sm:w-auto" onClick={onExportBatch}>
                Export batch
              </Button>
            )}
            {onQueueBatchComfyUi && (
              <Button
                variant="accent-outline"
                className="w-full sm:w-auto"
                onClick={onQueueBatchComfyUi}
              >
                Queue batch to ComfyUI
              </Button>
            )}
          </div>

          {showWorkflowSelector && (
            <CollapsibleSection
              title="Batch workflow override"
              summary="Optional — Shared settings already pick the workflow."
              defaultOpen={false}
              persistKey="result-batch-workflow-override"
            >
              <ComfyWorkflowSelector
                compact
                selectedId={workflowSelection.selectedId}
                defaultLabel={workflowSelection.defaultLabel}
                localFiles={workflowSelection.localFiles}
                serverFiles={workflowSelection.serverFiles}
                onChange={workflowSelection.setSelectedId}
              />
            </CollapsibleSection>
          )}

          <ToolBlockGroup className="mt-[var(--group-gap)]">
            {resolvedBatchItems.map((item, index) => (
              <BatchPromptCard
                key={`batch-${index}-${item.prompt.slice(0, 24)}`}
                index={index}
                prompt={item.prompt}
                rawPrompt={readRawPrompt(item.metadata)}
                crossLinks={batchCrossLinks}
                copied={copiedBatchIndex === index}
                historySaved={savedBatchIndices.has(index)}
                pairCopied={pairCopiedBatchIndex === index}
                onCopy={() => void copyBatchPrompt(item.prompt, index)}
                onPromptChange={
                  onBatchPromptChange ? value => onBatchPromptChange(index, value) : undefined
                }
                onQueueComfyUi={
                  batchPromptActions?.onQueueComfyUi
                    ? () => void batchPromptActions.onQueueComfyUi?.(item.prompt, index)
                    : undefined
                }
                onSaveHistory={
                  batchPromptActions?.onSaveHistory
                    ? () => {
                        batchPromptActions.onSaveHistory?.({
                          prompt: item.prompt,
                          index,
                          metadata: item.metadata,
                        });
                        setSavedBatchIndices(previous => new Set(previous).add(index));
                      }
                    : undefined
                }
                onCopyPair={
                  batchPromptActions?.onCopyPair
                    ? () => {
                        void batchPromptActions.onCopyPair?.(item.prompt, index);
                        setPairCopiedBatchIndex(index);
                        window.setTimeout(() => setPairCopiedBatchIndex(null), 2000);
                      }
                    : undefined
                }
                onExportSidecar={
                  batchPromptActions?.onExportSidecar
                    ? () =>
                        void batchPromptActions.onExportSidecar?.(item.prompt, index, item.metadata)
                    : undefined
                }
              />
            ))}
          </ToolBlockGroup>
        </ToolSection>
      ) : (
        <PromptResultPanel {...panelProps} onOutputChange={onOutputChange} rawPrompt={rawPrompt} />
      )}

      <PromptDiagnosticsPanel diagnostics={diagnostics ?? null} />

      {panelProps.output.trim() && readinessModel && readinessDetail ? (
        compactActions ? (
          <CollapsibleSection
            title="Prompt readiness"
            summary="Score, quick fixes, and reformat suggestions."
            defaultOpen={false}
            persistKey="result-readiness-compact"
          >
            <ReadinessBadge
              prompt={panelProps.output}
              model={readinessModel}
              detail={readinessDetail}
              hints={readinessHints}
              negativePrompt={negativePrompt}
              minScore={readinessMinScore}
              onResult={setReadinessResult}
              onCompact={onCompact}
              onFixRules={onFixPrompt}
              onReformat={onReformat}
            />
          </CollapsibleSection>
        ) : (
          <ReadinessBadge
            prompt={panelProps.output}
            model={readinessModel}
            detail={readinessDetail}
            hints={readinessHints}
            negativePrompt={negativePrompt}
            minScore={readinessMinScore}
            onResult={setReadinessResult}
            onCompact={onCompact}
            onFixRules={onFixPrompt}
            onReformat={onReformat}
          />
        )
      ) : null}

      {showWeightInspector && !compactActions && panelProps.output.trim() && readinessModel ? (
        <PromptWeightInspector
          prompt={panelProps.output}
          model={readinessModel}
          onChange={onOutputChange}
          textareaId="generated-prompt-editor"
        />
      ) : null}

      {panelProps.output.trim() && (onSendComfyUi || onQueueBatchComfyUi) && !compactActions ? (
        <ResultQuickActions
          prompt={panelProps.output}
          negativePrompt={negativePrompt}
          model={typeof readinessModel === 'string' ? readinessModel : 'sdxl'}
          seed={parsedSeed}
        />
      ) : null}

      {(onSaveHistory ||
        onSendComfyUi ||
        onFixPrompt ||
        onCopyPair ||
        onLockSeed ||
        onCompact ||
        onReformat ||
        onRunPipeline ||
        onExportSidecar ||
        onPreviewWorkflow ||
        onImprove ||
        onRefine ||
        onEditPrompt) &&
        showSingleActions && (
          <ToolSection className="space-y-5">
            {onSendComfyUi ? (
              <ToolActionRow className="gap-3">
                <Button
                  variant="primary"
                  onClick={handleSendComfyUi}
                  data-action="send-comfyui"
                  className={
                    !queueReadinessAllowed ? 'border-[var(--tint-warning-border)]' : undefined
                  }
                >
                  {queueReadinessAllowed ? 'Queue' : 'Queue (below readiness)'}
                </Button>
              </ToolActionRow>
            ) : null}

            {showComfyActions && (
              <CollapsibleSection
                title={compactActions ? 'Queue options' : 'Queue overrides'}
                summary={
                  compactActions
                    ? 'Workflow picker and advanced queue params.'
                    : 'Workflow picker and advanced queue params — model/detail live in Shared settings.'
                }
                defaultOpen={false}
                persistKey={
                  compactActions ? 'result-queue-options-compact' : 'result-queue-overrides'
                }
              >
                {showWorkflowSelector ? (
                  <ComfyWorkflowSelector
                    compact
                    selectedId={workflowSelection.selectedId}
                    defaultLabel={workflowSelection.defaultLabel}
                    localFiles={workflowSelection.localFiles}
                    serverFiles={workflowSelection.serverFiles}
                    onChange={workflowSelection.setSelectedId}
                    helpText="Optional override for Queue. Prefer Shared settings when possible."
                  />
                ) : null}
                <QueueParamsPanel compact />
              </CollapsibleSection>
            )}

            <CollapsibleSection
              title="More actions"
              summary={
                compactActions
                  ? 'Copy, save, compact, reformat, fix, export, and edit tools.'
                  : 'Prepare, compact, reformat, lock seed, fix, history, preview, improve, and export.'
              }
              defaultOpen={false}
              persistKey={compactActions ? 'result-more-actions-compact' : 'result-more-actions'}
            >
              <ToolActionRow>
                <Button variant="secondary" onClick={panelProps.onCopy} data-action="copy-prompt">
                  {panelProps.copied ? 'Copied!' : 'Copy for ComfyUI'}
                </Button>
                {onSaveHistory ? (
                  <Button variant="secondary" onClick={onSaveHistory}>
                    {historySaved ? 'Saved to history' : 'Save to history'}
                  </Button>
                ) : null}
                {!compactActions && onRunPipeline && (
                  <Button variant="info" onClick={onRunPipeline}>
                    Prepare for ComfyUI
                  </Button>
                )}
                {onCompact && (
                  <Button variant="danger" onClick={onCompact}>
                    {panelProps.limits && panelProps.output.length > panelProps.limits.maxChars
                      ? 'Compact to limit'
                      : 'Compact prompt'}
                  </Button>
                )}
                {onReformat && reformatTargetLabel && (
                  <Button variant="secondary" onClick={onReformat}>
                    Reformat for {reformatTargetLabel}
                  </Button>
                )}
                {onLockSeed && variationSeed && (
                  <Button variant="accent-outline" onClick={onLockSeed}>
                    {seedLocked ? 'Seed locked' : 'Lock variation seed'}
                  </Button>
                )}
                {onFixPrompt && (
                  <Button variant="secondary" onClick={onFixPrompt}>
                    Fix prompt (rules)
                  </Button>
                )}
                {onCopyPair && (
                  <Button variant="secondary" onClick={onCopyPair} data-action="copy-pair">
                    {pairCopied ? 'Pair copied!' : 'Copy prompt pair'}
                  </Button>
                )}
                {onPreviewWorkflow && (
                  <Button variant="info" onClick={onPreviewWorkflow}>
                    Preview workflow
                  </Button>
                )}
                {onImprove && (
                  <Button variant="secondary" onClick={onImprove}>
                    Improve output
                  </Button>
                )}
                {onRefine && (
                  <Button variant="secondary" onClick={onRefine}>
                    Open in Refine
                  </Button>
                )}
                {onEditPrompt && (
                  <Button variant="secondary" onClick={onEditPrompt}>
                    Edit in Prompt Editor
                  </Button>
                )}
                {onContinueInpaint && (
                  <Button variant="secondary" onClick={onContinueInpaint}>
                    Continue in Inpaint
                  </Button>
                )}
                {onContinueOutpaint && (
                  <Button variant="secondary" onClick={onContinueOutpaint}>
                    Continue in Outpaint
                  </Button>
                )}
                {onContinueCompose && (
                  <Button variant="secondary" onClick={onContinueCompose}>
                    Continue in Compose
                  </Button>
                )}
                {onContinueVideo && (
                  <Button variant="secondary" onClick={onContinueVideo}>
                    Continue in Video
                  </Button>
                )}
                {onContinueControlNet && (
                  <Button variant="secondary" onClick={onContinueControlNet}>
                    Continue in ControlNet
                  </Button>
                )}
                {onQueueSeedBatch && (
                  <Button variant="secondary" onClick={onQueueSeedBatch}>
                    {seedBatchLabel ?? 'Queue 3 seed variants'}
                  </Button>
                )}
                {onExportSidecar && (
                  <Button variant="secondary" onClick={onExportSidecar}>
                    Export sidecar JSON
                  </Button>
                )}
                {compactActions && onRunPipeline && (
                  <Button variant="info" onClick={onRunPipeline}>
                    Prepare for ComfyUI
                  </Button>
                )}
              </ToolActionRow>
            </CollapsibleSection>
          </ToolSection>
        )}

      {comfyUiJob && (isComfyUiJobProcessing(comfyUiJob) || comfyUiJob.status === 'error') ? (
        <ComfyUiJobStatusPanel job={comfyUiJob} />
      ) : null}

      {statusNotes.length > 0 && !(comfyUiJob && isComfyUiJobProcessing(comfyUiJob)) ? (
        <StatusToastStrip notes={statusNotes} />
      ) : null}

      {workflowPreview && <WorkflowPreviewPanel preview={workflowPreview} />}

      {comfyUiPreviewUrl && (
        <div className="ui-card overflow-hidden">
          {previewKind === 'audio' || previewKind === 'mesh' ? (
            <GalleryKindPreview
              kind={previewKind}
              src={comfyUiPreviewUrl}
              className="max-h-80 w-full"
              controls
            />
          ) : previewIsMotion ? (
            <div className="relative bg-[var(--bg-subtle)]">
              <GalleryKindPreview
                kind="video"
                src={comfyUiPreviewUrl}
                alt="ComfyUI clip preview"
                className="max-h-80 w-full object-contain"
                controls={previewIsHtmlVideo}
              />
              {previewIsHtmlVideo ? null : (
                <button
                  type="button"
                  onClick={openComfyPreviewLightbox}
                  className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
                  aria-label="Open clip preview"
                />
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={openComfyPreviewLightbox}
              className="block w-full cursor-zoom-in"
              aria-label="Open image preview"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={comfyUiPreviewUrl}
                alt="ComfyUI output preview"
                className="max-h-80 w-full bg-[var(--bg-subtle)] object-contain"
              />
            </button>
          )}
          <div className="space-y-2 border-t border-[var(--border-subtle)] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-caption text-[var(--tint-success-text)]">
                ComfyUI output ready
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={openComfyPreviewLightbox}
                  className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  {previewKind === 'audio'
                    ? 'View audio'
                    : previewKind === 'mesh'
                      ? 'View 3D'
                      : previewIsMotion
                        ? 'View clip'
                        : 'View image'}
                </button>
                <a
                  href={comfyUiPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Open in new tab
                </a>
                <a
                  href="/gallery"
                  className="type-caption transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Gallery
                </a>
              </div>
            </div>
            {onContinueInpaint ||
            onContinueOutpaint ||
            onContinueCompose ||
            onContinueVideo ||
            onContinueControlNet ||
            onRefine ||
            onQueueSeedBatch ? (
              <div data-testid="result-continue-edit" className="flex flex-wrap gap-1.5">
                {onRefine ? (
                  <Button
                    variant="secondary"
                    className="!min-h-8 px-2.5 text-[11px]"
                    onClick={onRefine}
                  >
                    Refine
                  </Button>
                ) : null}
                {onContinueInpaint ? (
                  <Button
                    variant="secondary"
                    className="!min-h-8 px-2.5 text-[11px]"
                    onClick={onContinueInpaint}
                  >
                    Inpaint
                  </Button>
                ) : null}
                {onContinueOutpaint ? (
                  <Button
                    variant="secondary"
                    className="!min-h-8 px-2.5 text-[11px]"
                    onClick={onContinueOutpaint}
                  >
                    Outpaint
                  </Button>
                ) : null}
                {onContinueCompose ? (
                  <Button
                    variant="secondary"
                    className="!min-h-8 px-2.5 text-[11px]"
                    onClick={onContinueCompose}
                  >
                    Compose
                  </Button>
                ) : null}
                {onContinueVideo ? (
                  <Button
                    variant="secondary"
                    className="!min-h-8 px-2.5 text-[11px]"
                    onClick={onContinueVideo}
                  >
                    Video
                  </Button>
                ) : null}
                {onContinueControlNet ? (
                  <Button
                    variant="secondary"
                    className="!min-h-8 px-2.5 text-[11px]"
                    onClick={onContinueControlNet}
                  >
                    ControlNet
                  </Button>
                ) : null}
                {onQueueSeedBatch ? (
                  <Button
                    variant="secondary"
                    className="!min-h-8 px-2.5 text-[11px]"
                    onClick={onQueueSeedBatch}
                  >
                    {seedBatchLabel ?? '3 seeds'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
