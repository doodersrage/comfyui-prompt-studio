'use client';

import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import type { useControlNetToolOrchestration } from '@/hooks/useControlNetToolOrchestration';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';

type Props = {
  output: string;
  setOutput: (value: string) => void;
  rawPrompt: string | undefined;
  source: 'text' | 'vision' | null;
  mode: ReturnType<typeof useControlNetToolOrchestration>['mode'];
  copied: boolean;
  hintText: string;
  shared: { model: string; detail: string };
  selectedModel: ReturnType<typeof useControlNetToolOrchestration>['selectedModel'];
  actions: ReturnType<typeof usePromptResultActions>;
  queueControlNetOptions: ReturnType<
    typeof useControlNetToolOrchestration
  >['queueControlNetOptions'];
  copyOutput: () => void | Promise<void>;
};

export function ControlNetResultSection({
  output,
  setOutput,
  rawPrompt,
  source,
  mode,
  copied,
  hintText,
  shared,
  selectedModel,
  actions,
  queueControlNetOptions,
  copyOutput,
}: Props) {
  if (!output) {
    return null;
  }

  return (
    <>
      {source === 'vision' ? (
        <p className="text-xs text-[var(--accent-text)]">
          Generated from reference image + {mode} mode
        </p>
      ) : null}
      <EnhancedPromptResult
        output={output}
        provider={source === 'vision' ? 'llm' : 'rules'}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        readinessHints={hintText}
        copied={copied}
        onCopy={() => void copyOutput()}
        onOutputChange={setOutput}
        rawPrompt={rawPrompt}
        onSaveHistory={() => actions.saveHistory({ prompt: output, hints: hintText })}
        onSendComfyUi={() =>
          void actions.sendComfyUi(output, null, undefined, queueControlNetOptions)
        }
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, hintText)}
        onCopyPair={() => void actions.copyPromptPair(output, null)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onExportSidecar={() => actions.exportSidecar(output, { metadata: { hints: hintText } })}
        {...promptResultPreviewProps(actions, output, null)}
        {...continueEditResultProps(actions, output, {
          queueImageOptions: queueControlNetOptions,
        })}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
        historySaved={actions.historySaved}
        pairCopied={actions.pairCopied}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue ControlNet"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => void actions.sendComfyUi(output, null, undefined, queueControlNetOptions)}
      />
    </>
  );
}
