'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { ComfyGalleryEntry, GalleryLayoutMode } from '@/lib/comfyui-gallery';
import { formatExperimentParamDiffChips } from '@/lib/gallery-param-diff';
import { Button } from '@/components/ui/Button';

type GalleryExperimentBlockProps = {
  groupId: string;
  label: string;
  entries: ComfyGalleryEntry[];
  winnerEntryId?: string;
  collapsed: boolean;
  onToggle: () => void;
  onCrown?: (entryId: string) => void;
  onCompare?: () => void;
  onRequeueSeeds?: () => void;
  onWinnerUpscale?: (entry: ComfyGalleryEntry) => void;
  onWinnerRefine?: (entry: ComfyGalleryEntry) => void;
  onWinnerContinue?: (entry: ComfyGalleryEntry) => void;
  layout: GalleryLayoutMode;
  columns?: number;
  gridClassName: string;
  renderCard: (entry: ComfyGalleryEntry) => ReactNode;
};

export default function GalleryExperimentBlock({
  label,
  entries,
  winnerEntryId,
  collapsed,
  onToggle,
  onCrown,
  onCompare,
  onRequeueSeeds,
  onWinnerUpscale,
  onWinnerRefine,
  onWinnerContinue,
  layout,
  columns,
  gridClassName,
  renderCard,
}: GalleryExperimentBlockProps) {
  const gridStyle: CSSProperties | undefined =
    layout !== 'list' && columns
      ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
      : undefined;
  const collapsedPreview = entries.find(entry => entry.id === winnerEntryId) ?? entries[0];
  const shown = collapsed ? (collapsedPreview ? [collapsedPreview] : []) : entries;
  const paramDiffChips = useMemo(() => formatExperimentParamDiffChips(entries), [entries]);
  const winner = winnerEntryId ? (entries.find(entry => entry.id === winnerEntryId) ?? null) : null;
  const showWinnerActions = Boolean(
    winner && (onWinnerUpscale || onWinnerRefine || onWinnerContinue)
  );

  return (
    <div
      className={
        layout === 'list'
          ? 'space-y-3 rounded-2xl border border-[var(--tint-info-border)] bg-gradient-to-br from-[var(--tint-info-bg)] via-[var(--bg-elevated)]/40 to-transparent p-3'
          : 'col-span-full space-y-3 rounded-2xl border border-[var(--tint-info-border)] bg-gradient-to-br from-[var(--tint-info-bg)] via-[var(--bg-elevated)]/40 to-transparent p-3'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--tint-info-text)]">
            Experiment · {entries.length} variants
            {winnerEntryId ? ' · crowned' : ''}
          </p>
          <p className="truncate text-xs text-[var(--text-secondary)]" title={label}>
            {label}
          </p>
          {paramDiffChips.length > 0 ? (
            <div data-testid="gallery-experiment-param-diff" className="flex flex-wrap gap-1.5">
              {paramDiffChips.map(chip => (
                <span
                  key={chip}
                  className="rounded-lg border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2 py-0.5 text-[10px] text-[var(--tint-info-text)]"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          {showWinnerActions && winner ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {onWinnerUpscale ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onWinnerUpscale(winner)}
                >
                  Upscale winner
                </Button>
              ) : null}
              {onWinnerRefine ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onWinnerRefine(winner)}
                >
                  Refine winner
                </Button>
              ) : null}
              {onWinnerContinue ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onWinnerContinue(winner)}
                >
                  Continue winner
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onCompare ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCompare}>
              Compare
            </Button>
          ) : null}
          {onRequeueSeeds ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRequeueSeeds}>
              Re-queue seeds
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--tint-info-text)] backdrop-blur-sm transition hover:border-[var(--tint-info-border)] hover:bg-[var(--tint-info-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>
      <div className={layout === 'list' ? 'space-y-3' : gridClassName} style={gridStyle}>
        {shown.map(entry => (
          <div key={entry.id} className="relative min-w-0">
            {renderCard(entry)}
            {onCrown ? (
              <button
                type="button"
                onClick={() => onCrown(entry.id)}
                className={`absolute left-2 top-2 z-20 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  winnerEntryId === entry.id
                    ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/70 text-[var(--text-secondary)] hover:border-[var(--tint-warning-border)] hover:text-[var(--tint-warning-text)]'
                }`}
                title={winnerEntryId === entry.id ? 'Crowned winner' : 'Crown as winner'}
              >
                {winnerEntryId === entry.id ? '★ Winner' : 'Crown'}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
