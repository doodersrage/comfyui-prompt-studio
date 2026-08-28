'use client';

import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { readRawPrompt } from '@/lib/raw-prompt';
import type { useNsfwGeneratorToolOrchestration } from '@/hooks/useNsfwGeneratorToolOrchestration';

type ViewModel = ReturnType<typeof useNsfwGeneratorToolOrchestration>;

type Props = Pick<
  ViewModel,
  | 'output'
  | 'setOutput'
  | 'result'
  | 'shared'
  | 'toolSettings'
  | 'selectedModel'
  | 'actions'
  | 'copied'
  | 'copyOutput'
>;

export default function NsfwGeneratorResultSection({
  output,
  setOutput,
  result,
  shared,
  toolSettings,
  selectedModel,
  actions,
  copied,
  copyOutput,
}: Props) {
  return (
    <>
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
    </>
  );
}
