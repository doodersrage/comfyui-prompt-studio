'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { GALLERY_CAP_KEEPER_MIN_RATING } from '@/lib/gallery-cap';
import {
  downloadGalleryImagesSequential,
  downloadGallerySidecarBundle,
} from '@/lib/comfyui-gallery-export';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';

export type UseGalleryPanelRecoveryOptions = {
  entries: ComfyGalleryEntry[];
  setRequeueStatus: Dispatch<SetStateAction<string | null>>;
};

export type UseGalleryPanelRecoveryResult = {
  retryFailedEntries: (targets: ComfyGalleryEntry[], mode?: 'same' | 'new' | 'exact') => void;
  exportCapKeepers: () => void;
};

export function useGalleryPanelRecovery({
  entries,
  setRequeueStatus,
}: UseGalleryPanelRecoveryOptions): UseGalleryPanelRecoveryResult {
  const retryFailedEntries = useCallback(
    (targets: ComfyGalleryEntry[], mode: 'same' | 'new' | 'exact' = 'same') => {
      const failed = targets.filter(entry => entry.status === 'error');
      if (failed.length === 0) {
        return;
      }
      setRequeueStatus(`Retrying ${failed.length} failed job(s)…`);
      void import('@/lib/comfyui-requeue')
        .then(({ requeueComfyJobs }) =>
          requeueComfyJobs(
            failed.map(entry => {
              const canExact = Boolean(entry.hasStoredWorkflow || entry.workflowJson);
              const exactGraph = mode === 'exact' && canExact;
              return {
                prompt: entry.prompt,
                negativePrompt: entry.negativePrompt,
                tool: entry.tool,
                model: entry.model,
                queueParams: entry.queueParams,
                workflowJson: entry.workflowJson,
                newSeed: mode === 'new',
                exactGraph,
                parentGalleryEntryId: entry.id,
                derivedKind: 'variation' as const,
              };
            }),
            setRequeueStatus
          )
        )
        .then(({ queued, failed: failCount }) => {
          toastBulkQueueSummary({
            label: 'Failed retry finished',
            queued,
            failed: failCount,
          });
        });
    },
    [setRequeueStatus]
  );

  const exportCapKeepers = useCallback(() => {
    const keepers = entries.filter(
      entry => Boolean(entry.favorite) || (entry.reviewRating ?? 0) >= GALLERY_CAP_KEEPER_MIN_RATING
    );
    if (keepers.length === 0) {
      setRequeueStatus('No keepers yet — favorite or rate ≥4★ first.');
      return;
    }
    downloadGallerySidecarBundle(keepers);
    setRequeueStatus(`Exporting ${keepers.length} keeper image(s)…`);
    void downloadGalleryImagesSequential(keepers).then(count => {
      setRequeueStatus(`Exported ${count} keeper image(s) + sidecars.`);
    });
  }, [entries, setRequeueStatus]);

  return {
    retryFailedEntries,
    exportCapKeepers,
  };
}
