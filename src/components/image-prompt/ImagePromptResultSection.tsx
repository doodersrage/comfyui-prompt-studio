'use client';

import Link from 'next/link';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { readRawPrompt } from '@/lib/raw-prompt';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { TextArea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import type { useImagePromptToolOrchestration } from '@/hooks/useImagePromptToolOrchestration';

const ACCENT = 'fuchsia' as const;

type ImagePromptResultSectionProps = Pick<
  ReturnType<typeof useImagePromptToolOrchestration>,
  | 'shared'
  | 'toolSettings'
  | 'refImages'
  | 'output'
  | 'setOutput'
  | 'result'
  | 'loading'
  | 'copied'
  | 'refineIntent'
  | 'setRefineIntent'
  | 'handoffQueueParams'
  | 'actions'
  | 'selectedModel'
  | 'inferredSport'
  | 'copyOutput'
  | 'refine'
>;

export default function ImagePromptResultSection({
  shared,
  toolSettings,
  refImages,
  output,
  setOutput,
  result,
  loading,
  copied,
  refineIntent,
  setRefineIntent,
  handoffQueueParams,
  actions,
  selectedModel,
  inferredSport,
  copyOutput,
  refine,
}: ImagePromptResultSectionProps) {
  return (
    <>
      {output ? (
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
      ) : null}

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
    </>
  );
}
