'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useGalleryPanelActions } from '@/hooks/useGalleryPanelActions';
import ImageLightbox, { type ImageLightboxState } from '@/components/ui/ImageLightbox';
import { ButtonLink } from '@/components/ui/Button';
import { useComfyUiGallery } from '@/hooks/useComfyUiGallery';
import GalleryVisionReviewButton from '@/components/gallery/GalleryVisionReviewButton';
import GalleryCardItem from '@/components/gallery/GalleryCardItem';
import GalleryDisplayGrid from '@/components/gallery/GalleryDisplayGrid';
import GalleryEmptyPanel from '@/components/gallery/GalleryEmptyPanel';
import GalleryFiltersBar from '@/components/gallery/GalleryFiltersBar';
import GalleryReviewBanner from '@/components/gallery/GalleryReviewBanner';
import GalleryExperimentPanel from '@/components/gallery/GalleryExperimentPanel';
import GalleryStatsBar from '@/components/gallery/GalleryStatsBar';
import GalleryReviewTouchBar from '@/components/gallery/GalleryReviewTouchBar';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import GalleryPaginator from '@/components/gallery/GalleryPaginator';
import StatusToastStrip from '@/components/ui/StatusToastStrip';
import { assessGalleryCapWarning } from '@/lib/gallery-cap';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';
import { useGalleryReview } from '@/hooks/useGalleryReview';
import { useGallerySelection } from '@/hooks/useGallerySelection';
import { useGalleryCompareHandlers } from '@/hooks/useGalleryCompareHandlers';
import { toneForStatusText } from '@/lib/status-progress';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { computeGalleryStats } from '@/lib/gallery-stats';
import { type ParamExperimentAxis } from '@/lib/param-experiment-queue';
import { useHeldMaxCount } from '@/hooks/useHeldMaxJobs';
import { suggestRatingMutations } from '@/lib/rating-prompt-mutations';
import { loadActiveProjectId, loadPromptProjects } from '@/lib/prompt-projects';
import { downloadGalleryImage } from '@/lib/comfyui-gallery-export';
import {
  buildGalleryLineageGroups,
  galleryLineageGroupingEnabled,
} from '@/lib/gallery-lineage-groups';
import {
  buildGalleryLightboxPlaylist,
  galleryEntryLightboxUrls,
  galleryEntryMediaKinds,
  galleryEntryPrimaryMediaKind,
  galleryEntryStripThumbUrls,
  galleryEntryViewUrls,
  GALLERY_ALL_RENDER_CHUNK,
  GALLERY_PAGE_SIZE_ALL,
  GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  loadGalleryViewPreferences,
  paginateGalleryEntries,
  resolveGalleryPageSize,
  resolveGalleryLightboxEntry,
  resolveGalleryLightboxOpenIndex,
  saveGalleryViewPreferences,
  sortGalleryEntries,
  type ComfyGalleryEntry,
  type ComfyGallerySort,
  type GalleryLayoutMode,
  type GalleryPageSize,
  type GallerySlideshowIntervalMs,
  type GallerySlideshowTransition,
} from '@/lib/comfyui-gallery';
import { prefetchGalleryImageUrl } from '@/lib/gallery-image-prefetch';
import {
  galleryHandoffHomePath,
  galleryPickActionLabel,
  galleryPickPurposeLabel,
  parseGalleryPickTarget,
} from '@/lib/gallery-handoff';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import LoraDatasetExportDialog from '@/components/LoraDatasetExportDialog';

const GalleryWorkflowModal = dynamic(() => import('@/components/gallery/GalleryWorkflowModal'), {
  loading: () => null,
});

const GalleryCompareModal = dynamic(() => import('@/components/gallery/GalleryCompareModal'), {
  loading: () => null,
});

type ComfyUiGalleryPanelProps = {
  limit?: number;
  showHeader?: boolean;
  compact?: boolean;
  showFilters?: boolean;
};

export default function ComfyUiGalleryPanel({
  limit,
  showHeader = true,
  compact = false,
  showFilters = false,
}: ComfyUiGalleryPanelProps) {
  const workspaceMode = useWorkspaceMode();
  const leanGallery = workspaceMode === 'simple' && showFilters && !compact;

  const {
    storeReady,
    entries,
    filteredEntries,
    filter,
    setFilter,
    tools,
    removeEntry,
    removeEntries,
    toggleFavorite,
    setFavorites,
    setProjectIds,
    clearAll,
    refreshPending,
    primaryThumbUrl,
    setReviewRating,
    embeddingSearchActive,
    similarSearchActive,
    embeddingSearchLoading,
    similarSearchLoading,
    embeddingSearchUnavailable,
  } = useComfyUiGallery();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const focus = params.get('focus');
    const review = params.get('review');
    if (!query?.trim() && !focus?.trim() && review !== '1') {
      return;
    }
    setFilter(previous => ({
      ...previous,
      ...(query?.trim() ? { query: query.trim(), semanticSearch: true } : {}),
      ...(focus?.trim() ? { focusEntryId: focus.trim() } : {}),
      ...(review === '1' ? { reviewMode: true, unreviewedOnly: true } : {}),
    }));
  }, [setFilter]);

  useEffect(() => {
    if (!leanGallery) {
      return;
    }
    setFilter(previous => ({
      ...previous,
      semanticSearch: undefined,
      similarToEntryId: undefined,
      reviewMode: undefined,
      unreviewedOnly: undefined,
      reviewAutoAdvance: undefined,
      visionTagsOnly: undefined,
    }));
  }, [leanGallery, setFilter]);

  // Derive from the live URL
  const searchParams = useSearchParams();
  const pickFor = useMemo(
    () => parseGalleryPickTarget(searchParams.get('pickFor')),
    [searchParams]
  );

  const router = useRouter();
  const heldMaxCount = useHeldMaxCount();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [requeueStatus, setRequeueStatus] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const [slideshowFullscreen, setSlideshowFullscreen] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ComfyGallerySort>('queued-desc');
  const [pageSize, setPageSize] = useState<GalleryPageSize>(12);
  const [slideshowIntervalMs, setSlideshowIntervalMs] = useState<GallerySlideshowIntervalMs>(5000);
  const [slideshowTransition, setSlideshowTransition] =
    useState<GallerySlideshowTransition>('slide');
  const [layout, setLayout] = useState<GalleryLayoutMode>('grid');
  const [viewPrefsLoaded, setViewPrefsLoaded] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [loraExportOpen, setLoraExportOpen] = useState(false);
  const [loraExportScope, setLoraExportScope] = useState<'favorites' | 'selected'>('favorites');
  const [workflowEntry, setWorkflowEntry] = useState<ComfyGalleryEntry | null>(null);
  const [collapsedLineageGroups, setCollapsedLineageGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [paramAxis, setParamAxis] = useState<ParamExperimentAxis>('cfg');
  const [projectFilterId, setProjectFilterId] = useState<string>('');
  const [projects] = useState(() => loadPromptProjects());
  const [allRenderLimit, setAllRenderLimit] = useState(GALLERY_ALL_RENDER_CHUNK);
  const entriesRef = useRef(entries);
  const visibleEntriesRef = useRef<ComfyGalleryEntry[]>([]);
  const entryIdsWithDerivatives = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (entry.parentGalleryEntryId) {
        ids.add(entry.parentGalleryEntryId);
      }
    }
    return ids;
  }, [entries]);
  const resolvedProjectFilterId = useMemo(() => {
    if (projectFilterId === 'active') {
      return loadActiveProjectId();
    }
    return projectFilterId || undefined;
  }, [projectFilterId]);

  const clearGalleryFilters = useCallback(() => {
    setFilter({ status: 'all' });
    setProjectFilterId('');
    setPage(1);
  }, [setFilter]);

  useEffect(() => {
    setFilter(previous => ({
      ...previous,
      projectId: resolvedProjectFilterId,
    }));
  }, [resolvedProjectFilterId, setFilter]);

  const bulkEnabled = showFilters && !compact;
  const leanBulkEnabled = bulkEnabled && !leanGallery;
  const paginationEnabled = showFilters && !compact && !limit;
  const galleryStats = useMemo(() => computeGalleryStats(entries), [entries]);
  const galleryCapWarning = useMemo(
    () => assessGalleryCapWarning(entries.length, MAX_GALLERY_ENTRIES),
    [entries.length]
  );
  const activeJobs = galleryStats.pending + galleryStats.running;

  const filteredSource = showFilters ? filteredEntries : entries;
  const sortedSource = useMemo(
    () => (paginationEnabled ? sortGalleryEntries(filteredSource, sort) : filteredSource),
    [filteredSource, paginationEnabled, sort]
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      const preferences = loadGalleryViewPreferences();
      setSort(preferences.sort);
      setPageSize(preferences.pageSize);
      setSlideshowIntervalMs(preferences.slideshowIntervalMs);
      setSlideshowTransition(preferences.slideshowTransition);
      setLayout(preferences.layout);
      setViewPrefsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!viewPrefsLoaded || !paginationEnabled) {
      return;
    }
    saveGalleryViewPreferences({
      sort,
      pageSize,
      slideshowIntervalMs,
      slideshowTransition,
      layout,
    });
  }, [
    sort,
    pageSize,
    slideshowIntervalMs,
    slideshowTransition,
    layout,
    viewPrefsLoaded,
    paginationEnabled,
  ]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPage(1);
      setAllRenderLimit(GALLERY_ALL_RENDER_CHUNK);
    });
  }, [filter, sort, pageSize]);

  const pagination = useMemo(() => {
    if (!paginationEnabled) {
      const items = limit ? sortedSource.slice(0, limit) : sortedSource;
      return {
        items,
        page: 1,
        totalPages: 1,
        totalItems: sortedSource.length,
        hasMoreAll: false,
        remainingAll: 0,
      };
    }

    if (pageSize === GALLERY_PAGE_SIZE_ALL) {
      const items = sortedSource.slice(0, allRenderLimit);
      const remainingAll = Math.max(sortedSource.length - allRenderLimit, 0);
      return {
        items,
        page: 1,
        totalPages: 1,
        totalItems: sortedSource.length,
        hasMoreAll: remainingAll > 0,
        remainingAll,
      };
    }

    const effectivePageSize = resolveGalleryPageSize(pageSize, sortedSource.length);
    return {
      ...paginateGalleryEntries(sortedSource, page, effectivePageSize),
      hasMoreAll: false,
      remainingAll: 0,
    };
  }, [sortedSource, limit, page, pageSize, paginationEnabled, allRenderLimit]);

  const visibleEntries = pagination.items;
  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;
  const totalFiltered = pagination.totalItems;
  const hasMoreAll = pagination.hasMoreAll;
  const remainingAll = pagination.remainingAll;
  const effectivePageSize = resolveGalleryPageSize(pageSize, totalFiltered);
  const showPagination =
    paginationEnabled && pageSize !== GALLERY_PAGE_SIZE_ALL && totalFiltered > effectivePageSize;
  const lineageGrouping = !leanGallery && galleryLineageGroupingEnabled(filter);
  const lineageGroups = useMemo(
    () => (lineageGrouping ? buildGalleryLineageGroups(visibleEntries) : null),
    [lineageGrouping, visibleEntries]
  );
  const galleryCardGridClass =
    layout === 'dense'
      ? compact
        ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'
        : 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
      : compact
        ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'
        : 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4';
  const galleryVirtualGridClass =
    layout === 'dense'
      ? compact
        ? 'grid gap-3'
        : 'grid gap-4'
      : compact
        ? 'grid gap-4'
        : 'grid gap-6';

  const {
    selectedIds,
    setSelectedIds,
    selectedIdSet,
    selectedEntries,
    toggleSelected,
    clearSelection,
    selectAllVisible,
  } = useGallerySelection(visibleEntries);

  const { compareHandlers, resetCompare } = useGalleryCompareHandlers({
    selectedEntries,
    setFavorites,
    setReviewRating,
    toggleFavorite,
  });

  const { reviewFocusIndex, reviewFocusEntry, handleReviewRating } = useGalleryReview({
    filter,
    visibleEntries,
    selectedIds,
    setSelectedIds,
    selectedIdSet,
    setReviewRating,
    toggleFavorite,
    onStatusMessage: setRequeueStatus,
  });

  const activeProjectId = useMemo(() => loadActiveProjectId(), []);

  const toggleLineageGroup = useCallback((rootId: string) => {
    setCollapsedLineageGroups(previous => {
      const next = new Set(previous);
      if (next.has(rootId)) {
        next.delete(rootId);
      } else {
        next.add(rootId);
      }
      return next;
    });
  }, []);

  const lightboxPlaylist = useMemo(
    () => buildGalleryLightboxPlaylist(visibleEntries),
    [visibleEntries]
  );

  const openEntryLightbox = useCallback(
    (entry: ComfyGalleryEntry, imageIndex: number) => {
      if (lightboxPlaylist.images.length === 0) {
        return;
      }

      const index = resolveGalleryLightboxOpenIndex(
        visibleEntriesRef.current,
        entry.id,
        imageIndex
      );

      setLightbox({
        images: lightboxPlaylist.images,
        thumbImages: lightboxPlaylist.thumbImages,
        originalImages: lightboxPlaylist.originalImages,
        downloadUrls: lightboxPlaylist.downloadUrls,
        downloadFilenames: lightboxPlaylist.downloadFilenames,
        titles: lightboxPlaylist.titles,
        mediaKinds: lightboxPlaylist.mediaKinds,
        index,
        title: lightboxPlaylist.titles[index],
      });
      setSlideshowPlaying(false);
      setSlideshowFullscreen(false);
    },
    [lightboxPlaylist]
  );

  const openLightboxForEntryId = useCallback(
    (entryId: string, imageIndex: number) => {
      const entry = visibleEntriesRef.current.find(item => item.id === entryId);
      if (entry) {
        openEntryLightbox(entry, imageIndex);
      }
    },
    [openEntryLightbox]
  );

  const prefetchLightboxForEntryId = useCallback((entryId: string, imageIndex: number) => {
    const entry = visibleEntriesRef.current.find(item => item.id === entryId);
    if (!entry) {
      return;
    }
    const urls = galleryEntryLightboxUrls(entry);
    if (urls.length === 0) {
      return;
    }
    const safeIndex = Math.min(Math.max(imageIndex, 0), urls.length - 1);
    if (galleryEntryMediaKinds(entry)[safeIndex] === 'video') {
      return;
    }
    prefetchGalleryImageUrl(urls[safeIndex]);
  }, []);

  const startSlideshow = () => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }

    setLightbox({
      images: lightboxPlaylist.images,
      thumbImages: lightboxPlaylist.thumbImages,
      originalImages: lightboxPlaylist.originalImages,
      downloadUrls: lightboxPlaylist.downloadUrls,
      downloadFilenames: lightboxPlaylist.downloadFilenames,
      titles: lightboxPlaylist.titles,
      mediaKinds: lightboxPlaylist.mediaKinds,
      index: 0,
      title: lightboxPlaylist.titles[0],
    });
    setSlideshowFullscreen(false);
    setSlideshowPlaying(true);
  };

  const startFullscreenSlideshow = () => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }

    setLightbox({
      images: lightboxPlaylist.images,
      thumbImages: lightboxPlaylist.thumbImages,
      originalImages: lightboxPlaylist.originalImages,
      downloadUrls: lightboxPlaylist.downloadUrls,
      downloadFilenames: lightboxPlaylist.downloadFilenames,
      titles: lightboxPlaylist.titles,
      mediaKinds: lightboxPlaylist.mediaKinds,
      index: 0,
      title: lightboxPlaylist.titles[0],
    });
    setSlideshowFullscreen(true);
    setSlideshowPlaying(true);
  };

  const closeLightbox = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    setLightbox(null);
    setSlideshowPlaying(false);
    setSlideshowFullscreen(false);
  };

  const onDownloadImage = useCallback(async (displayIndex: number) => {
    const resolved = resolveGalleryLightboxEntry(visibleEntriesRef.current, displayIndex);
    if (!resolved) return;
    await downloadGalleryImage(resolved.entry, resolved.imageIndex);
  }, []);

  const { galleryCardActionsRef, bulkExperimentHandlers } = useGalleryPanelActions({
    entriesRef,
    toggleSelected,
    removeEntry,
    toggleFavorite,
    setRequeueStatus,
    setDownloadError,
    setFilter,
    setWorkflowEntry,
    openLightboxForEntryId,
    prefetchLightboxForEntryId,
    handleReviewRating,
    pickFor,
    router,
    selectedIds,
    selectedEntries,
    setSelectedIds,
    setProjectIds,
    removeEntries,
    setFavorites,
    paramAxis,
    filter,
    setLoraExportScope,
    setLoraExportOpen,
  });

  useEffect(() => {
    if (!paginationEnabled || page === currentPage) {
      return;
    }
    scheduleAfterCommit(() => {
      setPage(currentPage);
    });
  }, [currentPage, page, paginationEnabled]);

  useLayoutEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useLayoutEffect(() => {
    visibleEntriesRef.current = visibleEntries;
  }, [visibleEntries]);

  const renderGalleryCard = useCallback(
    (entry: ComfyGalleryEntry) => (
      <GalleryCardItem
        entry={entry}
        actionsRef={galleryCardActionsRef}
        compact={compact || layout === 'dense'}
        layout={layout}
        selectable={bulkEnabled && !pickFor}
        selected={selectedIdSet.has(entry.id)}
        reviewFocus={
          (filter.reviewMode === true && reviewFocusEntry?.id === entry.id) ||
          filter.focusEntryId === entry.id
        }
        previewUrl={primaryThumbUrl(entry)}
        imageUrls={galleryEntryStripThumbUrls(entry)}
        reviewMode={filter.reviewMode === true && !pickFor}
        reviewMutationHints={
          filter.reviewMode && !pickFor && reviewFocusEntry?.id === entry.id && !entry.reviewRating
            ? suggestRatingMutations(entry, 2).map(item => item.detail)
            : undefined
        }
        hasDerivatives={entryIdsWithDerivatives.has(entry.id)}
        pickMode={Boolean(pickFor)}
        pickable={
          Boolean(pickFor) &&
          entry.status === 'completed' &&
          galleryEntryPrimaryMediaKind(entry) === 'image'
        }
        pickLabel={pickFor ? galleryPickActionLabel(pickFor) : undefined}
      />
    ),
    [
      bulkEnabled,
      compact,
      entryIdsWithDerivatives,
      filter.focusEntryId,
      filter.reviewMode,
      galleryCardActionsRef,
      layout,
      pickFor,
      primaryThumbUrl,
      reviewFocusEntry?.id,
      selectedIdSet,
    ]
  );

  if (entries.length === 0 && !storeReady) {
    return <GalleryPanelSkeleton showFilters={showFilters} compact={compact} />;
  }

  return (
    <section className="space-y-6">
      <ImageLightbox
        state={lightbox}
        onClose={closeLightbox}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? {
                  ...previous,
                  index,
                  title: previous.titles?.[index] ?? previous.title,
                }
              : previous
          )
        }
        onDownloadImage={onDownloadImage}
        slideshow={
          lightboxPlaylist.images.length > 1
            ? {
                playing: slideshowPlaying,
                intervalMs: slideshowIntervalMs,
                intervalOptions: GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
                transition: slideshowTransition,
                transitionOptions: GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
                onPlayingChange: setSlideshowPlaying,
                onIntervalChange: intervalMs =>
                  setSlideshowIntervalMs(intervalMs as GallerySlideshowIntervalMs),
                onTransitionChange: setSlideshowTransition,
                fullscreen: slideshowFullscreen,
                onFullscreenChange: setSlideshowFullscreen,
              }
            : undefined
        }
      />
      {showHeader && (
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
            <button
              type="button"
              onClick={() => void refreshPending()}
              className="ui-btn-ghost ui-btn-sm text-xs"
            >
              Refresh jobs
            </button>
            {activeJobs > 0 ? (
              <span className="self-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100">
                {activeJobs} active
              </span>
            ) : null}
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Clear all gallery entries?')) {
                    clearAll();
                  }
                }}
                className="ui-btn-ghost ui-btn-sm text-xs text-[var(--text-muted)] hover:text-rose-300"
              >
                Clear all
              </button>
            )}
            {!compact && limit && entries.length > limit && (
              <ButtonLink href="/gallery" size="sm">
                View all
              </ButtonLink>
            )}
          </div>
        </div>
      )}

      {pickFor ? (
        <div className="sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 shadow-[0_12px_40px_-20px_rgba(109,40,217,0.55)] backdrop-blur-md">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-violet-50">
              Choosing {galleryPickPurposeLabel(pickFor)}
            </p>
            <p className="type-caption text-violet-100/70">
              Click a completed still image to send it back. Video clips are skipped.
            </p>
          </div>
          <ButtonLink href={galleryHandoffHomePath(pickFor)} variant="ghost" size="sm">
            Cancel
          </ButtonLink>
        </div>
      ) : null}

      {galleryCapWarning.message ? (
        <p
          className={`rounded-lg border px-3 py-2 text-xs ${
            galleryCapWarning.level === 'urgent'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
          }`}
        >
          {galleryCapWarning.message}
        </p>
      ) : null}

      {showFilters && !leanGallery && entries.length > 0 ? (
        <GalleryStatsBar
          stats={galleryStats}
          filter={filter}
          activeJobs={activeJobs}
          heldMaxJobs={heldMaxCount}
          activeProjectId={activeProjectId}
          projectFilterActive={projectFilterId === 'active'}
          onProjectFilter={setProjectFilterId}
          onRefreshPending={() => void refreshPending()}
          onQuickFilter={patch => setFilter(previous => ({ ...previous, ...patch }))}
        />
      ) : null}

      {showFilters && (
        <GalleryFiltersBar
          lean={leanGallery}
          filter={filter}
          setFilter={setFilter}
          tools={tools}
          projects={projects}
          projectFilterId={projectFilterId}
          setProjectFilterId={setProjectFilterId}
          sort={sort}
          setSort={setSort}
          pageSize={pageSize}
          setPageSize={setPageSize}
          paginationEnabled={paginationEnabled}
          embeddingSearchActive={embeddingSearchActive}
          embeddingSearchLoading={embeddingSearchLoading}
          similarSearchLoading={similarSearchLoading}
          embeddingSearchUnavailable={embeddingSearchUnavailable}
          layout={layout}
          setLayout={setLayout}
          totalFiltered={totalFiltered}
          totalEntries={entries.length}
          currentPage={currentPage}
          totalPages={totalPages}
          showPagination={showPagination}
          slideshowAvailable={lightboxPlaylist.images.length > 1}
          onStartSlideshow={startSlideshow}
          onStartFullscreenSlideshow={startFullscreenSlideshow}
        />
      )}

      {filter.reviewMode && !pickFor ? <GalleryReviewBanner filter={filter} /> : null}

      {showPagination && (
        <GalleryPaginator
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalFiltered}
          pageSize={effectivePageSize}
          onPageChange={setPage}
        />
      )}

      {leanBulkEnabled && visibleEntries.length > 0 && selectedIds.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/20 px-4 py-3 text-xs text-[var(--text-muted)]">
          <span>Select cards to compare, export, queue, assign projects, or remove.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoraExportScope('favorites');
                setLoraExportOpen(true);
              }}
              className="ui-btn-ghost ui-btn-sm"
            >
              Export LoRA dataset (favorites/4–5★)
            </button>
            <button type="button" onClick={selectAllVisible} className="ui-btn-ghost ui-btn-sm">
              Select visible ({visibleEntries.length})
            </button>
          </div>
        </div>
      ) : null}

      {bulkEnabled ? (
        <GalleryExperimentPanel
          lean={leanGallery}
          selectedCount={selectedIds.length}
          selectedEntries={selectedEntries}
          projects={projects}
          paramAxis={paramAxis}
          setParamAxis={setParamAxis}
          similarSearchActive={similarSearchActive}
          onClearSelection={clearSelection}
          onCompare={() => setCompareOpen(true)}
          {...bulkExperimentHandlers}
        />
      ) : null}

      {downloadError && <p className="text-xs text-rose-300">{downloadError}</p>}
      {filter.derivativeOfEntryId || filter.focusEntryId || filter.derivedKind ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-200/90">
          <span>
            {filter.focusEntryId
              ? 'Lineage filter: showing source entry'
              : filter.derivativeOfEntryId
                ? 'Lineage filter: showing derived outputs'
                : `Lineage filter: ${filter.derivedKind} only`}
          </span>
          <button
            type="button"
            onClick={() =>
              setFilter(previous => ({
                ...previous,
                derivativeOfEntryId: undefined,
                focusEntryId: undefined,
                derivedKind: undefined,
              }))
            }
            className="rounded-lg border border-violet-500/30 px-2 py-0.5 text-[11px] transition hover:border-violet-400/50 hover:text-violet-100"
          >
            Clear lineage filter
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(['upscale', 'refine', 'variation', 'moire-clean'] as const).map(kind => (
            <button
              key={kind}
              type="button"
              onClick={() =>
                setFilter(previous => ({
                  ...previous,
                  derivedKind: previous.derivedKind === kind ? undefined : kind,
                }))
              }
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                filter.derivedKind === kind
                  ? 'border-violet-400/50 bg-violet-500/15 text-violet-100'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/40 text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }`}
            >
              {kind === 'upscale'
                ? 'Upscaled'
                : kind === 'refine'
                  ? 'Refined'
                  : kind === 'variation'
                    ? 'Variations'
                    : 'Moiré clean'}
            </button>
          ))}
        </div>
      )}
      {requeueStatus ? (
        <StatusToastStrip
          notes={[
            {
              id: 'gallery-requeue',
              text: requeueStatus,
              tone: toneForStatusText(requeueStatus),
            },
          ]}
        />
      ) : null}

      {compareOpen ? (
        <GalleryCompareModal
          open={compareOpen}
          entries={selectedEntries}
          onClose={() => {
            setCompareOpen(false);
            resetCompare();
          }}
          {...compareHandlers}
        />
      ) : null}

      {workflowEntry ? (
        <GalleryWorkflowModal entry={workflowEntry} onClose={() => setWorkflowEntry(null)} />
      ) : null}

      {visibleEntries.length === 0 ? (
        <GalleryEmptyPanel filtered={entries.length > 0} onClearFilters={clearGalleryFilters} />
      ) : (
        <GalleryDisplayGrid
          visibleEntries={visibleEntries}
          lineageGroups={lineageGroups}
          collapsedLineageGroups={collapsedLineageGroups}
          onToggleLineageGroup={toggleLineageGroup}
          layout={layout}
          compact={compact}
          gridClassName={galleryCardGridClass}
          virtualGridClassName={galleryVirtualGridClass}
          renderCard={renderGalleryCard}
        />
      )}

      {hasMoreAll ? (
        <div className="flex justify-center pt-3 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setAllRenderLimit(previous => previous + GALLERY_ALL_RENDER_CHUNK)}
            className="rounded-lg border border-violet-500/40 bg-violet-500/25 px-3 py-1.5 text-[11px] font-medium text-violet-50 backdrop-blur transition hover:border-violet-400/60 hover:bg-violet-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 active:scale-[0.98]"
          >
            Load more ({remainingAll} remaining)
          </button>
        </div>
      ) : null}

      {showPagination && visibleEntries.length > 0 && (
        <GalleryPaginator
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalFiltered}
          pageSize={effectivePageSize}
          onPageChange={setPage}
        />
      )}

      {filter.reviewMode && reviewFocusEntry ? (
        <>
          {galleryEntryViewUrls(reviewFocusEntry)[0] ? (
            <GalleryVisionReviewButton
              imageDataUrl={galleryEntryViewUrls(reviewFocusEntry)[0]!}
              prompt={reviewFocusEntry.prompt}
              onApplyRating={rating => {
                handleReviewRating(reviewFocusEntry, rating);
              }}
            />
          ) : null}
          <GalleryReviewTouchBar
            onRate={rating => {
              handleReviewRating(reviewFocusEntry, rating);
            }}
            onFavorite={() => toggleFavorite(reviewFocusEntry.id)}
            onNext={() => {
              const nextEntry =
                visibleEntries[Math.min(reviewFocusIndex + 1, visibleEntries.length - 1)];
              if (nextEntry) {
                setSelectedIds([nextEntry.id]);
              }
            }}
            onPrev={() => {
              const prevEntry = visibleEntries[Math.max(reviewFocusIndex - 1, 0)];
              if (prevEntry) {
                setSelectedIds([prevEntry.id]);
              }
            }}
          />
        </>
      ) : null}

      <LoraDatasetExportDialog
        open={loraExportOpen}
        onCancel={() => setLoraExportOpen(false)}
        onConfirm={options => {
          setLoraExportOpen(false);
          setRequeueStatus('Building LoRA dataset export…');
          void import('@/lib/gallery-lora-dataset-export')
            .then(({ downloadLoraDatasetZip, selectLoraDatasetEntries }) => {
              const source = loraExportScope === 'selected' ? selectedEntries : entries;
              return downloadLoraDatasetZip(
                selectLoraDatasetEntries(
                  source,
                  loraExportScope === 'selected'
                    ? { selectedIds: selectedEntries.map(entry => entry.id) }
                    : undefined
                ),
                options
              );
            })
            .then(({ count }) => {
              setRequeueStatus(
                count > 0
                  ? `LoRA dataset exported (${count} image/caption pairs, ${options.captionMode}).`
                  : loraExportScope === 'selected'
                    ? 'No eligible images found for the LoRA dataset export.'
                    : 'No favorited or 4–5★ entries found for the LoRA dataset export.'
              );
            });
        }}
      />
    </section>
  );
}
