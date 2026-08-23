'use client';

import Link from 'next/link';
import { useSystemTrayState } from '@/hooks/useSystemTrayState';

/** Compact chip showing live gallery/queue job count — links to Queue. */
export default function ActiveJobsChip({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { totalActiveCount, activeGalleryJobs, queueHealth } = useSystemTrayState({
    pollAssets: false,
  });
  const galleryActive = activeGalleryJobs.length;
  const queueDepth = (queueHealth?.queuePending ?? 0) + (queueHealth?.queueRunning ?? 0);
  const count = Math.max(totalActiveCount, galleryActive, queueDepth);

  if (count <= 0) {
    return null;
  }

  return (
    <Link
      href="/queue"
      data-testid="active-jobs-chip"
      title={`${count} active job${count === 1 ? '' : 's'} — open Queue`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--tint-warning-text)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${className}`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--tint-warning-text)]"
        aria-hidden
      />
      {compact ? count : `${count} active`}
    </Link>
  );
}
