"use client";

import { useEffect, useState } from "react";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import type { VisionBackfillProgress } from "@/lib/gallery-vision-backfill";
import { COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery";
import type { PromptProject } from "@/lib/prompt-projects";
import type {
  ComfyGalleryJobStatus,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from "@/lib/comfyui-gallery";
import {
  GALLERY_PAGE_SIZE_ALL,
  GALLERY_PAGE_SIZE_OPTIONS,
} from "@/lib/comfyui-gallery";
import type { ComfyGalleryFilter } from "@/lib/comfyui-gallery";
import {
  deleteGallerySavedView,
  loadGallerySavedViews,
  upsertGallerySavedView,
  type GallerySavedView,
} from "@/lib/gallery-saved-views";
import { CollapsibleSection } from "@/components/ui/ToolPageShell";

const GALLERY_SORT_OPTIONS: { value: ComfyGallerySort; label: string }[] = [
  { value: "queued-desc", label: "Newest" },
  { value: "queued-asc", label: "Oldest" },
  { value: "completed-desc", label: "Recently done" },
  { value: "tool-asc", label: "Tool A–Z" },
  { value: "favorites-first", label: "Favorites" },
];

type GalleryFiltersBarProps = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  tools: string[];
  projects: PromptProject[];
  projectFilterId: string;
  setProjectFilterId: (value: string) => void;
  sort: ComfyGallerySort;
  setSort: (value: ComfyGallerySort) => void;
  pageSize: GalleryPageSize;
  setPageSize: (value: GalleryPageSize) => void;
  paginationEnabled: boolean;
  embeddingSearchActive: boolean;
  embeddingSearchLoading?: boolean;
  similarSearchLoading?: boolean;
  embeddingSearchUnavailable?: boolean;
  layout: GalleryLayoutMode;
  setLayout: (value: GalleryLayoutMode) => void;
  totalFiltered: number;
  totalEntries: number;
  currentPage: number;
  totalPages: number;
  showPagination: boolean;
  onStartSlideshow?: () => void;
  onStartFullscreenSlideshow?: () => void;
  slideshowAvailable?: boolean;
};

function FilterChip(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      data-active={props.active ? "true" : "false"}
      className="ui-chip"
    >
      {props.label}
    </button>
  );
}

export default function GalleryFiltersBar({
  filter,
  setFilter,
  tools,
  projects,
  projectFilterId,
  setProjectFilterId,
  sort,
  setSort,
  pageSize,
  setPageSize,
  paginationEnabled,
  embeddingSearchActive,
  embeddingSearchLoading = false,
  similarSearchLoading = false,
  embeddingSearchUnavailable = false,
  layout,
  setLayout,
  totalFiltered,
  totalEntries,
  currentPage,
  totalPages,
  showPagination,
  onStartSlideshow,
  onStartFullscreenSlideshow,
  slideshowAvailable,
}: GalleryFiltersBarProps) {
  const activeToggleCount = [
    filter.favoritesOnly,
    filter.semanticSearch,
    filter.reviewMode,
    filter.unreviewedOnly,
    filter.reviewAutoAdvance,
    filter.visionTagsOnly,
  ].filter(Boolean).length;

  const [savedViews, setSavedViews] = useState<GallerySavedView[]>(() => loadGallerySavedViews());
  const [viewNameDraft, setViewNameDraft] = useState("");
  const [backfillProgress, setBackfillProgress] = useState<VisionBackfillProgress | null>(
    null,
  );
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [queryDraft, setQueryDraft] = useState(filter.query ?? "");

  useEffect(() => {
    scheduleAfterCommit(() => {
      setQueryDraft(filter.query ?? "");
    });
  }, [filter.query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = queryDraft.trim();
      const nextQuery = trimmed || undefined;
      setFilter((previous) => {
        if (previous.query === nextQuery) {
          return previous;
        }
        return { ...previous, query: nextQuery };
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [queryDraft, setFilter]);

  async function runVisionBackfill() {
    const {
      backfillVisionTags,
      listUntaggedCompletedEntries,
    } = await import("@/lib/gallery-vision-backfill");
    const entries = listUntaggedCompletedEntries(100);
    if (entries.length === 0) {
      return;
    }
    setBackfillLoading(true);
    setBackfillProgress({ total: entries.length, completed: 0, tagged: 0, skipped: 0, failed: 0 });
    try {
      await backfillVisionTags(entries, {
        concurrency: 2,
        onProgress: (progress) => setBackfillProgress({ ...progress }),
      });
      window.dispatchEvent(new Event(COMFYUI_GALLERY_UPDATED_EVENT));
    } finally {
      setBackfillLoading(false);
    }
  }

  function saveCurrentView() {
    const name = viewNameDraft.trim() || `View ${savedViews.length + 1}`;
    upsertGallerySavedView({
      id: crypto.randomUUID(),
      name,
      filter,
      sort,
      projectFilterId,
    });
    setSavedViews(loadGallerySavedViews());
    setViewNameDraft("");
  }

  function applySavedView(view: GallerySavedView) {
    setFilter(view.filter);
    if (view.sort) {
      setSort(view.sort);
    }
    if (view.projectFilterId !== undefined) {
      setProjectFilterId(view.projectFilterId);
    }
  }

  return (
    <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)]">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[min(100%,20rem)] flex-1 space-y-1.5">
          <span className="type-caption text-[var(--text-muted)]">Search</span>
          <input
            type="search"
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="Prompt, tool, model, prompt id, vision tags…"
            className="ui-input block w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </label>

        <label className="min-w-[8rem] space-y-1.5">
          <span className="type-caption text-[var(--text-muted)]">Status</span>
          <select
            value={filter.status ?? "all"}
            onChange={(event) =>
              setFilter({
                ...filter,
                status: event.target.value as ComfyGalleryJobStatus | "all",
              })
            }
            className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
          </select>
        </label>

        {paginationEnabled ? (
          <label className="min-w-[8rem] space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ComfyGallerySort)}
              className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
            >
              {GALLERY_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {(["grid", "dense", "list"] as const).map((mode) => (
            <FilterChip
              key={mode}
              active={layout === mode}
              label={mode === "grid" ? "Grid" : mode === "dense" ? "Dense" : "List"}
              onClick={() => setLayout(mode)}
            />
          ))}
        </div>

        <p className="shrink-0 type-caption text-[var(--text-muted)]">
          {totalFiltered} of {totalEntries}
          {showPagination ? ` · page ${currentPage}/${totalPages}` : ""}
          {embeddingSearchLoading ? " · searching…" : null}
          {embeddingSearchUnavailable ? " · semantic unavailable" : null}
          {similarSearchLoading ? " · ranking similar…" : null}
        </p>
      </div>

      <CollapsibleSection
        title="Filters"
        summary="Tool, project, saved views, review toggles, and slideshow."
        defaultOpen={false}
        persistKey="gallery-advanced-filters"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.length > 0 ? (
            <label className="space-y-1.5">
              <span className="type-caption text-[var(--text-muted)]">Tool</span>
              <select
                value={filter.tool ?? ""}
                onChange={(event) =>
                  setFilter({
                    ...filter,
                    tool: event.target.value || undefined,
                  })
                }
                className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="">All tools</option>
                {tools.map((tool) => (
                  <option key={tool} value={tool}>
                    {tool}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Project</span>
            <select
              value={projectFilterId}
              onChange={(event) => setProjectFilterId(event.target.value)}
              className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
            >
              <option value="">All projects</option>
              <option value="active">Active project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          {paginationEnabled ? (
            <label className="space-y-1.5">
              <span className="type-caption text-[var(--text-muted)]">Per page</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(event.target.value as GalleryPageSize)}
                className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
              >
                {GALLERY_PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
                <option value={GALLERY_PAGE_SIZE_ALL}>All</option>
              </select>
            </label>
          ) : null}
        </div>

        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3">
          <p className="type-caption text-[var(--text-muted)]">Saved views</p>
          <div className="flex flex-wrap gap-2">
            {savedViews.map((view) => (
              <span key={view.id} className="inline-flex items-center gap-1">
                <button type="button" onClick={() => applySavedView(view)} className="ui-chip">
                  {view.name}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteGallerySavedView(view.id);
                    setSavedViews(loadGallerySavedViews());
                  }}
                  className="rounded px-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--tint-danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  aria-label={`Delete saved view ${view.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={viewNameDraft}
              onChange={(event) => setViewNameDraft(event.target.value)}
              placeholder="Name this filter set…"
              className="ui-input min-w-[12rem] flex-1 px-3 py-1.5 text-sm"
            />
            <button type="button" onClick={saveCurrentView} className="ui-btn-ghost ui-btn-sm text-xs">
              Save current view
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={!filter.mediaKind || filter.mediaKind === "all"}
            label="All media"
            onClick={() => setFilter({ ...filter, mediaKind: "all" })}
          />
          <FilterChip
            active={filter.mediaKind === "image"}
            label="Stills"
            onClick={() => setFilter({ ...filter, mediaKind: "image" })}
          />
          <FilterChip
            active={filter.mediaKind === "video"}
            label="Videos"
            onClick={() => setFilter({ ...filter, mediaKind: "video" })}
          />
          <FilterChip
            active={Boolean(filter.favoritesOnly)}
            label="Favorites"
            onClick={() =>
              setFilter({ ...filter, favoritesOnly: filter.favoritesOnly ? undefined : true })
            }
          />
          <FilterChip
            active={Boolean(filter.semanticSearch)}
            label={embeddingSearchActive ? "Semantic ✓" : "Semantic"}
            onClick={() =>
              setFilter({
                ...filter,
                semanticSearch: filter.semanticSearch ? undefined : true,
              })
            }
          />
          <FilterChip
            active={Boolean(filter.reviewMode)}
            label="Review mode"
            onClick={() =>
              setFilter({ ...filter, reviewMode: filter.reviewMode ? undefined : true })
            }
          />
          <FilterChip
            active={Boolean(filter.unreviewedOnly)}
            label="Unreviewed"
            onClick={() =>
              setFilter({
                ...filter,
                unreviewedOnly: filter.unreviewedOnly ? undefined : true,
              })
            }
          />
          <FilterChip
            active={Boolean(filter.visionTagsOnly)}
            label="Vision tags"
            onClick={() =>
              setFilter({ ...filter, visionTagsOnly: filter.visionTagsOnly ? undefined : true })
            }
          />
          <button
            type="button"
            disabled={backfillLoading}
            onClick={() => void runVisionBackfill()}
            className="ui-btn-ghost ui-btn-sm text-xs disabled:opacity-50"
          >
            {backfillLoading
              ? backfillProgress
                ? `Tagging ${backfillProgress.completed}/${backfillProgress.total}`
                : "Tagging…"
              : "Tag untagged"}
          </button>
          {filter.semanticSearch && embeddingSearchUnavailable ? (
            <span className="rounded-[var(--radius-full)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-1 text-[10px] text-[var(--tint-warning-text)]">
              Semantic search needs LLM embeddings — using text match
            </span>
          ) : null}
          {filter.reviewMode ? (
            <FilterChip
              active={Boolean(filter.reviewAutoAdvance)}
              label="Auto-advance"
              onClick={() =>
                setFilter({
                  ...filter,
                  reviewAutoAdvance: filter.reviewAutoAdvance ? undefined : true,
                })
              }
            />
          ) : null}
          {slideshowAvailable && onStartSlideshow ? (
            <button type="button" onClick={onStartSlideshow} className="ui-btn-ghost ui-btn-sm text-xs">
              Slideshow
            </button>
          ) : null}
          {slideshowAvailable && onStartFullscreenSlideshow ? (
            <button
              type="button"
              onClick={onStartFullscreenSlideshow}
              className="ui-btn-ghost ui-btn-sm text-xs"
            >
              Fullscreen slideshow
            </button>
          ) : null}
          {activeToggleCount > 0 ? (
            <button
              type="button"
              className="ui-btn-ghost ui-btn-sm text-xs text-[var(--text-muted)]"
              onClick={() =>
                setFilter({
                  ...filter,
                  favoritesOnly: undefined,
                  semanticSearch: undefined,
                  reviewMode: undefined,
                  unreviewedOnly: undefined,
                  reviewAutoAdvance: undefined,
                  visionTagsOnly: undefined,
                })
              }
            >
              Clear toggles
            </button>
          ) : null}
        </div>

        {filter.reviewMode ? (
          <p className="rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-[11px] text-[var(--accent-text)]">
            Review shortcuts: <kbd className="rounded bg-[var(--bg-muted)] px-1">1–5</kbd> rate ·{" "}
            <kbd className="rounded bg-[var(--bg-muted)] px-1">F</kbd> favorite ·{" "}
            <kbd className="rounded bg-[var(--bg-muted)] px-1">N</kbd>/
            <kbd className="rounded bg-[var(--bg-muted)] px-1">P</kbd> navigate
            {filter.reviewAutoAdvance ? " · auto-advance on" : ""}
          </p>
        ) : null}
      </CollapsibleSection>
    </div>
  );
}
