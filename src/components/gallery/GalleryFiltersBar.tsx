'use client';

import { useEffect, useMemo, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { VisionBackfillProgress } from '@/lib/gallery-vision-backfill';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery';
import type { PromptProject } from '@/lib/prompt-projects';
import type {
  ComfyGalleryJobStatus,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from '@/lib/comfyui-gallery';
import { GALLERY_PAGE_SIZE_ALL, GALLERY_PAGE_SIZE_OPTIONS } from '@/lib/comfyui-gallery';
import type { ComfyGalleryFilter } from '@/lib/comfyui-gallery';
import { GALLERY_UNGROUPED_FILTER } from '@/lib/gallery-custom-groups';
import {
  deleteGallerySavedView,
  loadGallerySavedViews,
  upsertGallerySavedView,
  type GallerySavedView,
} from '@/lib/gallery-saved-views';
import type { GalleryDensity } from '@/lib/gallery-density';
import { CollapsibleSection } from '@/components/ui/ToolPageShell';

const GALLERY_SORT_OPTIONS: { value: ComfyGallerySort; label: string }[] = [
  { value: 'queued-desc', label: 'Newest' },
  { value: 'queued-asc', label: 'Oldest' },
  { value: 'completed-desc', label: 'Recently done' },
  { value: 'tool-asc', label: 'Tool A–Z' },
  { value: 'favorites-first', label: 'Favorites' },
  { value: 'rating-desc', label: 'Highest rated' },
  { value: 'eviction-risk-desc', label: 'Eviction risk' },
];

type GalleryFiltersBarProps = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  tools: string[];
  models: string[];
  userTags?: string[];
  customGroups?: string[];
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
  density: GalleryDensity;
  setDensity: (value: GalleryDensity) => void;
  totalFiltered: number;
  totalEntries: number;
  currentPage: number;
  totalPages: number;
  showPagination: boolean;
  onStartSlideshow?: () => void;
  onStartFullscreenSlideshow?: () => void;
  slideshowAvailable?: boolean;
  /** Simple workspace — search, status, review, and basic sort (advanced menus hidden). */
  lean?: boolean;
};

function FilterChip(props: {
  active: boolean;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  const isActive = props.active;

  return (
    <button
      type="button"
      onClick={props.onClick}
      data-testid={props.testId}
      data-active={isActive ? 'true' : 'false'}
      className={`${
        isActive
          ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] hover:brightness-110'
          : 'border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/80 text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]'
      } rounded-xl px-2.5 py-1 text-[11px] font-medium backdrop-blur-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]`}
    >
      {props.label}
    </button>
  );
}

export default function GalleryFiltersBar({
  filter,
  setFilter,
  tools,
  models,
  userTags = [],
  customGroups = [],
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
  density,
  setDensity,
  totalFiltered,
  totalEntries,
  currentPage,
  totalPages,
  showPagination,
  onStartSlideshow,
  onStartFullscreenSlideshow,
  slideshowAvailable,
  lean = false,
}: GalleryFiltersBarProps) {
  const [savedViews, setSavedViews] = useState<GallerySavedView[]>(() => loadGallerySavedViews());
  const [viewNameDraft, setViewNameDraft] = useState('');
  const [backfillProgress, setBackfillProgress] = useState<VisionBackfillProgress | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [queryDraft, setQueryDraft] = useState(filter.query ?? '');

  const activeToggleCount = [
    filter.favoritesOnly,
    filter.semanticSearch,
    filter.reviewMode,
    filter.unreviewedOnly,
    filter.reviewAutoAdvance,
    filter.visionTagsOnly,
    filter.atRiskOnly,
    filter.duplicatesOnly,
    filter.needsVisionReview,
    filter.userTag,
    filter.customGroup,
    filter.similarToEntryId,
    filter.model,
    filter.minRating,
    filter.tool,
  ].filter(Boolean).length;

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filter.query?.trim()) {
      chips.push({
        key: 'query',
        label: `Search: ${filter.query.trim()}`,
        clear: () => setFilter(previous => ({ ...previous, query: undefined })),
      });
    }
    if (filter.status && filter.status !== 'all') {
      chips.push({
        key: 'status',
        label: `Status: ${filter.status}`,
        clear: () => setFilter(previous => ({ ...previous, status: 'all' })),
      });
    }
    if (filter.tool) {
      chips.push({
        key: 'tool',
        label: `Tool: ${filter.tool}`,
        clear: () => setFilter(previous => ({ ...previous, tool: undefined })),
      });
    }
    if (filter.model) {
      chips.push({
        key: 'model',
        label: `Model: ${filter.model}`,
        clear: () => setFilter(previous => ({ ...previous, model: undefined })),
      });
    }
    if (filter.minRating) {
      chips.push({
        key: 'minRating',
        label: `≥${filter.minRating}★`,
        clear: () => setFilter(previous => ({ ...previous, minRating: undefined })),
      });
    }
    if (filter.favoritesOnly) {
      chips.push({
        key: 'fav',
        label: 'Favorites',
        clear: () => setFilter(previous => ({ ...previous, favoritesOnly: undefined })),
      });
    }
    if (filter.atRiskOnly) {
      chips.push({
        key: 'atRisk',
        label: 'At risk',
        clear: () => setFilter(previous => ({ ...previous, atRiskOnly: undefined })),
      });
    }
    if (filter.duplicatesOnly) {
      chips.push({
        key: 'duplicates',
        label: 'Duplicates',
        clear: () => setFilter(previous => ({ ...previous, duplicatesOnly: undefined })),
      });
    }
    if (filter.needsVisionReview) {
      chips.push({
        key: 'visionInbox',
        label: 'Vision inbox',
        clear: () => setFilter(previous => ({ ...previous, needsVisionReview: undefined })),
      });
    }
    if (filter.userTag) {
      chips.push({
        key: 'userTag',
        label: `#${filter.userTag}`,
        clear: () => setFilter(previous => ({ ...previous, userTag: undefined })),
      });
    }
    if (filter.customGroup) {
      chips.push({
        key: 'customGroup',
        label:
          filter.customGroup === GALLERY_UNGROUPED_FILTER
            ? 'Ungrouped'
            : `Group: ${filter.customGroup}`,
        clear: () => setFilter(previous => ({ ...previous, customGroup: undefined })),
      });
    }
    if (filter.similarToEntryId) {
      chips.push({
        key: 'similar',
        label: filter.similarMode === 'visual' ? 'Looks like this' : 'Similar',
        clear: () =>
          setFilter(previous => ({
            ...previous,
            similarToEntryId: undefined,
            similarMode: undefined,
          })),
      });
    }
    if (filter.derivedKind) {
      chips.push({
        key: 'derivedKind',
        label: `Derived: ${filter.derivedKind}`,
        clear: () => setFilter(previous => ({ ...previous, derivedKind: undefined })),
      });
    }
    if (filter.reviewMode) {
      chips.push({
        key: 'review',
        label: 'Review',
        clear: () =>
          setFilter(previous => ({
            ...previous,
            reviewMode: undefined,
            unreviewedOnly: undefined,
            reviewAutoAdvance: undefined,
          })),
      });
    } else if (filter.unreviewedOnly) {
      chips.push({
        key: 'unreviewed',
        label: 'Unreviewed',
        clear: () => setFilter(previous => ({ ...previous, unreviewedOnly: undefined })),
      });
    }
    if (filter.mediaKind && filter.mediaKind !== 'all') {
      chips.push({
        key: 'media',
        label:
          filter.mediaKind === 'image'
            ? 'Stills'
            : filter.mediaKind === 'video'
              ? 'Videos'
              : filter.mediaKind === 'audio'
                ? 'Audio'
                : '3D',
        clear: () => setFilter(previous => ({ ...previous, mediaKind: 'all' })),
      });
    }
    if (filter.visionTagsOnly) {
      chips.push({
        key: 'vision',
        label: 'Vision tags',
        clear: () => setFilter(previous => ({ ...previous, visionTagsOnly: undefined })),
      });
    }
    if (filter.semanticSearch) {
      chips.push({
        key: 'semantic',
        label: 'Semantic',
        clear: () => setFilter(previous => ({ ...previous, semanticSearch: undefined })),
      });
    }
    if (projectFilterId) {
      const projectLabel =
        projectFilterId === 'active'
          ? 'Active project'
          : (projects.find(project => project.id === projectFilterId)?.name ?? projectFilterId);
      chips.push({
        key: 'project',
        label: `Project: ${projectLabel}`,
        clear: () => setProjectFilterId(''),
      });
    }
    if (sort !== 'queued-desc') {
      const sortLabel = GALLERY_SORT_OPTIONS.find(option => option.value === sort)?.label ?? sort;
      chips.push({
        key: 'sort',
        label: `Sort: ${sortLabel}`,
        clear: () => setSort('queued-desc'),
      });
    }
    return chips;
  }, [filter, projectFilterId, projects, setFilter, setProjectFilterId, setSort, sort]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setQueryDraft(filter.query ?? '');
    });
  }, [filter.query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = queryDraft.trim();
      const nextQuery = trimmed || undefined;
      setFilter(previous => {
        if (previous.query === nextQuery) {
          return previous;
        }
        return { ...previous, query: nextQuery };
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [queryDraft, setFilter]);

  async function runVisionBackfill() {
    const { backfillVisionTags, listUntaggedCompletedEntries } =
      await import('@/lib/gallery-vision-backfill');
    const entries = listUntaggedCompletedEntries(100);
    if (entries.length === 0) {
      return;
    }
    setBackfillLoading(true);
    setBackfillProgress({ total: entries.length, completed: 0, tagged: 0, skipped: 0, failed: 0 });
    try {
      await backfillVisionTags(entries, {
        concurrency: 2,
        onProgress: progress => setBackfillProgress({ ...progress }),
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
      layout,
      pageSize,
      density,
    });
    setSavedViews(loadGallerySavedViews());
    setViewNameDraft('');
  }

  function applySavedView(view: GallerySavedView) {
    setFilter(view.filter);
    if (view.sort) {
      setSort(view.sort);
    }
    if (view.projectFilterId !== undefined) {
      setProjectFilterId(view.projectFilterId);
    }
    if (view.layout) {
      setLayout(view.layout);
    }
    if (view.pageSize) {
      setPageSize(view.pageSize);
    }
    if (view.density) {
      setDensity(view.density);
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
            onChange={event => setQueryDraft(event.target.value)}
            placeholder={
              lean
                ? 'Search prompts, tool, or model…'
                : 'Prompt, tool, model, prompt id, vision tags…'
            }
            className="ui-input block w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
        </label>

        <label className="min-w-[8rem] space-y-1.5">
          <span className="type-caption text-[var(--text-muted)]">Status</span>
          <select
            value={filter.status ?? 'all'}
            onChange={event =>
              setFilter({
                ...filter,
                status: event.target.value as ComfyGalleryJobStatus | 'all',
              })
            }
            className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
          </select>
        </label>

        <label className="min-w-[8rem] space-y-1.5">
          <span className="type-caption text-[var(--text-muted)]">Group</span>
          <select
            value={filter.customGroup ?? ''}
            onChange={event =>
              setFilter({
                ...filter,
                customGroup: event.target.value || undefined,
              })
            }
            data-testid="gallery-filter-custom-group"
            className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
          >
            <option value="">All groups</option>
            <option value={GALLERY_UNGROUPED_FILTER}>Ungrouped</option>
            {customGroups.map(group => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>

        {paginationEnabled ? (
          <label className="min-w-[8rem] space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Sort</span>
            <select
              value={sort}
              onChange={event => setSort(event.target.value as ComfyGallerySort)}
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              {(lean
                ? GALLERY_SORT_OPTIONS.filter(option =>
                    [
                      'queued-desc',
                      'queued-asc',
                      'completed-desc',
                      'favorites-first',
                      'rating-desc',
                      'eviction-risk-desc',
                    ].includes(option.value)
                  )
                : GALLERY_SORT_OPTIONS
              ).map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {(['grid', 'dense', 'list'] as const).map(mode => (
            <FilterChip
              key={mode}
              active={layout === mode}
              label={mode === 'grid' ? 'Grid' : mode === 'dense' ? 'Dense' : 'List'}
              testId={`gallery-layout-${mode}`}
              onClick={() => setLayout(mode)}
            />
          ))}
          <FilterChip
            active={density === 'comfortable'}
            label="Comfort"
            testId="gallery-density-comfortable"
            onClick={() => setDensity('comfortable')}
          />
          <FilterChip
            active={density === 'compact'}
            label="Compact"
            testId="gallery-density-compact"
            onClick={() => setDensity('compact')}
          />
        </div>

        <p className="shrink-0 type-caption text-[var(--text-muted)]">
          {totalFiltered} of {totalEntries}
          {showPagination ? ` · page ${currentPage}/${totalPages}` : ''}
          {!lean && embeddingSearchLoading ? ' · searching…' : null}
          {!lean && embeddingSearchUnavailable ? ' · semantic unavailable' : null}
          {!lean && similarSearchLoading ? ' · ranking similar…' : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { rating: undefined as 1 | 2 | 3 | 4 | 5 | undefined, label: 'Any ★' },
            { rating: 5 as const, label: '5★' },
            { rating: 4 as const, label: '≥4★' },
            { rating: 3 as const, label: '≥3★' },
            { rating: 1 as const, label: '≥1★' },
          ] as const
        ).map(option => (
          <FilterChip
            key={option.label}
            active={
              option.rating === undefined ? !filter.minRating : filter.minRating === option.rating
            }
            label={option.label}
            testId={
              option.rating === undefined
                ? 'gallery-filter-rating-any'
                : `gallery-filter-rating-${option.rating}`
            }
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                minRating: option.rating,
              }))
            }
          />
        ))}
        {models.length > 0 ? (
          <label className="flex items-center gap-1.5 type-caption text-[var(--text-muted)]">
            Model
            <select
              value={filter.model ?? ''}
              onChange={event =>
                setFilter({
                  ...filter,
                  model: event.target.value || undefined,
                })
              }
              data-testid="gallery-filter-model"
              className="ui-input px-2 py-1 text-[11px]"
            >
              <option value="">All models</option>
              {models.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {savedViews.length > 0 || !lean ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-caption text-[var(--text-muted)]">Views</span>
          {savedViews.map(view => (
            <span key={view.id} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => applySavedView(view)}
                data-testid={`gallery-saved-view-${view.id}`}
                className="ui-chip rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] backdrop-blur-xs transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
              >
                {view.name}
              </button>
              {!lean ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteGallerySavedView(view.id);
                    setSavedViews(loadGallerySavedViews());
                  }}
                  className="rounded-xl px-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--tint-danger-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  aria-label={`Delete saved view ${view.name}`}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {!lean ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={viewNameDraft}
                onChange={event => setViewNameDraft(event.target.value)}
                placeholder="Name this view…"
                className="ui-input min-w-[10rem] px-2 py-1 text-[11px]"
              />
              <button
                type="button"
                onClick={saveCurrentView}
                className="ui-btn-ghost ui-btn-sm rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60 text-xs text-[var(--accent-text)] backdrop-blur-xs transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
              >
                Save view
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div
          data-testid="gallery-active-filters"
          className="ui-gallery-dock sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-10 flex flex-wrap items-center gap-2 px-3 py-2"
        >
          <span className="type-caption text-[var(--text-muted)]">Active</span>
          {activeChips.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
            >
              {chip.label}
              <span aria-hidden className="text-[var(--accent-text)]">
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setFilter({
                status: 'all',
                favoritesOnly: undefined,
                tool: undefined,
                model: undefined,
                minRating: undefined,
                query: undefined,
                semanticSearch: undefined,
                reviewMode: undefined,
                unreviewedOnly: undefined,
                reviewAutoAdvance: undefined,
                visionTagsOnly: undefined,
                atRiskOnly: undefined,
                mediaKind: 'all',
                similarToEntryId: undefined,
                focusEntryId: undefined,
                derivativeOfEntryId: undefined,
                derivedKind: undefined,
                userTag: undefined,
                customGroup: undefined,
              });
              setProjectFilterId('');
              setSort('queued-desc');
            }}
            className="ui-btn-ghost ui-btn-sm rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60 text-xs transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {lean ? (
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={Boolean(filter.favoritesOnly)}
            label="Favorites"
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                favoritesOnly: previous.favoritesOnly ? undefined : true,
              }))
            }
          />
          <FilterChip
            active={filter.status === 'completed'}
            label="Completed"
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                status: previous.status === 'completed' ? 'all' : 'completed',
              }))
            }
          />
          <FilterChip
            active={filter.status === 'error'}
            label="Failed"
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                status: previous.status === 'error' ? 'all' : 'error',
              }))
            }
          />
          <FilterChip
            active={Boolean(filter.reviewMode)}
            label="Review"
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                reviewMode: previous.reviewMode ? undefined : true,
                unreviewedOnly: previous.reviewMode ? undefined : true,
              }))
            }
          />
          <FilterChip
            active={Boolean(filter.unreviewedOnly)}
            label="Unreviewed"
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                unreviewedOnly: previous.unreviewedOnly ? undefined : true,
                reviewMode: previous.unreviewedOnly ? previous.reviewMode : true,
              }))
            }
          />
          {paginationEnabled ? (
            <label className="flex items-center gap-1.5 type-caption text-[var(--text-muted)]">
              Page size
              <select
                value={String(pageSize)}
                onChange={event => {
                  const value = event.target.value;
                  setPageSize(
                    value === GALLERY_PAGE_SIZE_ALL
                      ? GALLERY_PAGE_SIZE_ALL
                      : (Number(value) as GalleryPageSize)
                  );
                }}
                className="ui-input px-2 py-1 text-[11px]"
              >
                {GALLERY_PAGE_SIZE_OPTIONS.map(option => (
                  <option key={String(option)} value={String(option)}>
                    {option}
                  </option>
                ))}
                <option value={GALLERY_PAGE_SIZE_ALL}>All</option>
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {!lean ? (
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
                  value={filter.tool ?? ''}
                  onChange={event =>
                    setFilter({
                      ...filter,
                      tool: event.target.value || undefined,
                    })
                  }
                  className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
                >
                  <option value="">All tools</option>
                  {tools.map(tool => (
                    <option key={tool} value={tool}>
                      {tool}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {models.length > 0 ? (
              <label className="space-y-1.5">
                <span className="type-caption text-[var(--text-muted)]">Model</span>
                <select
                  value={filter.model ?? ''}
                  onChange={event =>
                    setFilter({
                      ...filter,
                      model: event.target.value || undefined,
                    })
                  }
                  className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
                >
                  <option value="">All models</option>
                  {models.map(model => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {userTags.length > 0 ? (
              <label className="space-y-1.5">
                <span className="type-caption text-[var(--text-muted)]">Tag</span>
                <select
                  value={filter.userTag ?? ''}
                  onChange={event =>
                    setFilter({
                      ...filter,
                      userTag: event.target.value || undefined,
                    })
                  }
                  data-testid="gallery-filter-user-tag"
                  className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
                >
                  <option value="">All tags</option>
                  {userTags.map(tag => (
                    <option key={tag} value={tag}>
                      #{tag}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="space-y-1.5">
              <span className="type-caption text-[var(--text-muted)]">Project</span>
              <select
                value={projectFilterId}
                onChange={event => setProjectFilterId(event.target.value)}
                className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
              >
                <option value="">All projects</option>
                <option value="active">Active project</option>
                {projects.map(project => (
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
                  onChange={event => setPageSize(event.target.value as GalleryPageSize)}
                  className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
                >
                  {GALLERY_PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                  <option value={GALLERY_PAGE_SIZE_ALL}>All</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={!filter.mediaKind || filter.mediaKind === 'all'}
              label="All media"
              onClick={() => setFilter({ ...filter, mediaKind: 'all' })}
            />
            <FilterChip
              active={filter.mediaKind === 'image'}
              label="Stills"
              onClick={() => setFilter({ ...filter, mediaKind: 'image' })}
            />
            <FilterChip
              active={filter.mediaKind === 'video'}
              label="Videos"
              onClick={() => setFilter({ ...filter, mediaKind: 'video' })}
            />
            <FilterChip
              active={filter.mediaKind === 'audio'}
              label="Audio"
              onClick={() => setFilter({ ...filter, mediaKind: 'audio' })}
            />
            <FilterChip
              active={filter.mediaKind === 'mesh'}
              label="3D"
              onClick={() => setFilter({ ...filter, mediaKind: 'mesh' })}
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
              label={embeddingSearchActive ? 'Semantic ✓' : 'Semantic'}
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
              testId="gallery-filter-review-mode"
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
            <FilterChip
              active={Boolean(filter.duplicatesOnly)}
              label="Duplicates"
              testId="gallery-filter-duplicates"
              onClick={() =>
                setFilter({
                  ...filter,
                  duplicatesOnly: filter.duplicatesOnly ? undefined : true,
                })
              }
            />
            <FilterChip
              active={Boolean(filter.needsVisionReview)}
              label="Vision inbox"
              testId="gallery-filter-vision-inbox"
              onClick={() =>
                setFilter({
                  ...filter,
                  needsVisionReview: filter.needsVisionReview ? undefined : true,
                })
              }
            />
            <FilterChip
              active={Boolean(filter.atRiskOnly)}
              label="At risk"
              onClick={() =>
                setFilter({
                  ...filter,
                  atRiskOnly: filter.atRiskOnly ? undefined : true,
                })
              }
            />
            <button
              type="button"
              disabled={backfillLoading}
              onClick={() => void runVisionBackfill()}
              className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] backdrop-blur-xs transition hover:bg-[var(--tint-info-bg)] hover:border-[var(--tint-info-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-40 ${
                backfillLoading ? 'text-slate-400' : 'text-[var(--tint-info-text)]'
              }`}
            >
              {backfillLoading
                ? backfillProgress
                  ? `Tagging ${backfillProgress.completed}/${backfillProgress.total}`
                  : 'Tagging…'
                : 'Tag untagged'}
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
              <button
                type="button"
                onClick={onStartSlideshow}
                className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] backdrop-blur-xs transition hover:bg-[var(--tint-warning-bg)] hover:border-[var(--tint-warning-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--tint-warning-text)]`}
              >
                Slideshow
              </button>
            ) : null}
            {slideshowAvailable && onStartFullscreenSlideshow ? (
              <button
                type="button"
                onClick={onStartFullscreenSlideshow}
                className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] backdrop-blur-xs transition hover:bg-[var(--accent-soft)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)]`}
              >
                Fullscreen slideshow
              </button>
            ) : null}
            {activeToggleCount > 0 ? (
              <button
                type="button"
                className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60 backdrop-blur-xs transition hover:bg-[var(--accent-muted)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
                onClick={() =>
                  setFilter({
                    ...filter,
                    favoritesOnly: undefined,
                    semanticSearch: undefined,
                    reviewMode: undefined,
                    unreviewedOnly: undefined,
                    reviewAutoAdvance: undefined,
                    visionTagsOnly: undefined,
                    atRiskOnly: undefined,
                    model: undefined,
                    minRating: undefined,
                    tool: undefined,
                  })
                }
              >
                Clear toggles
              </button>
            ) : null}
          </div>

          {filter.reviewMode ? (
            <p className="rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-[11px] text-[var(--accent-text)]">
              Review shortcuts: <kbd className="rounded bg-[var(--bg-muted)] px-1">1–5</kbd> rate ·{' '}
              <kbd className="rounded bg-[var(--bg-muted)] px-1">F</kbd> favorite ·{' '}
              <kbd className="rounded bg-[var(--bg-muted)] px-1">N</kbd>/
              <kbd className="rounded bg-[var(--bg-muted)] px-1">P</kbd> navigate
              {filter.reviewAutoAdvance ? ' · auto-advance on' : ''}
            </p>
          ) : null}
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
