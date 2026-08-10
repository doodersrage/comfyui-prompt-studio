'use client';

import { Spinner } from '@/components/ui/Button';

type GalleryPanelSkeletonProps = {
  showFilters?: boolean;
  compact?: boolean;
};

export default function GalleryPanelSkeleton({
  showFilters = false,
  compact = false,
}: GalleryPanelSkeletonProps) {
  return (
    <section className="space-y-6" role="status" aria-label="Loading gallery">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Spinner size="sm" />
        Loading gallery entries…
      </div>

      {showFilters ? (
        <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/35 p-4">
          <div className="h-10 animate-pulse rounded-xl bg-[var(--bg-muted)]/80" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-xl bg-[var(--bg-muted)]/70" />
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={
          compact
            ? 'grid grid-cols-2 gap-4 sm:grid-cols-3'
            : 'grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3'
        }
      >
        {Array.from({ length: compact ? 6 : 9 }).map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50"
          >
            <div className="aspect-[4/5] animate-pulse bg-[var(--bg-muted)]/80" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--bg-muted)]/70" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--bg-muted)]/60" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
