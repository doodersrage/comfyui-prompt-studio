'use client';

import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { isGalleryCapKeeper } from '@/lib/gallery-cap';

type GalleryCapCleanupWizardProps = {
  evicted: ComfyGalleryEntry[];
  max: number;
  total: number;
  onShowAtRisk: () => void;
  onExportKeepers: () => void;
  onDeleteEvicted: () => void;
  onFavoriteEvicted: () => void;
  onClose: () => void;
};

export default function GalleryCapCleanupWizard({
  evicted,
  max,
  total,
  onShowAtRisk,
  onExportKeepers,
  onDeleteEvicted,
  onFavoriteEvicted,
  onClose,
}: GalleryCapCleanupWizardProps) {
  return (
    <div
      data-testid="gallery-cap-wizard"
      className="space-y-3 rounded-2xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--tint-warning-text)]">
            Cap cleanup · {evicted.length} at risk of eviction
          </p>
          <p className="type-caption text-[var(--text-secondary)]">
            Local store keeps {max.toLocaleString()} ({total.toLocaleString()} now). Unrated
            non-favorites drop first. Favorites and 4–5★ stay.
          </p>
        </div>
        <button type="button" className="ui-btn-ghost ui-btn-sm text-xs" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-[var(--text-secondary)]">
        {evicted.slice(0, 24).map(entry => (
          <li key={entry.id} className="truncate">
            {new Date(entry.completedAt ?? entry.queuedAt).toLocaleDateString()} ·{' '}
            {entry.model ?? entry.tool ?? 'job'} · {entry.prompt.slice(0, 64)}
            {isGalleryCapKeeper(entry) ? ' · keeper' : ''}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ui-btn-secondary ui-btn-sm text-xs" onClick={onShowAtRisk}>
          Show at-risk
        </button>
        <button type="button" className="ui-btn-ghost ui-btn-sm text-xs" onClick={onExportKeepers}>
          Export keepers
        </button>
        <button
          type="button"
          className="ui-btn-ghost ui-btn-sm text-xs"
          onClick={onFavoriteEvicted}
        >
          Favorite these
        </button>
        <button
          type="button"
          className="ui-btn-ghost ui-btn-sm text-xs text-[var(--tint-danger-text)]"
          onClick={onDeleteEvicted}
        >
          Delete listed
        </button>
      </div>
    </div>
  );
}
