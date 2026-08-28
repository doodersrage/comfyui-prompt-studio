'use client';

import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import type { useOutpaintToolOrchestration } from '@/hooks/useOutpaintToolOrchestration';

type ViewModel = ReturnType<typeof useOutpaintToolOrchestration>;

type Props = Pick<
  ViewModel,
  | 'shared'
  | 'intent'
  | 'resultOutput'
  | 'output'
  | 'setOutput'
  | 'selectedModel'
  | 'actions'
  | 'copied'
  | 'copyOutput'
  | 'lastQueueOptions'
  | 'busy'
  | 'sourceUrl'
  | 'status'
  | 'runOutpaint'
  | 'updateShared'
>;

export default function OutpaintResultSection({
  shared,
  intent,
  resultOutput,
  output,
  setOutput,
  selectedModel,
  actions,
  copied,
  copyOutput,
  lastQueueOptions,
  busy,
  sourceUrl,
  status,
  runOutpaint,
  updateShared,
}: Props) {
  return (
    <>
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
    </>
  );
}
