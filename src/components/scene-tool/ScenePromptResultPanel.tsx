'use client';

import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { readRawPrompt } from '@/lib/raw-prompt';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';

type PromptResultActions = ReturnType<typeof usePromptResultActions>;

export type ScenePromptResultPanelProps = {
  output: string;
  onOutputChange: (value: string) => void;
  result: EnrichedToolGenerateResult | null;
  copied: boolean;
  onCopy: () => void;
  actions: PromptResultActions;
  shared: Pick<SharedToolSettings, 'model' | 'detail' | 'lockedVariationSeed'>;
  selectedComfyNode: string;
  queueLabel: string;
  /** History save + optional fix-prompt hints. */
  hints?: string;
  /** When false, fix-prompt is called without hints (background tool). */
  passHintsToFix?: boolean;
  variationSeed?: string | null;
  onLockSeed?: () => void;
  includeEditPrompt?: boolean;
  includeVariationSeed?: boolean;
};

/** Shared generate-result + mobile queue chrome for scene tools. */
export default function ScenePromptResultPanel({
  output,
  onOutputChange,
  result,
  copied,
  onCopy,
  actions,
  shared,
  selectedComfyNode,
  queueLabel,
  hints,
  passHintsToFix = true,
  variationSeed,
  onLockSeed,
  includeEditPrompt = true,
  includeVariationSeed = true,
}: ScenePromptResultPanelProps) {
  return (
    <>
      <EnhancedPromptResult
        output={output}
        onOutputChange={onOutputChange}
        rawPrompt={readRawPrompt(result?.metadata)}
        provider={result?.provider ?? null}
        comfyNode={result?.comfyNode}
        limits={result?.limits}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={onCopy}
        diagnostics={actions.diagnostics ?? result?.diagnostics ?? null}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints,
            metadata: result?.metadata,
          })
        }
        onSendComfyUi={() => void actions.sendComfyUi(output)}
        onEditPrompt={
          includeEditPrompt
            ? () => actions.editPromptOutput(output, actions.comfyUiPreviewUrl, undefined, hints)
            : undefined
        }
        {...promptResultPreviewProps(actions, output)}
        {...continueEditResultProps(actions, output)}
        onFixPrompt={() =>
          void actions.fixPrompt(output, onOutputChange, passHintsToFix ? hints : undefined)
        }
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, onOutputChange)}
        onReformat={() => void actions.reformatForModel(output, onOutputChange)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() =>
          void actions.runExportPipeline(output, onOutputChange, {
            maxChars: result?.limits?.maxChars,
            queueComfyUi: true,
          })
        }
        onExportSidecar={() =>
          void actions.exportSidecar(output, {
            comfyNode: result?.comfyNode ?? selectedComfyNode,
            ...(includeVariationSeed
              ? { variationSeed: variationSeed ?? shared.lockedVariationSeed }
              : {}),
            metadata: result?.metadata,
          })
        }
        onLockSeed={onLockSeed}
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
        label={queueLabel}
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => void actions.sendComfyUi(output)}
      />
    </>
  );
}
