"use client";

import type { PromptProject } from "@/lib/prompt-projects";
import type {
  ComfyGalleryJobStatus,
  ComfyGallerySort,
  GalleryPageSize,
} from "@/lib/comfyui-gallery";
import {
  GALLERY_PAGE_SIZE_ALL,
  GALLERY_PAGE_SIZE_OPTIONS,
} from "@/lib/comfyui-gallery";
import type { ComfyGalleryFilter } from "@/lib/comfyui-gallery";

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
  totalFiltered: number;
  totalEntries: number;
  currentPage: number;
  totalPages: number;
  showPagination: boolean;
  onStartSlideshow?: () => void;
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
  totalFiltered,
  totalEntries,
  currentPage,
  totalPages,
  showPagination,
  onStartSlideshow,
  slideshowAvailable,
}: GalleryFiltersBarProps) {
  const activeToggleCount = [
    filter.favoritesOnly,
    filter.semanticSearch,
    filter.reviewMode,
    filter.unreviewedOnly,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[min(100%,20rem)] flex-1 space-y-1.5">
          <span className="type-caption text-zinc-500">Search</span>
          <input
            type="search"
            value={filter.query ?? ""}
            onChange={(event) =>
              setFilter({
                ...filter,
                query: event.target.value.trim() ? event.target.value : undefined,
              })
            }
            placeholder="Prompt, tool, model, prompt id…"
            className="ui-input block w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </label>

        <p className="shrink-0 text-xs text-zinc-500">
          {totalFiltered} of {totalEntries}
          {showPagination ? ` · page ${currentPage}/${totalPages}` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label className="space-y-1.5">
          <span className="type-caption text-zinc-500">Status</span>
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

        {tools.length > 0 ? (
          <label className="space-y-1.5">
            <span className="type-caption text-zinc-500">Tool</span>
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
          <span className="type-caption text-zinc-500">Project</span>
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
          <>
            <label className="space-y-1.5">
              <span className="type-caption text-zinc-500">Sort</span>
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

            <label className="space-y-1.5">
              <span className="type-caption text-zinc-500">Per page</span>
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
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        {slideshowAvailable && onStartSlideshow ? (
          <button type="button" onClick={onStartSlideshow} className="ui-btn-ghost !min-h-9 px-3 text-xs">
            Slideshow
          </button>
        ) : null}
        {activeToggleCount > 0 ? (
          <button
            type="button"
            className="ui-btn-ghost !min-h-9 px-3 text-xs text-zinc-500"
            onClick={() =>
              setFilter({
                ...filter,
                favoritesOnly: undefined,
                semanticSearch: undefined,
                reviewMode: undefined,
                unreviewedOnly: undefined,
              })
            }
          >
            Clear toggles
          </button>
        ) : null}
      </div>

      {filter.reviewMode ? (
        <p className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-[11px] text-violet-200/80">
          Review shortcuts: <kbd className="rounded bg-zinc-900 px-1">1–5</kbd> rate ·{" "}
          <kbd className="rounded bg-zinc-900 px-1">F</kbd> favorite ·{" "}
          <kbd className="rounded bg-zinc-900 px-1">N</kbd>/<kbd className="rounded bg-zinc-900 px-1">P</kbd> navigate
        </p>
      ) : null}
    </div>
  );
}
