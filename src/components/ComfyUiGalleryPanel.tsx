'use client';

import { useEffect, useMemo, useRef, useLayoutEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useGalleryBrowseState } from '@/hooks/useGalleryBrowseState';
import { useGalleryCardRenderer } from '@/hooks/useGalleryCardRenderer';
import { useGalleryDisplayPlan } from '@/hooks/useGalleryDisplayPlan';
import { useGalleryExperimentGridHandlers } from '@/hooks/useGalleryExperimentGridHandlers';
import { useGalleryLightboxBindings } from '@/hooks/useGalleryLightboxBindings';
import { useGalleryPanelActions } from '@/hooks/useGalleryPanelActions';
import { useGalleryPanelRecovery } from '@/hooks/useGalleryPanelRecovery';
import { useGalleryPanelUiState } from '@/hooks/useGalleryPanelUiState';
import { useComfyUiGallery } from '@/hooks/useComfyUiGallery';
import GalleryPanelBody from '@/components/gallery/GalleryPanelBody';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import { assessGalleryCapWarning } from '@/lib/gallery-cap';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';
import { useGalleryReview } from '@/hooks/useGalleryReview';
import { useGallerySelection } from '@/hooks/useGallerySelection';
import { useGalleryCompareHandlers } from '@/hooks/useGalleryCompareHandlers';
import { useGalleryPanelLightbox } from '@/hooks/useGalleryPanelLightbox';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { computeGalleryStats } from '@/lib/gallery-stats';
import { useHeldMaxCount } from '@/hooks/useHeldMaxJobs';
import { loadActiveProjectId, loadPromptProjects } from '@/lib/prompt-projects';
import { isGalleryStoreReady, type ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { parseGalleryPickTarget } from '@/lib/gallery-handoff';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

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
    setFilter(previous => ({
      ...previous,
      semanticSearch: undefined,
      similarToEntryId: undefined,
      similarMode: undefined,
      visionTagsOnly: undefined,
    }));
  }, [leanGallery, setFilter]);

  const searchParams = useSearchParams();
  const pickFor = useMemo(
    () => parseGalleryPickTarget(searchParams.get('pickFor')),
    [searchParams]
  );

  const router = useRouter();
  const heldMaxCount = useHeldMaxCount();
  const [projects] = useState(() => loadPromptProjects());

  const { galleryEntriesSettled, setGalleryEntriesSettled, ...ui } =
    useGalleryPanelUiState(searchParams);

  const bulkEnabled = showFilters && !compact;
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

  const galleryStats = useMemo(() => computeGalleryStats(entries), [entries]);
  const galleryCapWarning = useMemo(
    () => assessGalleryCapWarning(entries.length, MAX_GALLERY_ENTRIES),
    [entries.length]
  );
  const activeJobs = galleryStats.pending + galleryStats.running;

  const displayPlan = useGalleryDisplayPlan({
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
    capWizardOpen: ui.capWizardOpen,
    visionInboxOpen: ui.visionInboxOpen,
    visionInboxSkipIds: ui.visionInboxSkipIds,
  });

  const lightboxState = useGalleryPanelLightbox({
    sortedSource: displayPlan.sortedSource,
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
  }, [storeReady, entries.length, setGalleryEntriesSettled]);

  const { retryFailedEntries, exportCapKeepers } = useGalleryPanelRecovery({
    entries,
    setRequeueStatus: ui.setRequeueStatus,
  });

  const selection = useGallerySelection(displayPlan.visibleEntries);

  const { compareHandlers, resetCompare } = useGalleryCompareHandlers({
    selectedEntries: selection.selectedEntries,
    setFavorites,
    setReviewRating,
    toggleFavorite,
  });

  const review = useGalleryReview({
    filter,
    visibleEntries: displayPlan.visibleEntries,
    selectedIds: selection.selectedIds,
    setSelectedIds: selection.setSelectedIds,
    selectedIdSet: selection.selectedIdSet,
    setReviewRating,
    toggleFavorite,
    onStatusMessage: ui.setRequeueStatus,
    keyboardEnabled: !lightboxState.lightbox,
  });

  const activeProjectId = useMemo(() => loadActiveProjectId(), []);

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

  const { onDownloadImage, lightboxSlideChrome } = useGalleryLightboxBindings({
    resolvedLightbox: lightboxState.resolvedLightbox,
    lightboxEntries: lightboxState.lightboxEntries,
    lightboxEntriesRef: lightboxState.lightboxEntriesRef,
    entries,
    entryIdsWithDerivatives,
    selectedIdSet: selection.selectedIdSet,
    selectedIds: selection.selectedIds,
    router,
    handleReviewRating: review.handleReviewRating,
    toggleFavorite,
    toggleSelected: selection.toggleSelected,
    removeEntry,
    setRequeueStatus: ui.setRequeueStatus,
    setCompareOpen: ui.setCompareOpen,
    setFilter,
    applyPlaylistState: lightboxState.applyPlaylistState,
  });

  const { galleryCardActionsRef, bulkExperimentHandlers } = useGalleryPanelActions({
    entriesRef,
    toggleSelected: selection.toggleSelected,
    removeEntry,
    toggleFavorite,
    setRequeueStatus: ui.setRequeueStatus,
    setDownloadError: ui.setDownloadError,
    setFilter,
    setWorkflowEntry: ui.setWorkflowEntry,
    openLightboxForEntryId: lightboxState.openLightboxForEntryId,
    prefetchLightboxForEntryId: lightboxState.prefetchLightboxForEntryId,
    handleReviewRating: review.handleReviewRating,
    pickFor,
    router,
    selectedIds: selection.selectedIds,
    selectedEntries: selection.selectedEntries,
    setSelectedIds: selection.setSelectedIds,
    setProjectIds,
    removeEntries,
    setFavorites,
    setReviewRatings,
    setUserTags,
    setCustomGroups,
    renameCustomGroup,
    deleteCustomGroup,
    customGroups,
    paramAxis: ui.paramAxis,
    filter,
    setLoraExportScope: ui.setLoraExportScope,
    setLoraExportOpen: ui.setLoraExportOpen,
  });

  useLayoutEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useLayoutEffect(() => {
    visibleEntriesRef.current = displayPlan.visibleEntries;
  }, [displayPlan.visibleEntries]);

  const renderGalleryCard = useGalleryCardRenderer({
    galleryCardActionsRef,
    compact,
    layout,
    bulkEnabled,
    pickFor,
    selectedIdSet: selection.selectedIdSet,
    filter,
    reviewFocusEntry: review.reviewFocusEntry,
    entryIdsWithDerivatives,
    leanGallery,
  });

  const experimentGridHandlers = useGalleryExperimentGridHandlers({
    experimentWinners,
    setExperimentWinners,
    setReviewRatings,
    setSelectedIds: selection.setSelectedIds,
    setCompareOpen: ui.setCompareOpen,
    setRequeueStatus: ui.setRequeueStatus,
    galleryCardActionsRef,
  });

  if (entries.length === 0 && !storeReady) {
    return <GalleryPanelSkeleton showFilters={showFilters} compact={compact} />;
  }

  return (
    <GalleryPanelBody
      showHeader={showHeader}
      showFilters={showFilters}
      compact={compact}
      limit={limit}
      leanGallery={leanGallery}
      leanBulkEnabled={leanBulkEnabled}
      bulkEnabled={bulkEnabled}
      paginationEnabled={paginationEnabled}
      pickFor={pickFor}
      uploadInputRef={ui.uploadInputRef}
      importDroppedImages={ui.importDroppedImages}
      lightbox={{
        resolvedLightbox: lightboxState.resolvedLightbox,
        closeLightbox: lightboxState.closeLightbox,
        onIndexChange: index =>
          lightboxState.setLightbox(previous =>
            previous
              ? {
                  ...previous,
                  index,
                  title: lightboxState.lightboxPlaylist.titles[index] ?? previous.title,
                }
              : previous
          ),
        onDownloadImage,
        slideChrome: lightboxSlideChrome,
        slideshowPlaying: lightboxState.slideshowPlaying,
        slideshowIntervalMs: lightboxState.slideshowIntervalMs,
        slideshowTransition: lightboxState.slideshowTransition,
        slideshowFullscreen: lightboxState.slideshowFullscreen,
        setSlideshowPlaying: lightboxState.setSlideshowPlaying,
        setSlideshowIntervalMs: lightboxState.setSlideshowIntervalMs,
        setSlideshowTransition: lightboxState.setSlideshowTransition,
        setSlideshowFullscreen: lightboxState.setSlideshowFullscreen,
        playlistLength: lightboxState.lightboxPlaylist.images.length,
      }}
      header={{
        activeJobs,
        entriesLength: entries.length,
        uploadingImages: ui.uploadingImages,
        onRefreshPending: () => void refreshPending(),
        onClearAll: clearAll,
      }}
      requeueStatus={ui.requeueStatus}
      galleryCapWarning={galleryCapWarning}
      capWizardOpen={ui.capWizardOpen}
      setCapWizardOpen={ui.setCapWizardOpen}
      capEvictionPreview={displayPlan.capEvictionPreview}
      exportCapKeepers={exportCapKeepers}
      filter={filter}
      setFilter={setFilter}
      duplicateClusters={displayPlan.duplicateClusters}
      duplicateEntriesById={displayPlan.duplicateEntriesById ?? undefined}
      setSelectedIds={selection.setSelectedIds}
      setCompareOpen={ui.setCompareOpen}
      removeEntries={removeEntries}
      showVisionInbox={displayPlan.showVisionInbox}
      visionInboxQueue={displayPlan.visionInboxQueue}
      setReviewRating={setReviewRating}
      setVisionInboxSkipIds={ui.setVisionInboxSkipIds}
      setVisionInboxOpen={ui.setVisionInboxOpen}
      galleryStats={galleryStats}
      heldMaxCount={heldMaxCount}
      activeProjectId={activeProjectId}
      projectFilterId={projectFilterId}
      setProjectFilterId={setProjectFilterId}
      refreshPending={refreshPending}
      tools={tools}
      models={models}
      userTags={userTags}
      customGroups={customGroups}
      renameCustomGroup={renameCustomGroup}
      deleteCustomGroup={deleteCustomGroup}
      setRequeueStatus={ui.setRequeueStatus}
      projects={projects}
      sort={sort}
      setSort={setSort}
      pageSize={pageSize}
      setPageSize={setPageSize}
      embeddingSearchActive={embeddingSearchActive}
      embeddingSearchLoading={embeddingSearchLoading}
      similarSearchLoading={similarSearchLoading}
      embeddingSearchUnavailable={embeddingSearchUnavailable}
      layout={layout}
      setLayout={setLayout}
      density={density}
      setDensity={setDensity}
      totalFiltered={displayPlan.totalFiltered}
      currentPage={displayPlan.currentPage}
      totalPages={displayPlan.totalPages}
      showPagination={displayPlan.showPagination}
      startSlideshow={lightboxState.startSlideshow}
      startFullscreenSlideshow={lightboxState.startFullscreenSlideshow}
      visibleEntries={displayPlan.visibleEntries}
      selectedEntries={selection.selectedEntries}
      selectedIds={selection.selectedIds}
      retryFailedEntries={retryFailedEntries}
      setPage={setPage}
      effectivePageSize={displayPlan.effectivePageSize}
      selectAllVisible={selection.selectAllVisible}
      setLoraExportScope={ui.setLoraExportScope}
      setLoraExportOpen={ui.setLoraExportOpen}
      openCompare={ui.openCompare}
      paramAxis={ui.paramAxis}
      setParamAxis={ui.setParamAxis}
      similarSearchActive={similarSearchActive}
      clearSelection={selection.clearSelection}
      bulkExperimentHandlers={bulkExperimentHandlers}
      downloadError={ui.downloadError}
      compareOpen={ui.compareOpen}
      compareHandlers={compareHandlers}
      resetCompare={resetCompare}
      openEntryLightbox={lightboxState.openEntryLightbox}
      workflowEntry={ui.workflowEntry}
      setWorkflowEntry={ui.setWorkflowEntry}
      clearGalleryFilters={clearGalleryFilters}
      entries={entries}
      lineageGroups={displayPlan.lineageGroups}
      collapsedLineageGroups={ui.collapsedLineageGroups}
      toggleLineageGroup={ui.toggleLineageGroup}
      experimentGroups={displayPlan.experimentGroups}
      collapsedExperimentGroups={ui.collapsedExperimentGroups}
      toggleExperimentGroup={ui.toggleExperimentGroup}
      experimentWinners={experimentWinners}
      experimentGridHandlers={experimentGridHandlers}
      galleryCardGridClass={displayPlan.galleryCardGridClass}
      galleryVirtualGridClass={displayPlan.galleryVirtualGridClass}
      renderGalleryCard={renderGalleryCard}
      reviewFocusEntry={review.reviewFocusEntry}
      reviewFocusIndex={review.reviewFocusIndex}
      handleReviewRating={review.handleReviewRating}
      toggleFavorite={toggleFavorite}
      loraExportOpen={ui.loraExportOpen}
      loraExportScope={ui.loraExportScope}
      setFavorites={setFavorites}
    />
  );
}
