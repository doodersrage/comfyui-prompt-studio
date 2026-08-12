'use client';

import { useEffect, useState } from 'react';
import { getFaceDetailerHealth, type FaceDetailerHealth } from '@/lib/face-detailer-health';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

type FaceDetailerHealthChipProps = {
  refreshKey?: number;
};

export default function FaceDetailerHealthChip({ refreshKey = 0 }: FaceDetailerHealthChipProps) {
  const [health, setHealth] = useState<FaceDetailerHealth | null>(null);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setHealth(getFaceDetailerHealth());
    });
  }, [refreshKey]);

  if (!health) {
    return null;
  }

  const tone =
    health.status === 'ready'
      ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]'
      : health.status === 'detected'
        ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
        : 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';

  return (
    <div className="mt-3 space-y-1">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}
      >
        FaceDetailer: {health.label}
        {health.workflowName ? ` · ${health.workflowName}` : ''}
      </span>
      {health.status === 'missing' ? (
        <p className="text-xs text-[var(--text-muted)]">
          Scaffold a FaceDetailer workflow in the library (or pin{' '}
          <code className="text-[var(--text-muted)]">faceDetailer=&lt;id&gt;</code> in the model
          workflow map) so Gallery → Face detail appears.
        </p>
      ) : null}
    </div>
  );
}
