'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import {
  loadLastFailedQueue,
  requestRetryLastFailedQueue,
  type LastFailedQueuePayload,
} from '@/lib/last-failed-queue';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

type GalleryFailedRecoveryBannerProps = {
  failedEntries: ComfyGalleryEntry[];
  onRetrySelected: () => void;
  onRetryAllVisible: () => void;
  onClearFailedFilter: () => void;
  selectedFailedCount: number;
};

export default function GalleryFailedRecoveryBanner({
  failedEntries,
  onRetrySelected,
  onRetryAllVisible,
  onClearFailedFilter,
  selectedFailedCount,
}: GalleryFailedRecoveryBannerProps) {
  const [lastFailed, setLastFailed] = useState<LastFailedQueuePayload | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setLastFailed(loadLastFailedQueue());
    });
  }, [failedEntries.length]);

  if (failedEntries.length === 0 && !lastFailed) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-rose-500/25 bg-gradient-to-br from-rose-500/12 via-[var(--bg-elevated)]/70 to-transparent px-4 py-3 shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)]">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-rose-100">
          {failedEntries.length > 0
            ? `${failedEntries.length} failed job${failedEntries.length === 1 ? '' : 's'}`
            : 'Last failed queue ready'}
        </p>
        <p className="type-caption text-[var(--text-muted)]">
          Retry with the same seed, a new seed, or exact graph when stored.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {selectedFailedCount > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={onRetrySelected}>
            Retry selected ({selectedFailedCount})
          </Button>
        ) : null}
        {failedEntries.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={onRetryAllVisible}>
            Retry all visible
          </Button>
        ) : null}
        {lastFailed ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => requestRetryLastFailedQueue()}
          >
            Retry last failed
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onClearFailedFilter}>
          Clear filter
        </Button>
      </div>
    </div>
  );
}
