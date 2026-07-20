"use client";

import { useCallback, useMemo, useState } from "react";
import PromptResultPanel from "@/components/PromptResultPanel";
import PromptDiagnosticsPanel from "@/components/PromptDiagnosticsPanel";
import WorkflowPreviewPanel from "@/components/WorkflowPreviewPanel";
import ComfyWorkflowSelector from "@/components/ComfyWorkflowSelector";
import ResultQuickActions from "@/components/ResultQuickActions";
import { useComfyWorkflowSelection } from "@/hooks/useComfyWorkflowSelection";
import {
  ActionButtonBar,
  ToolBlockGroup,
  ToolSection,
} from "@/components/ui/ToolPageShell";
import { Button } from "@/components/ui/Button";
import QueueParamsPanel from "@/components/QueueParamsPanel";
import {
  BatchPromptCard,
  type BatchPromptCrossLinks,
} from "@/components/ui/BatchPromptCard";
import ImageLightbox, { type ImageLightboxState } from "@/components/ui/ImageLightbox";
import ComfyUiJobStatusPanel from "@/components/ui/ComfyUiJobStatusPanel";
import type { ComfyUiJobTrackerState } from "@/lib/comfyui-job-status";
import {
  formatComfyUiJobStatusLine,
  isComfyUiJobProcessing,
} from "@/lib/comfyui-job-status";
import type { GenerationDiagnostics } from "@/lib/generation-diagnostics";
import { PINNED_VARIATION_SEED_LABEL } from "@/lib/tool-ui-labels";
import ReadinessBadge from "@/components/ReadinessBadge";
import PromptWeightInspector from "@/components/PromptWeightInspector";
import type { ComfyImageModel } from "@/lib/comfy-models";
import type { DetailLevel } from "@/lib/detail-level";
import {
  DEFAULT_READINESS_MIN_SCORE,
  isReadinessQueueAllowed,
} from "@/lib/readiness-gate";
import type { PromptReadinessResult } from "@/lib/prompt-readiness";
import {
  lintLoraTriggers,
  formatLoraTriggerLintSummary,
} from "@/lib/lora-trigger-lint";

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
    metadata?: Record<string, unknown>,
  ) => void | Promise<void>;
};

type EnhancedPromptResultProps = {
  output: string;
  provider: "llm" | "template" | "rules" | null;
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
  ...panelProps
}: EnhancedPromptResultProps) {
  const workflowSelection = useComfyWorkflowSelection();
  const showComfyActions = Boolean(onSendComfyUi || onQueueBatchComfyUi || onPreviewWorkflow);
  const [readinessResult, setReadinessResult] = useState<PromptReadinessResult | null>(null);
  const [copiedBatchIndex, setCopiedBatchIndex] = useState<number | null>(null);
  const [savedBatchIndices, setSavedBatchIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [pairCopiedBatchIndex, setPairCopiedBatchIndex] = useState<number | null>(
    null,
  );
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);

  const queueReadinessAllowed =
    !readinessGateEnabled ||
    !readinessResult ||
    isReadinessQueueAllowed(readinessResult.score, readinessMinScore);

  const loraLintIssues = useMemo(
    () => (panelProps.output.trim() ? lintLoraTriggers(panelProps.output) : []),
    [panelProps.output],
  );
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
        `Prompt readiness is ${readinessResult.score}/100 (recommended minimum ${readinessMinScore}). Queue anyway?`,
      );
      if (!proceed) {
        return;
      }
    }
    onSendComfyUi();
  }, [onSendComfyUi, readinessGateEnabled, readinessMinScore, readinessResult]);

  const resolvedBatchItems: BatchPromptItem[] =
    batchItems ??
    batchOutputs?.map((prompt) => ({ prompt })) ??
    [];

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
      index: 0,
      title: panelProps.output
        ? panelProps.output.slice(0, 120)
        : "ComfyUI output preview",
    });
  }, [comfyUiPreviewUrl, panelProps.output]);

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
        onRefine),
  );

  return (
    <div className="space-y-6">
      <ImageLightbox
        state={lightbox}
        onClose={() => setLightbox(null)}
        onIndexChange={(index) =>
          setLightbox((previous) =>
            previous ? { ...previous, index } : previous,
          )
        }
      />
      {preDiagnostics && (
        <section className="space-y-2">
          <p className="type-overline">
            Pre-generation lint
          </p>
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

          {workflowSelection.mounted && (
            <ComfyWorkflowSelector
              compact
              selectedId={workflowSelection.selectedId}
              defaultLabel={workflowSelection.defaultLabel}
              localFiles={workflowSelection.localFiles}
              serverFiles={workflowSelection.serverFiles}
              onChange={workflowSelection.setSelectedId}
            />
          )}

          <ToolBlockGroup className="mt-[var(--group-gap)]">
            {resolvedBatchItems.map((item, index) => (
              <BatchPromptCard
                key={`batch-${index}-${item.prompt.slice(0, 24)}`}
                index={index}
                prompt={item.prompt}
                crossLinks={batchCrossLinks}
                copied={copiedBatchIndex === index}
                historySaved={savedBatchIndices.has(index)}
                pairCopied={pairCopiedBatchIndex === index}
                onCopy={() => void copyBatchPrompt(item.prompt, index)}
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
                        setSavedBatchIndices((previous) => new Set(previous).add(index));
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
                        void batchPromptActions.onExportSidecar?.(
                          item.prompt,
                          index,
                          item.metadata,
                        )
                    : undefined
                }
              />
            ))}
          </ToolBlockGroup>
        </ToolSection>
      ) : (
        <PromptResultPanel {...panelProps} />
      )}

      <PromptDiagnosticsPanel diagnostics={diagnostics ?? null} />

      {panelProps.output.trim() && readinessModel && readinessDetail ? (
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
      ) : null}

      {showWeightInspector && panelProps.output.trim() && readinessModel ? (
        <PromptWeightInspector
          prompt={panelProps.output}
          model={readinessModel}
          onChange={onOutputChange}
        />
      ) : null}

      {panelProps.output.trim() && loraLintIssues.length > 0 ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
          LoRA triggers: {formatLoraTriggerLintSummary(loraLintIssues)}
        </p>
      ) : null}

      {panelProps.output.trim() && (onSendComfyUi || onQueueBatchComfyUi) ? (
        <ResultQuickActions
          prompt={panelProps.output}
          negativePrompt={negativePrompt}
          model={typeof readinessModel === "string" ? readinessModel : "sdxl"}
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
        onRefine) &&
        showSingleActions && (
        <ToolSection className="space-y-5">
          {showComfyActions && workflowSelection.mounted && (
            <>
            <ComfyWorkflowSelector
              compact
              selectedId={workflowSelection.selectedId}
              defaultLabel={workflowSelection.defaultLabel}
              localFiles={workflowSelection.localFiles}
              serverFiles={workflowSelection.serverFiles}
              onChange={workflowSelection.setSelectedId}
              helpText="Workflow JSON used by Send to ComfyUI and Preview workflow below."
            />
            <QueueParamsPanel compact />
            </>
          )}
        <ActionButtonBar>
          {onRunPipeline && (
            <Button variant="info" fullWidth onClick={onRunPipeline} className="font-semibold">
              Prepare for ComfyUI
            </Button>
          )}
          {onCompact && (
            <Button variant="danger" fullWidth onClick={onCompact}>
              {panelProps.limits &&
              panelProps.output.length > panelProps.limits.maxChars
                ? "Compact to limit"
                : "Compact prompt"}
            </Button>
          )}
          {onReformat && reformatTargetLabel && (
            <Button variant="secondary" fullWidth onClick={onReformat}>
              Reformat for {reformatTargetLabel}
            </Button>
          )}
          {onLockSeed && variationSeed && (
            <Button variant="accent-outline" fullWidth onClick={onLockSeed}>
              {seedLocked ? "Seed locked" : "Lock variation seed"}
            </Button>
          )}
          {onCopyPair && (
            <Button variant="secondary" fullWidth onClick={onCopyPair} data-action="copy-pair">
              {pairCopied ? "Pair copied!" : "Copy prompt pair"}
            </Button>
          )}
          {onFixPrompt && (
            <Button variant="secondary" fullWidth onClick={onFixPrompt}>
              Fix prompt (rules)
            </Button>
          )}
          {onSaveHistory && (
            <Button variant="secondary" fullWidth onClick={onSaveHistory}>
              {historySaved ? "Saved to history" : "Save to history"}
            </Button>
          )}
          {onPreviewWorkflow && (
            <Button variant="info" fullWidth onClick={onPreviewWorkflow}>
              Preview workflow
            </Button>
          )}
          {onSendComfyUi && (
            <Button
              variant="accent-outline"
              fullWidth
              onClick={handleSendComfyUi}
              data-action="send-comfyui"
              className={!queueReadinessAllowed ? "border-amber-500/50" : undefined}
            >
              {queueReadinessAllowed ? "Send to ComfyUI" : "Send to ComfyUI (below readiness)"}
            </Button>
          )}
          {onImprove && (
            <Button variant="secondary" fullWidth onClick={onImprove}>
              Improve output
            </Button>
          )}
          {onRefine && (
            <Button variant="secondary" fullWidth onClick={onRefine}>
              Open in Refine
            </Button>
          )}
          {onExportSidecar && (
            <Button variant="secondary" fullWidth onClick={onExportSidecar}>
              Export sidecar JSON
            </Button>
          )}
        </ActionButtonBar>
        </ToolSection>
      )}

      {comfyUiJob && (isComfyUiJobProcessing(comfyUiJob) || comfyUiJob.status === "error") ? (
        <ComfyUiJobStatusPanel job={comfyUiJob} />
      ) : null}

      {(fixStatus ||
        comfyUiStatus ||
        compactStatus ||
        reformatStatus ||
        pipelineStatus ||
        previewStatus ||
        variationSeed) &&
        !(comfyUiJob && isComfyUiJobProcessing(comfyUiJob)) && (
        <p className="type-caption">
          {pipelineStatus ||
            previewStatus ||
            fixStatus ||
            compactStatus ||
            reformatStatus ||
            comfyUiStatus}
          {!fixStatus && !comfyUiStatus && variationSeed
            ? `${PINNED_VARIATION_SEED_LABEL}: ${variationSeed.length > 120 ? `${variationSeed.slice(0, 120)}…` : variationSeed}`
            : null}
        </p>
      )}

      {workflowPreview && (
        <WorkflowPreviewPanel preview={workflowPreview} />
      )}

      {comfyUiPreviewUrl && (
        <div className="ui-card overflow-hidden">
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-3 py-2">
            <span className="type-caption text-[var(--tint-success-text)]">
              ComfyUI output ready
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={openComfyPreviewLightbox}
                className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                View image
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
        </div>
      )}
    </div>
  );
}
