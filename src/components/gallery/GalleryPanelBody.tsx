'use client';

import dynamic from 'next/dynamic';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import ImageLightbox from '@/components/ui/ImageLightbox';
import type { GalleryComparePanelProps } from '@/components/GalleryComparePanel';
import GalleryDisplayGrid from '@/components/gallery/GalleryDisplayGrid';
import GalleryEmptyPanel from '@/components/gallery/GalleryEmptyPanel';
import { GALLERY_UPLOAD_ACCEPT } from '@/components/gallery/GalleryUploadButton';
import GalleryFiltersBar from '@/components/gallery/GalleryFiltersBar';
import GalleryFailedRecoveryBanner from '@/components/gallery/GalleryFailedRecoveryBanner';
import GalleryReviewBanner from '@/components/gallery/GalleryReviewBanner';
import GalleryExperimentPanel from '@/components/gallery/GalleryExperimentPanel';
import GalleryStatsBar from '@/components/gallery/GalleryStatsBar';
import GalleryPanelReviewSlot from '@/components/gallery/GalleryPanelReviewSlot';
import GalleryPaginator from '@/components/gallery/GalleryPaginator';
import GalleryDuplicateClustersPanel from '@/components/gallery/GalleryDuplicateClustersPanel';
import GalleryDerivedKindChips from '@/components/gallery/GalleryDerivedKindChips';
import GalleryVisionInbox from '@/components/gallery/GalleryVisionInbox';
import GalleryCapCleanupWizard from '@/components/gallery/GalleryCapCleanupWizard';
import {
  GalleryCapWarningBanner,
  GalleryPanelHeader,
  GalleryPickDock,
} from '@/components/gallery/GalleryPanelChrome';
import StatusToastStrip from '@/components/ui/StatusToastStrip';
import LoraDatasetExportDialog from '@/components/LoraDatasetExportDialog';
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
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';
import { duplicateDropIds } from '@/lib/gallery-duplicate-clusters';
import type { GalleryDensity } from '@/lib/gallery-density';

const GalleryWorkflowModal = dynamic(() => import('@/components/gallery/GalleryWorkflowModal'), {
  loading: () => null,
});

const GalleryCompareModal = dynamic(() => import('@/components/gallery/GalleryCompareModal'), {
  loading: () => null,
});

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
          activeJobs={header.activeJobs}
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
          slideshowAvailable={lightbox.playlistLength > 1}
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
          onCrownExperiment={experimentGridHandlers.onCrownExperiment}
          onCompareExperiment={experimentGridHandlers.onCompareExperiment}
          onRequeueExperiment={experimentGridHandlers.onRequeueExperiment}
          onWinnerUpscale={experimentGridHandlers.onWinnerUpscale}
          onWinnerRefine={experimentGridHandlers.onWinnerRefine}
          onWinnerContinue={experimentGridHandlers.onWinnerContinue}
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
        <GalleryPanelReviewSlot
          reviewFocusEntry={reviewFocusEntry}
          reviewFocusIndex={reviewFocusIndex}
          visibleEntries={visibleEntries}
          onReviewRating={handleReviewRating}
          onToggleFavorite={toggleFavorite}
          onSelectEntry={entryId => setSelectedIds([entryId])}
        />
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
