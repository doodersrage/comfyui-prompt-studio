"use client";

import type { ComfyGalleryFilter } from "@/lib/comfyui-gallery";
import type { GalleryStats } from "@/lib/gallery-stats";
import { GALLERY_ENTRY_LIMIT } from "@/lib/gallery-stats";

type GalleryStatsBarProps = {
  stats: GalleryStats;
  filter: ComfyGalleryFilter;
  onQuickFilter: (patch: Partial<ComfyGalleryFilter>) => void;
  onRefreshPending?: () => void;
  activeJobs: number;
};

function StatChip(props: {
  label: string;
  value: number | string;
  active?: boolean;
  tone?: "default" | "emerald" | "amber" | "rose" | "violet";
  onClick?: () => void;
}) {
  const toneClass =
    props.tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : props.tone === "amber"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
        : props.tone === "rose"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
          : props.tone === "violet"
            ? "border-violet-500/30 bg-violet-500/10 text-violet-100"
            : "border-zinc-700/80 bg-zinc-900/50 text-zinc-300";

  const activeClass = props.active
    ? "ring-1 ring-violet-400/40 border-violet-500/40"
    : "";

  const className = `rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${toneClass} ${activeClass} ${
    props.onClick ? "cursor-pointer hover:border-zinc-500/80 hover:bg-zinc-900/70" : ""
  }`;

  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} className={className}>
        <p className="type-caption text-zinc-500">{props.label}</p>
        <p className="type-heading tabular-nums">{props.value}</p>
      </button>
    );
  }

  return (
    <div className={className}>
      <p className="type-caption text-zinc-500">{props.label}</p>
      <p className="type-heading tabular-nums">{props.value}</p>
    </div>
  );
}

export default function GalleryStatsBar({
  stats,
  filter,
  onQuickFilter,
  onRefreshPending,
  activeJobs,
}: GalleryStatsBarProps) {
  const nearCapacity = stats.total >= GALLERY_ENTRY_LIMIT - 5;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatChip label="Total" value={stats.total} />
        <StatChip
          label="Completed"
          value={stats.completed}
          tone="emerald"
          active={filter.status === "completed"}
          onClick={() =>
            onQuickFilter({
              status: filter.status === "completed" ? "all" : "completed",
            })
          }
        />
        <StatChip
          label="In queue"
          value={stats.pending + stats.running}
          tone={activeJobs > 0 ? "amber" : "default"}
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
          tone="violet"
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
          label="Avg rating"
          value={stats.avgRating != null ? `${stats.avgRating}★` : "—"}
        />
      </div>

      {nearCapacity ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          Gallery stores up to {GALLERY_ENTRY_LIMIT} entries in IndexedDB — oldest outputs
          drop silently when full ({stats.total}/{GALLERY_ENTRY_LIMIT}). Export favorites or
          clear completed jobs to keep room.
        </p>
      ) : null}

      {stats.error > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatChip
            label="Failed jobs"
            value={stats.error}
            tone="rose"
            active={filter.status === "error"}
            onClick={() =>
              onQuickFilter({
                status: filter.status === "error" ? "all" : "error",
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}
