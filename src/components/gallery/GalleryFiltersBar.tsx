'use client';

import { useEffect, useMemo, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
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
import { FilterChip } from '@/components/gallery/GalleryFilterChip';
import { GalleryFiltersAdvancedPanel } from '@/components/gallery/GalleryFiltersAdvancedPanel';

const GALLERY_SORT_OPTIONS: { value: ComfyGallerySort; label: string }[] = [
  { value: 'queued-desc', label: 'Newest' },
  { value: 'queued-asc', label: 'Oldest' },
  { value: 'completed-desc', label: 'Recently done' },
  { value: 'tool-asc', label: 'Tool A–Z' },
  { value: 'favorites-first', label: 'Favorites' },
  { value: 'rating-desc', label: 'Highest rated' },
  { value: 'eviction-risk-desc', label: 'Eviction risk' },
];

export type GalleryFiltersBarProps = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  tools: string[];
  models: string[];
  userTags?: string[];
  customGroups?: string[];
  onRenameCustomGroup?: (from: string, to: string) => void;
  onDeleteCustomGroup?: (name: string) => void;
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

export default function GalleryFiltersBar({
  filter,
  setFilter,
  tools,
  models,
  userTags = [],
  customGroups = [],
  onRenameCustomGroup,
  onDeleteCustomGroup,
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
  const [queryDraft, setQueryDraft] = useState(filter.query ?? '');

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

        {!lean ? (
          <div className="flex min-w-[8rem] flex-col gap-1.5">
            <span className="type-caption text-[var(--text-muted)]">Match</span>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                active={Boolean(filter.semanticSearch)}
                label={
                  embeddingSearchLoading
                    ? 'Semantic…'
                    : embeddingSearchActive
                      ? 'Semantic ✓'
                      : 'Semantic'
                }
                testId="gallery-filter-semantic-inline"
                onClick={() =>
                  setFilter({
                    ...filter,
                    semanticSearch: filter.semanticSearch ? undefined : true,
                  })
                }
              />
              {filter.semanticSearch && embeddingSearchUnavailable ? (
                <span className="type-caption text-[var(--tint-warning-text)]">text fallback</span>
              ) : null}
            </div>
          </div>
        ) : null}

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
          <span className="type-caption text-[var(--text-muted)]">Gallery group</span>
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

        {filter.customGroup &&
        filter.customGroup !== GALLERY_UNGROUPED_FILTER &&
        (onRenameCustomGroup || onDeleteCustomGroup) ? (
          <div className="flex flex-wrap items-end gap-2 pb-0.5">
            {onRenameCustomGroup ? (
              <button
                type="button"
                data-testid="gallery-group-rename"
                className="ui-btn-ghost ui-btn-sm text-[11px]"
                onClick={() => {
                  const next = window.prompt('Rename group', filter.customGroup);
                  if (next?.trim() && next.trim() !== filter.customGroup) {
                    onRenameCustomGroup(filter.customGroup!, next.trim());
                    setFilter(previous => ({ ...previous, customGroup: next.trim() }));
                  }
                }}
              >
                Rename
              </button>
            ) : null}
            {onDeleteCustomGroup ? (
              <button
                type="button"
                data-testid="gallery-group-delete"
                className="ui-btn-ghost ui-btn-sm text-[11px] text-[var(--tint-danger-text)]"
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove group “${filter.customGroup}” from all gallery items? Files stay; only the group label is cleared.`
                    )
                  ) {
                    onDeleteCustomGroup(filter.customGroup!);
                    setFilter(previous => ({ ...previous, customGroup: undefined }));
                  }
                }}
              >
                Delete group
              </button>
            ) : null}
          </div>
        ) : null}

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

        <div className="grid w-full gap-3 md:hidden sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Layout</span>
            <select
              value={layout}
              onChange={event => setLayout(event.target.value as GalleryLayoutMode)}
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="grid">Grid</option>
              <option value="dense">Dense</option>
              <option value="list">List</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="type-caption text-[var(--text-muted)]">Density</span>
            <select
              value={density}
              onChange={event => setDensity(event.target.value as GalleryDensity)}
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="comfortable">Comfort</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="type-caption text-[var(--text-muted)]">Min rating</span>
            <select
              value={filter.minRating ?? ''}
              onChange={event =>
                setFilter(previous => ({
                  ...previous,
                  minRating: event.target.value
                    ? (Number(event.target.value) as 1 | 2 | 3 | 4 | 5)
                    : undefined,
                }))
              }
              className="ui-input block w-full px-3 py-(--input-padding-y) type-body"
            >
              <option value="">Any ★</option>
              <option value="5">5★ only</option>
              <option value="4">≥4★</option>
              <option value="3">≥3★</option>
              <option value="1">≥1★</option>
            </select>
          </label>
        </div>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
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

      {customGroups.length > 0 ? (
        <div
          data-testid="gallery-groups-rail"
          className="flex flex-wrap items-center gap-2"
          aria-label="Gallery groups"
        >
          <span className="type-caption text-[var(--text-muted)]">Groups</span>
          <FilterChip
            active={!filter.customGroup}
            label="All"
            onClick={() => setFilter({ ...filter, customGroup: undefined })}
          />
          <FilterChip
            active={filter.customGroup === GALLERY_UNGROUPED_FILTER}
            label="Ungrouped"
            onClick={() =>
              setFilter({
                ...filter,
                customGroup:
                  filter.customGroup === GALLERY_UNGROUPED_FILTER
                    ? undefined
                    : GALLERY_UNGROUPED_FILTER,
              })
            }
          />
          {customGroups.map(group => (
            <FilterChip
              key={`rail-${group}`}
              active={filter.customGroup === group}
              label={group}
              onClick={() =>
                setFilter({
                  ...filter,
                  customGroup: filter.customGroup === group ? undefined : group,
                })
              }
            />
          ))}
        </div>
      ) : null}

      <div className="hidden flex-wrap items-center gap-2 md:flex">
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
                className="ui-chip rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
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
                className="ui-btn-ghost ui-btn-sm rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-muted)] text-xs text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
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
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
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
            className="ui-btn-ghost ui-btn-sm rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-muted)] text-xs transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
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
        <GalleryFiltersAdvancedPanel
          filter={filter}
          setFilter={setFilter}
          tools={tools}
          models={models}
          userTags={userTags}
          projects={projects}
          projectFilterId={projectFilterId}
          setProjectFilterId={setProjectFilterId}
          pageSize={pageSize}
          setPageSize={setPageSize}
          paginationEnabled={paginationEnabled}
          embeddingSearchActive={embeddingSearchActive}
          embeddingSearchUnavailable={embeddingSearchUnavailable}
          onStartSlideshow={onStartSlideshow}
          onStartFullscreenSlideshow={onStartFullscreenSlideshow}
          slideshowAvailable={slideshowAvailable}
        />
      ) : null}
    </div>
  );
}
