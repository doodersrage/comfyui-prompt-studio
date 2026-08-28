'use client';

import { useCallback } from 'react';
import { usePromptResultDiagnostics } from '@/hooks/prompt-result/usePromptResultDiagnostics';
import { usePromptResultHistory } from '@/hooks/prompt-result/usePromptResultHistory';
import { usePromptResultComfyUi } from '@/hooks/prompt-result/usePromptResultComfyUi';
import { usePromptResultTransforms } from '@/hooks/prompt-result/usePromptResultTransforms';
import { usePromptResultHandoffs } from '@/hooks/prompt-result/usePromptResultHandoffs';
import type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';

export type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';

export function usePromptResultActions(config: PromptResultActionsConfig) {
  const diagnostics = usePromptResultDiagnostics(config);
  const history = usePromptResultHistory(config, diagnostics.diagnostics);
  const comfyUi = usePromptResultComfyUi(config, {
    saveHistory: history.saveHistory,
    historySaved: history.historySaved,
  });
  const transforms = usePromptResultTransforms(config, {
    diagnostics: diagnostics.diagnostics,
    lintPrompt: diagnostics.lintPrompt,
    applyRuleFix: diagnostics.applyRuleFix,
    saveHistory: history.saveHistory,
    sendComfyUi: comfyUi.sendComfyUi,
    setFixStatus: diagnostics.setFixStatus,
  });
  const handoffs = usePromptResultHandoffs(config);

  const resetStatuses = useCallback(() => {
    history.resetStatuses();
    diagnostics.resetStatuses();
    comfyUi.resetStatuses();
    transforms.resetStatuses();
  }, [history, diagnostics, comfyUi, transforms]);

  return {
    preDiagnostics: diagnostics.preDiagnostics,
    diagnostics: diagnostics.diagnostics,
    historySaved: history.historySaved,
    fixStatus: diagnostics.fixStatus,
    comfyUiStatus: comfyUi.comfyUiStatus,
    comfyUiJob: comfyUi.comfyUiJob,
    comfyUiPreviewUrl: comfyUi.comfyUiPreviewUrl,
    pairCopied: transforms.pairCopied,
    resetStatuses,
    runPreLint: diagnostics.runPreLint,
    lintPrompt: diagnostics.lintPrompt,
    finalizePrompt: diagnostics.finalizePrompt,
    fixPrompt: diagnostics.fixPrompt,
    saveHistory: history.saveHistory,
    sendComfyUi: comfyUi.sendComfyUi,
    sendBatchComfyUi: comfyUi.sendBatchComfyUi,
    previewWorkflow: comfyUi.previewWorkflow,
    workflowPreview: comfyUi.workflowPreview,
    previewStatus: comfyUi.previewStatus,
    copyPromptPair: transforms.copyPromptPair,
    compactPrompt: transforms.compactPrompt,
    reformatForModel: transforms.reformatForModel,
    compactStatus: transforms.compactStatus,
    reformatStatus: transforms.reformatStatus,
    runExportPipeline: transforms.runExportPipeline,
    exportSidecar: transforms.exportSidecar,
    pipelineStatus: transforms.pipelineStatus,
    setDiagnostics: diagnostics.setDiagnostics,
    improveOutput: handoffs.improveOutput,
    refineOutput: handoffs.refineOutput,
    editPromptOutput: handoffs.editPromptOutput,
    inpaintOutput: handoffs.inpaintOutput,
    outpaintOutput: handoffs.outpaintOutput,
    composeOutput: handoffs.composeOutput,
    videoOutput: handoffs.videoOutput,
    controlNetOutput: handoffs.controlNetOutput,
    sendSeedVariationBatch: comfyUi.sendSeedVariationBatch,
  };
}
