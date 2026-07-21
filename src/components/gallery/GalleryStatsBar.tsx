"use client";

import Link from "next/link";
import type { ComfyGalleryFilter } from "@/lib/comfyui-gallery";
import type { GalleryStats } from "@/lib/gallery-stats";
import { GALLERY_ENTRY_LIMIT } from "@/lib/gallery-stats";

type GalleryStatsBarProps = {
  stats: GalleryStats;
  filter: ComfyGalleryFilter;
  onQuickFilter: (patch: Partial<ComfyGalleryFilter>) => void;
  onRefreshPending?: () => void;
  activeJobs: number;
  heldMaxJobs?: number;
};

function StatChip(props: {
  label: string;
  value: number | string;
  active?: boolean;
  emphasis?: "default" | "muted" | "warning";
  onClick?: () => void;
}) {
  const emphasisClass =
    props.emphasis === "warning"
      ? "border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]"
      : props.emphasis === "muted"
        ? "border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
        : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]";

  const activeClass = props.active
    ? "ring-1 ring-[var(--accent-ring)] border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]"
    : "";

  const className = `inline-flex min-w-0 items-baseline gap-2 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${emphasisClass} ${activeClass} ${
    props.onClick
      ? "cursor-pointer hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]"
      : ""
  }`;

  const content = (
    <>
      <span className="type-caption shrink-0 text-[var(--text-muted)]">{props.label}</span>
      <span className="type-heading tabular-nums text-[var(--text-primary)]">{props.value}</span>
    </>
  );

  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className={className}>
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
}: GalleryStatsBarProps) {
  const nearCapacity = stats.total >= GALLERY_ENTRY_LIMIT - 5;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatChip label="Total" value={stats.total} />
        {heldMaxJobs > 0 ? (
          <Link
            href="/queue"
            className="inline-flex min-w-0 items-baseline gap-2 rounded-[var(--radius-md)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-1.5 text-left text-[var(--tint-warning-text)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            <span className="type-caption shrink-0 opacity-80">Held Max</span>
            <span className="type-heading tabular-nums">{heldMaxJobs}</span>
          </Link>
        ) : null}
        <StatChip
          label="Done"
          value={stats.completed}
          active={filter.status === "completed"}
          onClick={() =>
            onQuickFilter({
              status: filter.status === "completed" ? "all" : "completed",
            })
          }
        />
        <StatChip
          label="Queue"
          value={stats.pending + stats.running}
          emphasis={activeJobs > 0 ? "warning" : "default"}
          active={filter.status === "pending" || filter.status === "running"}
          onClick={() => {
            if (activeJobs > 0 && onRefreshPending) {
              onRefreshPending();
            }
            onQuickFilter({
              status:
                filter.status === "pending" || filter.status === "running"
                  ? "all"
                  : "pending",
            });
          }}
        />
        <StatChip
          label="Favorites"
          value={stats.favorites}
          active={Boolean(filter.favoritesOnly)}
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
          onClick={() =>
            onQuickFilter({
              unreviewedOnly: filter.unreviewedOnly ? undefined : true,
              reviewMode: filter.unreviewedOnly ? undefined : true,
            })
          }
        />
        <StatChip
          label="Avg"
          value={stats.avgRating != null ? `${stats.avgRating}★` : "—"}
          emphasis="muted"
        />
        {stats.error > 0 ? (
          <StatChip
            label="Failed"
            value={stats.error}
            emphasis="warning"
            active={filter.status === "error"}
            onClick={() =>
              onQuickFilter({
                status: filter.status === "error" ? "all" : "error",
              })
            }
          />
        ) : null}
      </div>

      {nearCapacity ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2 type-caption text-[var(--tint-warning-text)]">
          Gallery stores up to {GALLERY_ENTRY_LIMIT} entries in IndexedDB — oldest outputs
          drop silently when full ({stats.total}/{GALLERY_ENTRY_LIMIT}). Export favorites or
          clear completed jobs to keep room.
        </p>
      ) : null}
    </div>
  );
}
