'use client';

import dynamic from 'next/dynamic';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useGalleryBrowseState } from '@/hooks/useGalleryBrowseState';
import { useGalleryDisplayPlan } from '@/hooks/useGalleryDisplayPlan';
import { useGalleryLightboxBindings } from '@/hooks/useGalleryLightboxBindings';
import { useGalleryPanelActions } from '@/hooks/useGalleryPanelActions';
import { useGalleryPanelRecovery } from '@/hooks/useGalleryPanelRecovery';
import ImageLightbox from '@/components/ui/ImageLightbox';
import {
  startRefineFromGalleryEntry,
  startReeditRefineFromGalleryEntry,
} from '@/lib/improve-output';
import { useComfyUiGallery } from '@/hooks/useComfyUiGallery';
import {
  GalleryCapWarningBanner,
  GalleryPanelHeader,
  GalleryPickDock,
} from '@/components/gallery/GalleryPanelChrome';
import GalleryVisionReviewButton from '@/components/gallery/GalleryVisionReviewButton';
import GalleryCardItem from '@/components/gallery/GalleryCardItem';
import GalleryDisplayGrid from '@/components/gallery/GalleryDisplayGrid';
import GalleryEmptyPanel from '@/components/gallery/GalleryEmptyPanel';
import {
  GALLERY_UPLOAD_ACCEPT,
  runGalleryImageImport,
} from '@/components/gallery/GalleryUploadButton';
import GalleryFiltersBar from '@/components/gallery/GalleryFiltersBar';
import GalleryFailedRecoveryBanner from '@/components/gallery/GalleryFailedRecoveryBanner';
import GalleryReviewBanner from '@/components/gallery/GalleryReviewBanner';
import GalleryExperimentPanel from '@/components/gallery/GalleryExperimentPanel';
import GalleryStatsBar from '@/components/gallery/GalleryStatsBar';
import GalleryReviewTouchBar from '@/components/gallery/GalleryReviewTouchBar';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import GalleryPaginator from '@/components/gallery/GalleryPaginator';
import GalleryDuplicateClustersPanel from '@/components/gallery/GalleryDuplicateClustersPanel';
import GalleryDerivedKindChips from '@/components/gallery/GalleryDerivedKindChips';
import GalleryVisionInbox from '@/components/gallery/GalleryVisionInbox';
import GalleryCapCleanupWizard from '@/components/gallery/GalleryCapCleanupWizard';
import StatusToastStrip from '@/components/ui/StatusToastStrip';
import { assessGalleryCapWarning } from '@/lib/gallery-cap';
import { duplicateDropIds } from '@/lib/gallery-duplicate-clusters';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';
import { useGalleryReview } from '@/hooks/useGalleryReview';
import { useGallerySelection } from '@/hooks/useGallerySelection';
import { useGalleryCompareHandlers } from '@/hooks/useGalleryCompareHandlers';
import { useGalleryPanelLightbox } from '@/hooks/useGalleryPanelLightbox';
import { toneForStatusText } from '@/lib/status-progress';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { computeGalleryStats } from '@/lib/gallery-stats';
import { type ParamExperimentAxis } from '@/lib/param-experiment-queue';
import { useHeldMaxCount } from '@/hooks/useHeldMaxJobs';
import { suggestRatingMutations } from '@/lib/rating-prompt-mutations';
import { loadActiveProjectId, loadPromptProjects } from '@/lib/prompt-projects';
import {
  clearExperimentWinner,
  loadExperimentWinners,
  markExperimentWinner,
} from '@/lib/experiment-winners';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import {
  galleryEntryHeroPreviewUrl,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryViewUrl,
  galleryEntryStripThumbUrls,
  galleryEntryViewUrls,
  GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  isGalleryStoreReady,
  type ComfyGalleryEntry,
  type GallerySlideshowIntervalMs,
} from '@/lib/comfyui-gallery';
import { galleryPickActionLabel, parseGalleryPickTarget } from '@/lib/gallery-handoff';
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
  const pathname = usePathname();
  const browsePaginationEnabled = showFilters && !compact && !limit;
  const workspaceMode = useWorkspaceMode();
  const leanGallery = isLeanWorkspaceMode(workspaceMode) && showFilters && !compact;

  const {
    storeReady,
    entries,
    filteredEntries,
    filter,
    setFilter,
    tools,
    models,
    userTags,
    customGroups,
    removeEntry,
    removeEntries,
    toggleFavorite,
    setFavorites,
    setReviewRatings,
    setUserTags,
    setCustomGroups,
    renameCustomGroup,
    deleteCustomGroup,
    setProjectIds,
    clearAll,
    refreshPending,
    primaryThumbUrl: _primaryThumbUrl,
    setReviewRating,
    embeddingSearchActive,
    similarSearchActive,
    embeddingSearchLoading,
    similarSearchLoading,
    embeddingSearchUnavailable,
  } = useComfyUiGallery();

  useEffect(() => {
    if (!leanGallery) {
      return;
    }
    // Keep review mode in Simple — only strip advanced semantic/vision filters.
    setFilter(previous => ({
      ...previous,
      semanticSearch: undefined,
      similarToEntryId: undefined,
      similarMode: undefined,
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
  const [compareOpen, setCompareOpen] = useState(false);
  // Stable reference for GalleryExperimentPanel's onCompare prop — that panel is memo()-wrapped,
  // and passing a fresh arrow function inline every render was defeating the memo (see below).
  const openCompare = useCallback(() => setCompareOpen(true), []);
  const [capWizardOpen, setCapWizardOpen] = useState(false);
  const [visionInboxOpen, setVisionInboxOpen] = useState(false);
  const [visionInboxSkipIds, setVisionInboxSkipIds] = useState<Set<string>>(() => new Set());
  const [loraExportOpen, setLoraExportOpen] = useState(false);
  const [loraExportScope, setLoraExportScope] = useState<'favorites' | 'selected'>('favorites');
  const [workflowEntry, setWorkflowEntry] = useState<ComfyGalleryEntry | null>(null);
  const [collapsedLineageGroups, setCollapsedLineageGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedExperimentGroups, setCollapsedExperimentGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [paramAxis, setParamAxis] = useState<ParamExperimentAxis>('cfg');
  const [projects] = useState(() => loadPromptProjects());
  const [galleryEntriesSettled, setGalleryEntriesSettled] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
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

  const bulkEnabled = showFilters && !compact;
  /** Full experiment/export menus stay advanced; lean still gets select + compare. */
  const leanBulkEnabled = bulkEnabled;
  const paginationEnabled = browsePaginationEnabled;

  const {
    page,
    setPage,
    sort,
    setSort,
    pageSize,
    setPageSize,
    layout,
    setLayout,
    density,
    setDensity,
    projectFilterId,
    setProjectFilterId,
    experimentWinners,
    setExperimentWinners,
    clearGalleryFilters,
    pageClamp,
  } = useGalleryBrowseState({
    browsePaginationEnabled,
    pathname,
    showFilters,
    filter,
    setFilter,
    paginationEnabled,
    storeReady,
    galleryEntriesSettled,
  });

  const importDroppedImages = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setUploadingImages(true);
    try {
      const result = await runGalleryImageImport(files);
      if (result.failed > 0 && result.imported === 0) {
        setRequeueStatus(result.errors[0] ?? 'Could not import those images.');
      }
    } finally {
      setUploadingImages(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('upload') !== '1') {
      return;
    }
    uploadInputRef.current?.click();
    const url = new URL(window.location.href);
    if (url.searchParams.has('upload')) {
      url.searchParams.delete('upload');
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`
      );
    }
  }, [searchParams]);

  const galleryStats = useMemo(() => computeGalleryStats(entries), [entries]);
  const galleryCapWarning = useMemo(
    () => assessGalleryCapWarning(entries.length, MAX_GALLERY_ENTRIES),
    [entries.length]
  );
  const activeJobs = galleryStats.pending + galleryStats.running;

  const {
    sortedSource,
    experimentGroups,
    visibleEntries,
    totalPages,
    currentPage,
    totalFiltered,
    effectivePageSize,
    showPagination,
    lineageGroups,
    duplicateClusters,
    duplicateEntriesById,
    capEvictionPreview,
    showVisionInbox,
    visionInboxQueue,
    galleryCardGridClass,
    galleryVirtualGridClass,
  } = useGalleryDisplayPlan({
    showFilters,
    filteredEntries,
    entries,
    filter,
    paginationEnabled,
    sort,
    page,
    pageSize,
    limit,
    pageClamp,
    layout,
    density,
    compact,
    capWizardOpen,
    visionInboxOpen,
    visionInboxSkipIds,
  });

  const {
    lightbox,
    setLightbox,
    slideshowPlaying,
    setSlideshowPlaying,
    slideshowFullscreen,
    setSlideshowFullscreen,
    slideshowIntervalMs,
    setSlideshowIntervalMs,
    slideshowTransition,
    setSlideshowTransition,
    lightboxEntries,
    lightboxEntriesRef,
    lightboxPlaylist,
    applyPlaylistState,
    resolvedLightbox,
    openEntryLightbox,
    openLightboxForEntryId,
    prefetchLightboxForEntryId,
    startSlideshow,
    startFullscreenSlideshow,
    closeLightbox,
  } = useGalleryPanelLightbox({
    sortedSource,
    storeReady,
    entries,
    searchParams,
  });

  useEffect(() => {
    if (!storeReady) {
      return;
    }
    if (entries.length > 0) {
      scheduleAfterCommit(() => {
        setGalleryEntriesSettled(true);
      });
      return;
    }
    if (!isGalleryStoreReady()) {
      return;
    }
    let cancelled = false;
    const frameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) {
          setGalleryEntriesSettled(true);
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [storeReady, entries.length]);

  const { retryFailedEntries, exportCapKeepers } = useGalleryPanelRecovery({
    entries,
    setRequeueStatus,
  });

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
    keyboardEnabled: !lightbox,
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

  const toggleExperimentGroup = useCallback((groupId: string) => {
    setCollapsedExperimentGroups(previous => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const { onDownloadImage, lightboxSlideChrome } = useGalleryLightboxBindings({
    resolvedLightbox,
    lightboxEntries,
    lightboxEntriesRef,
    entries,
    entryIdsWithDerivatives,
    selectedIdSet,
    selectedIds,
    router,
    handleReviewRating,
    toggleFavorite,
    toggleSelected,
    removeEntry,
    setRequeueStatus,
    setCompareOpen,
    setFilter,
    applyPlaylistState,
  });

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
    setReviewRatings,
    setUserTags,
    setCustomGroups,
    renameCustomGroup,
    deleteCustomGroup,
    customGroups,
    paramAxis,
    filter,
    setLoraExportScope,
    setLoraExportOpen,
  });

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
        previewUrl={galleryEntryHeroPreviewUrl(entry)}
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
        leanActions={leanGallery}
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
      leanGallery,
      pickFor,
      reviewFocusEntry?.id,
      selectedIdSet,
    ]
  );

  if (entries.length === 0 && !storeReady) {
    return <GalleryPanelSkeleton showFilters={showFilters} compact={compact} />;
  }

  return (
    <section
      className="space-y-6"
      onDragOver={event => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
        }
      }}
      onDrop={event => {
        const files = [...event.dataTransfer.files];
        if (files.length === 0) {
          return;
        }
        event.preventDefault();
        void importDroppedImages(files);
      }}
    >
      <input
        ref={uploadInputRef}
        type="file"
        accept={GALLERY_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void importDroppedImages(files);
        }}
      />
      <ImageLightbox
        state={resolvedLightbox}
        onClose={closeLightbox}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? {
                  ...previous,
                  index,
                  title: lightboxPlaylist.titles[index] ?? previous.title,
                }
              : previous
          )
        }
        onDownloadImage={onDownloadImage}
        slideChrome={lightboxSlideChrome}
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
      {showHeader ? (
        <GalleryPanelHeader
          leanGallery={leanGallery}
          activeJobs={activeJobs}
          entriesLength={entries.length}
          compact={compact}
          limit={limit}
          onRefreshPending={() => void refreshPending()}
          onClearAll={clearAll}
          onUpload={() => uploadInputRef.current?.click()}
          uploading={uploadingImages}
        />
      ) : null}

      {requeueStatus ? (
        <div data-testid="gallery-requeue-status">
          <StatusToastStrip
            notes={[
              {
                id: 'gallery-requeue',
                text: requeueStatus,
                tone: toneForStatusText(requeueStatus),
              },
            ]}
          />
        </div>
      ) : null}

      {pickFor ? <GalleryPickDock pickFor={pickFor} /> : null}

      {galleryCapWarning.message ? (
        <GalleryCapWarningBanner
          level={galleryCapWarning.level}
          message={galleryCapWarning.message}
          onShowAtRisk={() =>
            setFilter(previous => ({
              ...previous,
              atRiskOnly: true,
              favoritesOnly: undefined,
              minRating: undefined,
            }))
          }
          onExportKeepers={exportCapKeepers}
          onOpenCleanup={() => setCapWizardOpen(true)}
        />
      ) : null}

      {showFilters && capWizardOpen && capEvictionPreview.length > 0 ? (
        <GalleryCapCleanupWizard
          evicted={capEvictionPreview}
          max={MAX_GALLERY_ENTRIES}
          total={entries.length}
          onShowAtRisk={() => {
            setFilter(previous => ({
              ...previous,
              atRiskOnly: true,
              favoritesOnly: undefined,
              minRating: undefined,
            }));
            setCapWizardOpen(false);
          }}
          onExportKeepers={exportCapKeepers}
          onDeleteEvicted={() => {
            if (
              window.confirm(
                `Delete ${capEvictionPreview.length} at-risk gallery entries? Keepers stay.`
              )
            ) {
              removeEntries(capEvictionPreview.map(entry => entry.id));
              setCapWizardOpen(false);
            }
          }}
          onFavoriteEvicted={() => {
            setFavorites(
              capEvictionPreview.map(entry => entry.id),
              true
            );
            setCapWizardOpen(false);
          }}
          onClose={() => setCapWizardOpen(false)}
        />
      ) : null}

      {showFilters && filter.duplicatesOnly && duplicateClusters.length > 0 ? (
        <GalleryDuplicateClustersPanel
          clusters={duplicateClusters}
          entriesById={duplicateEntriesById ?? new Map()}
          onShowCluster={ids => {
            setSelectedIds(ids);
            setFilter(previous => ({ ...previous, duplicatesOnly: true }));
          }}
          onKeepHighest={cluster => {
            if (cluster.dropIds.length === 0) {
              return;
            }
            if (window.confirm(`Delete ${cluster.dropIds.length} duplicate stills?`)) {
              removeEntries(cluster.dropIds);
            }
          }}
          onKeepAllHighest={() => {
            const dropIds = duplicateDropIds(duplicateClusters);
            if (dropIds.length === 0) {
              return;
            }
            if (
              window.confirm(
                `Delete ${dropIds.length} duplicate stills, keeping the highest-rated in each cluster?`
              )
            ) {
              removeEntries(dropIds);
            }
          }}
          onCompare={ids => {
            setSelectedIds(ids);
            setCompareOpen(true);
          }}
        />
      ) : null}

      {showVisionInbox ? (
        <GalleryVisionInbox
          queue={visionInboxQueue}
          previewUrl={galleryEntryPrimaryViewUrl}
          onApplyRating={(entryId, rating) => {
            setReviewRating(entryId, rating);
            setVisionInboxSkipIds(previous => new Set(previous).add(entryId));
          }}
          onSkip={() => {
            const next = visionInboxQueue[0];
            if (next) {
              setVisionInboxSkipIds(previous => new Set(previous).add(next.id));
            }
          }}
          onClose={() => {
            setVisionInboxOpen(false);
            setFilter(previous => ({ ...previous, needsVisionReview: undefined }));
          }}
        />
      ) : null}

      {showFilters && entries.length > 0 ? (
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
          models={models}
          userTags={userTags}
          customGroups={customGroups}
          onRenameCustomGroup={(from, to) => {
            const changed = renameCustomGroup(from, to);
            if (changed > 0) {
              setRequeueStatus(`Renamed group to ${to.trim()} (${changed} items)`);
            }
          }}
          onDeleteCustomGroup={name => {
            const changed = deleteCustomGroup(name);
            if (changed > 0) {
              setRequeueStatus(`Cleared group “${name}” from ${changed} items`);
            }
          }}
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
          density={density}
          setDensity={setDensity}
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

      {filter.status === 'error' ? (
        <GalleryFailedRecoveryBanner
          failedEntries={visibleEntries.filter(entry => entry.status === 'error')}
          selectedFailedCount={selectedEntries.filter(entry => entry.status === 'error').length}
          onRetrySelected={mode =>
            retryFailedEntries(
              selectedEntries.filter(entry => entry.status === 'error'),
              mode
            )
          }
          onRetryAllVisible={mode =>
            retryFailedEntries(
              visibleEntries.filter(entry => entry.status === 'error'),
              mode
            )
          }
          onRetryCluster={(clusterEntries, mode) => retryFailedEntries(clusterEntries, mode)}
          onClearFailedFilter={() => setFilter(previous => ({ ...previous, status: 'all' }))}
        />
      ) : null}

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
        <div
          data-testid="gallery-multiselect-tip"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--accent-border)]/60 bg-[var(--accent-muted)]/40 px-4 py-3 text-xs text-[var(--accent-text)]"
        >
          <span>
            {leanGallery
              ? 'Select cards → Compare, Collect, Group, or Queue. Tip: Shift-click for a range.'
              : 'Select cards to compare, export, queue, group, assign projects, or remove.'}
          </span>
          <div className="flex items-center gap-2">
            {!leanGallery ? (
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
            ) : null}
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
          onCompare={openCompare}
          {...bulkExperimentHandlers}
        />
      ) : null}

      {downloadError && <p className="text-xs ui-status-danger">{downloadError}</p>}
      {filter.characterId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-xs text-[var(--accent-text)]">
          <span>Character filter: this cast member only</span>
          <button
            type="button"
            onClick={() => setFilter(previous => ({ ...previous, characterId: undefined }))}
            className="rounded-lg border border-[var(--accent-border)] px-2 py-0.5 text-[11px] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)]"
          >
            Clear
          </button>
        </div>
      ) : null}
      <GalleryDerivedKindChips filter={filter} setFilter={setFilter} />

      {compareOpen ? (
        <GalleryCompareModal
          open={compareOpen}
          entries={selectedEntries}
          onClose={() => {
            setCompareOpen(false);
            resetCompare();
          }}
          onOpenPreview={entry => {
            setCompareOpen(false);
            openEntryLightbox(entry, 0);
          }}
          {...compareHandlers}
        />
      ) : null}

      {workflowEntry ? (
        <GalleryWorkflowModal entry={workflowEntry} onClose={() => setWorkflowEntry(null)} />
      ) : null}

      {visibleEntries.length === 0 ? (
        <GalleryEmptyPanel
          filtered={entries.length > 0}
          onClearFilters={clearGalleryFilters}
          onUpload={() => uploadInputRef.current?.click()}
        />
      ) : (
        <GalleryDisplayGrid
          visibleEntries={visibleEntries}
          lineageGroups={lineageGroups}
          collapsedLineageGroups={collapsedLineageGroups}
          onToggleLineageGroup={toggleLineageGroup}
          experimentGroups={experimentGroups}
          collapsedExperimentGroups={collapsedExperimentGroups}
          onToggleExperimentGroup={toggleExperimentGroup}
          experimentWinners={experimentWinners}
          onCrownExperiment={(groupId, entryId) => {
            if (experimentWinners[groupId]?.entryId === entryId) {
              clearExperimentWinner(groupId);
            } else {
              markExperimentWinner(groupId, entryId);
              setReviewRatings([entryId], 5);
            }
            setExperimentWinners(loadExperimentWinners());
          }}
          onCompareExperiment={entriesForCompare => {
            setSelectedIds(entriesForCompare.slice(0, 4).map(entry => entry.id));
            setCompareOpen(true);
          }}
          onRequeueExperiment={entriesForRequeue => {
            setRequeueStatus(`Re-queueing ${entriesForRequeue.length} experiment variant(s)…`);
            void import('@/lib/comfyui-requeue')
              .then(({ requeueComfyJobs }) =>
                requeueComfyJobs(
                  entriesForRequeue.map(entry => ({
                    prompt: entry.prompt,
                    negativePrompt: entry.negativePrompt,
                    tool: entry.tool,
                    model: entry.model,
                    queueParams: entry.queueParams,
                    newSeed: true,
                    parentGalleryEntryId: entry.id,
                    derivedKind: 'variation' as const,
                  })),
                  setRequeueStatus
                )
              )
              .then(({ queued, failed }) => {
                toastBulkQueueSummary({
                  label: 'Experiment re-queue finished',
                  queued,
                  failed,
                });
              });
          }}
          onWinnerUpscale={entry => galleryCardActionsRef.current.upscale(entry.id, 'final')}
          onWinnerRefine={entry => startRefineFromGalleryEntry(entry)}
          onWinnerContinue={entry => startReeditRefineFromGalleryEntry(entry)}
          layout={layout}
          density={density}
          compact={compact}
          gridClassName={galleryCardGridClass}
          virtualGridClassName={galleryVirtualGridClass}
          renderCard={renderGalleryCard}
        />
      )}

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
