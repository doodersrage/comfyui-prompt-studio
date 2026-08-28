'use client';

import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import ImageLightbox from '@/components/ui/ImageLightbox';
import type { GalleryComparePanelProps } from '@/components/GalleryComparePanel';
import { GALLERY_UPLOAD_ACCEPT } from '@/components/gallery/GalleryUploadButton';
import GalleryPanelBulkSection from '@/components/gallery/GalleryPanelBulkSection';
import GalleryPanelFiltersSection from '@/components/gallery/GalleryPanelFiltersSection';
import GalleryPanelGridSection from '@/components/gallery/GalleryPanelGridSection';
import GalleryPanelReviewSlot from '@/components/gallery/GalleryPanelReviewSlot';
import GalleryPanelCapSection from '@/components/gallery/GalleryPanelCapSection';
import GalleryPanelModalsSlot from '@/components/gallery/GalleryPanelModalsSlot';
import GalleryDuplicateClustersPanel from '@/components/gallery/GalleryDuplicateClustersPanel';
import GalleryDerivedKindChips from '@/components/gallery/GalleryDerivedKindChips';
import GalleryVisionInbox from '@/components/gallery/GalleryVisionInbox';
import { GalleryPanelHeader, GalleryPickDock } from '@/components/gallery/GalleryPanelChrome';
import StatusToastStrip from '@/components/ui/StatusToastStrip';
import { useGalleryLoraExportConfirm } from '@/hooks/useGalleryLoraExportConfirm';
import type { GalleryBulkExperimentHandlers } from '@/hooks/useGalleryPanelActions';
import type { GalleryHandoffPayload } from '@/lib/gallery-handoff';
import type {
  ComfyGalleryEntry,
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
  GallerySlideshowIntervalMs,
  GallerySlideshowTransition,
} from '@/lib/comfyui-gallery';
import {
  galleryEntryPrimaryViewUrl,
  GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
} from '@/lib/comfyui-gallery';
import type { ParamExperimentAxis } from '@/lib/param-experiment-queue';
import type { PromptProject } from '@/lib/prompt-projects';
import type { GalleryStats } from '@/lib/gallery-stats';
import type { GalleryDuplicateCluster } from '@/lib/gallery-duplicate-clusters';
import type { ExperimentWinnerRecord } from '@/lib/experiment-winners';
import type { ExperimentGroup } from '@/lib/experiment-groups';
import { buildGalleryLineageGroups } from '@/lib/gallery-lineage-groups';
import type {
  ImageLightboxSlideChrome,
  ImageLightboxState,
} from '@/components/ui/image-lightbox/types';
import { toneForStatusText } from '@/lib/status-progress';
import type { GalleryCapWarningLevel } from '@/lib/gallery-cap';
import { duplicateDropIds } from '@/lib/gallery-duplicate-clusters';
import type { GalleryDensity } from '@/lib/gallery-density';

export type GalleryPanelLightboxSlotProps = {
  resolvedLightbox: ImageLightboxState | null;
  closeLightbox: () => void;
  onIndexChange: (index: number) => void;
  onDownloadImage: ((index: number) => Promise<void>) | undefined;
  slideChrome: ImageLightboxSlideChrome | null;
  slideshowPlaying: boolean;
  slideshowIntervalMs: GallerySlideshowIntervalMs;
  slideshowTransition: GallerySlideshowTransition;
  slideshowFullscreen: boolean;
  setSlideshowPlaying: (playing: boolean) => void;
  setSlideshowIntervalMs: (ms: GallerySlideshowIntervalMs) => void;
  setSlideshowTransition: (transition: GallerySlideshowTransition) => void;
  setSlideshowFullscreen: (fullscreen: boolean) => void;
  playlistLength: number;
};

export type GalleryPanelBodyProps = {
  showHeader: boolean;
  showFilters: boolean;
  compact: boolean;
  limit?: number;
  leanGallery: boolean;
  leanBulkEnabled: boolean;
  bulkEnabled: boolean;
  paginationEnabled: boolean;
  pickFor: GalleryHandoffPayload['target'] | null;
  uploadInputRef: RefObject<HTMLInputElement | null>;
  importDroppedImages: (files: File[]) => Promise<void>;
  lightbox: GalleryPanelLightboxSlotProps;
  header: {
    activeJobs: number;
    entriesLength: number;
    uploadingImages: boolean;
    onRefreshPending: () => void;
    onClearAll: () => void;
  };
  requeueStatus: string | null;
  galleryCapWarning: { level: GalleryCapWarningLevel; message: string | null };
  capWizardOpen: boolean;
  setCapWizardOpen: (open: boolean) => void;
  capEvictionPreview: ComfyGalleryEntry[];
  exportCapKeepers: () => void;
  filter: ComfyGalleryFilter;
  setFilter: (
    patch: Partial<ComfyGalleryFilter> | ((previous: ComfyGalleryFilter) => ComfyGalleryFilter)
  ) => void;
  duplicateClusters: GalleryDuplicateCluster[];
  duplicateEntriesById: Map<string, ComfyGalleryEntry> | undefined;
  setSelectedIds: (ids: string[]) => void;
  setCompareOpen: (open: boolean) => void;
  removeEntries: (ids: string[]) => void;
  showVisionInbox: boolean;
  visionInboxQueue: ComfyGalleryEntry[];
  setReviewRating: (entryId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  setVisionInboxSkipIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setVisionInboxOpen: (open: boolean) => void;
  galleryStats: GalleryStats;
  heldMaxCount: number;
  activeProjectId: string | undefined;
  projectFilterId: string;
  setProjectFilterId: Dispatch<SetStateAction<string>>;
  refreshPending: () => Promise<void>;
  tools: string[];
  models: string[];
  userTags: string[];
  customGroups: string[];
  renameCustomGroup: (from: string, to: string) => number;
  deleteCustomGroup: (name: string) => number;
  setRequeueStatus: (status: string | null) => void;
  projects: PromptProject[];
  sort: ComfyGallerySort;
  setSort: (sort: ComfyGallerySort) => void;
  pageSize: GalleryPageSize;
  setPageSize: (size: GalleryPageSize) => void;
  embeddingSearchActive: boolean;
  embeddingSearchLoading: boolean;
  similarSearchLoading: boolean;
  embeddingSearchUnavailable: boolean;
  layout: GalleryLayoutMode;
  setLayout: (layout: GalleryLayoutMode) => void;
  density: GalleryDensity;
  setDensity: (density: GalleryDensity) => void;
  totalFiltered: number;
  currentPage: number;
  totalPages: number;
  showPagination: boolean;
  startSlideshow: () => void;
  startFullscreenSlideshow: () => void;
  visibleEntries: ComfyGalleryEntry[];
  selectedEntries: ComfyGalleryEntry[];
  selectedIds: string[];
  retryFailedEntries: (entries: ComfyGalleryEntry[], mode?: 'same' | 'new' | 'exact') => void;
  setPage: (page: number) => void;
  effectivePageSize: number;
  selectAllVisible: () => void;
  setLoraExportScope: (scope: 'favorites' | 'selected') => void;
  setLoraExportOpen: (open: boolean) => void;
  openCompare: () => void;
  paramAxis: ParamExperimentAxis;
  setParamAxis: (axis: ParamExperimentAxis) => void;
  similarSearchActive: boolean;
  clearSelection: () => void;
  bulkExperimentHandlers: GalleryBulkExperimentHandlers;
  downloadError: string | null;
  compareOpen: boolean;
  compareHandlers: Omit<GalleryComparePanelProps, 'entries' | 'onClose'>;
  resetCompare: () => void;
  openEntryLightbox: (entry: ComfyGalleryEntry, index: number) => void;
  workflowEntry: ComfyGalleryEntry | null;
  setWorkflowEntry: (entry: ComfyGalleryEntry | null) => void;
  clearGalleryFilters: () => void;
  entries: ComfyGalleryEntry[];
  lineageGroups: ReturnType<typeof buildGalleryLineageGroups> | null;
  collapsedLineageGroups: Set<string>;
  toggleLineageGroup: (rootId: string) => void;
  experimentGroups: ExperimentGroup[];
  collapsedExperimentGroups: Set<string>;
  toggleExperimentGroup: (groupId: string) => void;
  experimentWinners: Record<string, ExperimentWinnerRecord>;
  experimentGridHandlers: {
    onCrownExperiment: (groupId: string, entryId: string) => void;
    onCompareExperiment: (entries: ComfyGalleryEntry[]) => void;
    onRequeueExperiment: (entries: ComfyGalleryEntry[]) => void;
    onWinnerUpscale: (entry: ComfyGalleryEntry) => void;
    onWinnerRefine: (entry: ComfyGalleryEntry) => void;
    onWinnerContinue: (entry: ComfyGalleryEntry) => void;
  };
  galleryCardGridClass: string;
  galleryVirtualGridClass: string;
  renderGalleryCard: (entry: ComfyGalleryEntry) => ReactNode;
  reviewFocusEntry: ComfyGalleryEntry | null;
  reviewFocusIndex: number;
  handleReviewRating: (entry: ComfyGalleryEntry, rating: 1 | 2 | 3 | 4 | 5) => void;
  toggleFavorite: (entryId: string) => void;
  loraExportOpen: boolean;
  loraExportScope: 'favorites' | 'selected';
  setFavorites: (entryIds: string[], favorite: boolean) => void;
};

export default function GalleryPanelBody(props: GalleryPanelBodyProps) {
  const {
    showHeader,
    showFilters,
    compact,
    limit,
    leanGallery,
    leanBulkEnabled,
    bulkEnabled,
    paginationEnabled,
    pickFor,
    uploadInputRef,
    importDroppedImages,
    lightbox,
    header,
    requeueStatus,
    galleryCapWarning,
    capWizardOpen,
    setCapWizardOpen,
    capEvictionPreview,
    exportCapKeepers,
    filter,
    setFilter,
    duplicateClusters,
    duplicateEntriesById,
    setSelectedIds,
    setCompareOpen,
    removeEntries,
    showVisionInbox,
    visionInboxQueue,
    setReviewRating,
    setVisionInboxSkipIds,
    setVisionInboxOpen,
    galleryStats,
    heldMaxCount,
    activeProjectId,
    projectFilterId,
    setProjectFilterId,
    refreshPending,
    tools,
    models,
    userTags,
    customGroups,
    renameCustomGroup,
    deleteCustomGroup,
    setRequeueStatus,
    projects,
    sort,
    setSort,
    pageSize,
    setPageSize,
    embeddingSearchActive,
    embeddingSearchLoading,
    similarSearchLoading,
    embeddingSearchUnavailable,
    layout,
    setLayout,
    density,
    setDensity,
    totalFiltered,
    currentPage,
    totalPages,
    showPagination,
    startSlideshow,
    startFullscreenSlideshow,
    visibleEntries,
    selectedEntries,
    selectedIds,
    retryFailedEntries,
    setPage,
    effectivePageSize,
    selectAllVisible,
    setLoraExportScope,
    setLoraExportOpen,
    openCompare,
    paramAxis,
    setParamAxis,
    similarSearchActive,
    clearSelection,
    bulkExperimentHandlers,
    downloadError,
    compareOpen,
    compareHandlers,
    resetCompare,
    openEntryLightbox,
    workflowEntry,
    setWorkflowEntry,
    clearGalleryFilters,
    entries,
    lineageGroups,
    collapsedLineageGroups,
    toggleLineageGroup,
    experimentGroups,
    collapsedExperimentGroups,
    toggleExperimentGroup,
    experimentWinners,
    experimentGridHandlers,
    galleryCardGridClass,
    galleryVirtualGridClass,
    renderGalleryCard,
    reviewFocusEntry,
    reviewFocusIndex,
    handleReviewRating,
    toggleFavorite,
    loraExportOpen,
    loraExportScope,
    setFavorites,
  } = props;

  const { onLoraExportCancel, onLoraExportConfirm } = useGalleryLoraExportConfirm({
    loraExportScope,
    selectedEntries,
    entries,
    setLoraExportOpen,
    setRequeueStatus,
  });

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
        state={lightbox.resolvedLightbox}
        onClose={lightbox.closeLightbox}
        onIndexChange={lightbox.onIndexChange}
        onDownloadImage={lightbox.onDownloadImage}
        slideChrome={lightbox.slideChrome}
        slideshow={
          lightbox.playlistLength > 1
            ? {
                playing: lightbox.slideshowPlaying,
                intervalMs: lightbox.slideshowIntervalMs,
                intervalOptions: GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
                transition: lightbox.slideshowTransition,
                transitionOptions: GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
                onPlayingChange: lightbox.setSlideshowPlaying,
                onIntervalChange: intervalMs =>
                  lightbox.setSlideshowIntervalMs(intervalMs as GallerySlideshowIntervalMs),
                onTransitionChange: lightbox.setSlideshowTransition,
                fullscreen: lightbox.slideshowFullscreen,
                onFullscreenChange: lightbox.setSlideshowFullscreen,
              }
            : undefined
        }
      />
      {showHeader ? (
        <GalleryPanelHeader
          leanGallery={leanGallery}
          activeJobs={header.activeJobs}
          entriesLength={header.entriesLength}
          compact={compact}
          limit={limit}
          onRefreshPending={header.onRefreshPending}
          onClearAll={header.onClearAll}
          onUpload={() => uploadInputRef.current?.click()}
          uploading={header.uploadingImages}
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

      <GalleryPanelCapSection
        showFilters={showFilters}
        galleryCapWarning={galleryCapWarning}
        capWizardOpen={capWizardOpen}
        setCapWizardOpen={setCapWizardOpen}
        capEvictionPreview={capEvictionPreview}
        entriesLength={entries.length}
        setFilter={setFilter}
        exportCapKeepers={exportCapKeepers}
        removeEntries={removeEntries}
        setFavorites={setFavorites}
      />

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

      <GalleryPanelFiltersSection
        showFilters={showFilters}
        leanGallery={leanGallery}
        pickFor={pickFor}
        filter={filter}
        setFilter={setFilter}
        entries={entries}
        galleryStats={galleryStats}
        activeJobs={header.activeJobs}
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
        setRequeueStatus={setRequeueStatus}
        projects={projects}
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
        currentPage={currentPage}
        totalPages={totalPages}
        showPagination={showPagination}
        slideshowAvailable={lightbox.playlistLength > 1}
        startSlideshow={startSlideshow}
        startFullscreenSlideshow={startFullscreenSlideshow}
        visibleEntries={visibleEntries}
        selectedEntries={selectedEntries}
        retryFailedEntries={retryFailedEntries}
        setPage={setPage}
        effectivePageSize={effectivePageSize}
      />

      <GalleryPanelBulkSection
        leanGallery={leanGallery}
        leanBulkEnabled={leanBulkEnabled}
        bulkEnabled={bulkEnabled}
        visibleEntries={visibleEntries}
        selectedIds={selectedIds}
        selectedEntries={selectedEntries}
        projects={projects}
        paramAxis={paramAxis}
        setParamAxis={setParamAxis}
        similarSearchActive={similarSearchActive}
        clearSelection={clearSelection}
        openCompare={openCompare}
        bulkExperimentHandlers={bulkExperimentHandlers}
        downloadError={downloadError}
        filter={filter}
        setFilter={setFilter}
        setLoraExportScope={setLoraExportScope}
        setLoraExportOpen={setLoraExportOpen}
        selectAllVisible={selectAllVisible}
      />

      <GalleryDerivedKindChips filter={filter} setFilter={setFilter} />

      <GalleryPanelModalsSlot
        compareOpen={compareOpen}
        selectedEntries={selectedEntries}
        compareHandlers={compareHandlers}
        onCompareClose={() => {
          setCompareOpen(false);
          resetCompare();
        }}
        onOpenPreviewFromCompare={entry => {
          setCompareOpen(false);
          openEntryLightbox(entry, 0);
        }}
        workflowEntry={workflowEntry}
        onWorkflowClose={() => setWorkflowEntry(null)}
        loraExportOpen={loraExportOpen}
        loraExportScope={loraExportScope}
        selectedEntriesForExport={selectedEntries}
        allEntries={entries}
        onLoraExportCancel={onLoraExportCancel}
        onLoraExportConfirm={onLoraExportConfirm}
      />

      <GalleryPanelGridSection
        visibleEntries={visibleEntries}
        entriesLength={entries.length}
        clearGalleryFilters={clearGalleryFilters}
        onUpload={() => uploadInputRef.current?.click()}
        lineageGroups={lineageGroups}
        collapsedLineageGroups={collapsedLineageGroups}
        toggleLineageGroup={toggleLineageGroup}
        experimentGroups={experimentGroups}
        collapsedExperimentGroups={collapsedExperimentGroups}
        toggleExperimentGroup={toggleExperimentGroup}
        experimentWinners={experimentWinners}
        experimentGridHandlers={experimentGridHandlers}
        layout={layout}
        density={density}
        compact={compact}
        galleryCardGridClass={galleryCardGridClass}
        galleryVirtualGridClass={galleryVirtualGridClass}
        renderGalleryCard={renderGalleryCard}
        showPagination={showPagination}
        currentPage={currentPage}
        totalPages={totalPages}
        totalFiltered={totalFiltered}
        effectivePageSize={effectivePageSize}
        setPage={setPage}
      />

      {filter.reviewMode && reviewFocusEntry ? (
        <GalleryPanelReviewSlot
          reviewFocusEntry={reviewFocusEntry}
          reviewFocusIndex={reviewFocusIndex}
          visibleEntries={visibleEntries}
          onReviewRating={handleReviewRating}
          onToggleFavorite={toggleFavorite}
          onSelectEntry={entryId => setSelectedIds([entryId])}
        />
      ) : null}
    </section>
  );
}
