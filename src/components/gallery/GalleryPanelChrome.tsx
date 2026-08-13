'use client';

import { ButtonLink } from '@/components/ui/Button';
import {
  galleryHandoffHomePath,
  galleryPickPurposeLabel,
  type GalleryHandoffPayload,
} from '@/lib/gallery-handoff';
import type { GalleryCapWarningLevel } from '@/lib/gallery-cap';

export function GalleryPanelHeader({
  leanGallery,
  activeJobs,
  entriesLength,
  compact,
  limit,
  onRefreshPending,
  onClearAll,
}: {
  leanGallery: boolean;
  activeJobs: number;
  entriesLength: number;
  compact: boolean;
  limit?: number;
  onRefreshPending: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="type-heading text-[var(--text-primary)]">Gallery</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {leanGallery
            ? 'Browse ComfyUI outputs and rate results.'
            : 'Browse ComfyUI outputs, rate results, compare variants, and queue follow-up experiments.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRefreshPending} className="ui-btn-ghost ui-btn-sm text-xs">
          Refresh jobs
        </button>
        {activeJobs > 0 ? (
          <span className="self-center rounded-full border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-1 text-[11px] text-[var(--tint-warning-text)]">
            {activeJobs} active
          </span>
        ) : null}
        {entriesLength > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Clear all gallery entries?')) {
                onClearAll();
              }
            }}
            className="ui-btn-ghost ui-btn-sm text-xs text-[var(--text-muted)] hover:text-[var(--tint-danger-text)]"
          >
            Clear all
          </button>
        ) : null}
        {!compact && limit && entriesLength > limit ? (
          <ButtonLink href="/gallery" size="sm">
            View all
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

export function GalleryPickDock({ pickFor }: { pickFor: GalleryHandoffPayload['target'] }) {
  return (
    <div className="ui-gallery-dock sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Choosing {galleryPickPurposeLabel(pickFor)}
        </p>
        <p className="type-caption text-[var(--text-secondary)]">
          Click a completed still image to send it back. Video clips are skipped.
        </p>
      </div>
      <ButtonLink href={galleryHandoffHomePath(pickFor)} variant="ghost" size="sm">
        Cancel
      </ButtonLink>
    </div>
  );
}

export function GalleryCapWarningBanner({
  level,
  message,
  onShowAtRisk,
  onExportKeepers,
}: {
  level: GalleryCapWarningLevel;
  message: string;
  onShowAtRisk: () => void;
  onExportKeepers: () => void;
}) {
  return (
    <div
      data-testid="gallery-cap-warning"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
        level === 'urgent'
          ? 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]'
          : 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
      }`}
    >
      <p className="min-w-0 flex-1">{message}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onShowAtRisk}
          className="rounded-xl border border-current/30 bg-black/10 px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
        >
          Show at-risk
        </button>
        <button
          type="button"
          onClick={onExportKeepers}
          className="rounded-xl border border-current/30 bg-black/10 px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
        >
          Export keepers
        </button>
      </div>
    </div>
  );
}
