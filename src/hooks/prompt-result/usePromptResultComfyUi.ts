'use client';

import type { ComfyUiDeps } from '@/hooks/prompt-result/comfy-ui-types';
import type { PromptResultActionsConfig } from '@/hooks/prompt-result/types';
import { usePromptResultComfyUiPreviewTracker } from '@/hooks/prompt-result/usePromptResultComfyUiPreviewTracker';
import { usePromptResultComfyUiQueueSingle } from '@/hooks/prompt-result/usePromptResultComfyUiQueueSingle';
import { usePromptResultComfyUiBatchQueue } from '@/hooks/prompt-result/usePromptResultComfyUiBatchQueue';
import { usePromptResultComfyUiSeedVariation } from '@/hooks/prompt-result/usePromptResultComfyUiSeedVariation';

export function usePromptResultComfyUi(config: PromptResultActionsConfig, deps: ComfyUiDeps) {
  const tracker = usePromptResultComfyUiPreviewTracker(config);
  const { sendComfyUi } = usePromptResultComfyUiQueueSingle(config, deps, tracker);
  const { sendBatchComfyUi } = usePromptResultComfyUiBatchQueue(config, deps, tracker);
  const { sendSeedVariationBatch } = usePromptResultComfyUiSeedVariation(
    sendComfyUi,
    tracker.setComfyUiStatus
  );

  return {
    comfyUiStatus: tracker.comfyUiStatus,
    comfyUiJob: tracker.comfyUiJob,
    comfyUiPreviewUrl: tracker.comfyUiPreviewUrl,
    workflowPreview: tracker.workflowPreview,
    previewStatus: tracker.previewStatus,
    resetStatuses: tracker.resetStatuses,
    sendComfyUi,
    sendBatchComfyUi,
    previewWorkflow: tracker.previewWorkflow,
    sendSeedVariationBatch,
  };
}
