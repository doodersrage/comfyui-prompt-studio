'use client';

import type { ComfyGalleryFilter } from '@/lib/comfyui-gallery';
import type { GalleryStats } from '@/lib/gallery-stats';
import { GALLERY_ENTRY_LIMIT } from '@/lib/gallery-stats';

type GalleryStatsBarProps = {
  stats: GalleryStats;
  filter: ComfyGalleryFilter;
  onQuickFilter: (patch: Partial<ComfyGalleryFilter>) => void;
  onRefreshPending?: () => void;
  activeJobs: number;
  heldMaxJobs?: number;
  activeProjectId?: string | null;
  projectFilterActive?: boolean;
  onProjectFilter?: (projectId: string) => void;
};

function StatChip(props: {
  label: string;
  value: number | string;
  active?: boolean;
  emphasis?: 'default' | 'muted' | 'warning';
  onClick?: () => void;
  testId?: string;
}) {
  const emphasisClass =
    props.emphasis === 'warning'
      ? 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)] rounded-full backdrop-blur-xs'
      : props.emphasis === 'muted'
        ? 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] rounded-lg'
        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] rounded-lg';

  const activeClass = props.active
    ? 'ring-1 ring-[var(--accent-ring)] border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] hover:bg-[var(--bg-hover)]'
    : '';

  const className = `inline-flex min-w-0 items-baseline gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] backdrop-blur-xs ${emphasisClass} ${activeClass} ${
    props.onClick
      ? 'cursor-pointer hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]'
      : ''
  }`;

  const content = (
    <>
      <span className="type-caption shrink-0 text-[var(--text-muted)]">{props.label}</span>
      <span className="type-heading tabular-nums text-[var(--text-primary)]">{props.value}</span>
    </>
  );

  if (props.onClick) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        data-testid={props.testId}
        className={className}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export default function GalleryStatsBar({
  stats,
  filter,
  onQuickFilter,
  onRefreshPending,
  activeJobs,
  heldMaxJobs = 0,
  activeProjectId,
  projectFilterActive = false,
  onProjectFilter,
}: GalleryStatsBarProps) {
  const nearCapacity = stats.total >= GALLERY_ENTRY_LIMIT - 5;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatChip
          label="Total"
          value={stats.total}
          emphasis="default"
          onClick={() => onQuickFilter({ status: 'all' })}
        />
        {heldMaxJobs > 0 ? (
          <div
            key="held-max"
            className={`inline-flex min-w-0 items-baseline gap-2 rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60 px-2.5 py-1.5 backdrop-blur-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-slate-400`}
          >
            <span className="type-caption shrink-0 opacity-80">Held Max</span>
            <span className="type-heading tabular-nums">{heldMaxJobs}</span>
          </div>
        ) : null}
        <StatChip
          label="Done"
          value={stats.completed}
          active={filter.status === 'completed'}
          onClick={() =>
            onQuickFilter({
              status: filter.status === 'completed' ? 'all' : 'completed',
            })
          }
        />
        <StatChip
          label="Queue"
          value={stats.pending + stats.running}
          emphasis={activeJobs > 0 ? 'warning' : 'default'}
          active={filter.status === 'pending' || filter.status === 'running'}
          onClick={() => {
            if (activeJobs > 0 && onRefreshPending) {
              onRefreshPending();
            }
            onQuickFilter({
              status:
                filter.status === 'pending' || filter.status === 'running' ? 'all' : 'pending',
            });
          }}
        />
        <StatChip
          label="Favorites"
          value={stats.favorites}
          active={Boolean(filter.favoritesOnly)}
          testId="gallery-stats-favorites"
          onClick={() =>
            onQuickFilter({
              favoritesOnly: filter.favoritesOnly ? undefined : true,
            })
          }
        />
        <StatChip
          label="Unreviewed"
          value={stats.unreviewed}
          active={Boolean(filter.unreviewedOnly)}
          testId="gallery-stats-unreviewed"
          onClick={() =>
            onQuickFilter({
              unreviewedOnly: filter.unreviewedOnly ? undefined : true,
              reviewMode: filter.unreviewedOnly ? undefined : true,
            })
          }
        />
        <StatChip
          label="Review"
          value={stats.unreviewed > 0 ? stats.unreviewed : '—'}
          active={Boolean(filter.reviewMode) && !filter.unreviewedOnly}
          testId="gallery-stats-review"
          onClick={() =>
            onQuickFilter({
              reviewMode: filter.reviewMode && !filter.unreviewedOnly ? undefined : true,
              unreviewedOnly: undefined,
            })
          }
        />
        {activeProjectId && onProjectFilter ? (
          <StatChip
            label="Project"
            value="Active"
            active={projectFilterActive}
            testId="gallery-stats-active-project"
            onClick={() => onProjectFilter(projectFilterActive ? '' : 'active')}
          />
        ) : null}
        <StatChip
          label="Avg"
          value={stats.avgRating != null ? `${stats.avgRating}★` : '—'}
          emphasis="muted"
          active={!!stats.avgRating}
        />
        {stats.error > 0 ? (
          <StatChip
            label="Failed"
            value={stats.error}
            emphasis="warning"
            active={filter.status === 'error'}
            onClick={() =>
              onQuickFilter({
                status: filter.status === 'error' ? 'all' : 'error',
              })
            }
          />
        ) : null}
      </div>

      {nearCapacity ? (
        <div
          className={`rounded-xl border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] backdrop-blur-xs px-3.5 py-2 type-caption text-[var(--tint-warning-text)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)]`}
        >
          <p className="text-left">
            Gallery stores up to {GALLERY_ENTRY_LIMIT} entries in IndexedDB — oldest outputs drop
            silently when full ({stats.total}/{GALLERY_ENTRY_LIMIT}). Export favorites or clear
            completed jobs to keep room.
          </p>
        </div>
      ) : null}
    </div>
  );
}
