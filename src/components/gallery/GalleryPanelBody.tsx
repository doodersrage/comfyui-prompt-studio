'use client';

import GalleryPanelBulkSection from '@/components/gallery/GalleryPanelBulkSection';
import GalleryPanelFiltersSection from '@/components/gallery/GalleryPanelFiltersSection';
import GalleryPanelGridSection from '@/components/gallery/GalleryPanelGridSection';
import GalleryPanelReviewSlot from '@/components/gallery/GalleryPanelReviewSlot';
import GalleryPanelCapSection from '@/components/gallery/GalleryPanelCapSection';
import GalleryPanelModalsSlot from '@/components/gallery/GalleryPanelModalsSlot';
import GalleryPanelLightboxSlot from '@/components/gallery/GalleryPanelLightboxSlot';
import GalleryPanelStatusSection from '@/components/gallery/GalleryPanelStatusSection';
import GalleryPanelAuxiliarySection from '@/components/gallery/GalleryPanelAuxiliarySection';
import GalleryDerivedKindChips from '@/components/gallery/GalleryDerivedKindChips';
import { useGalleryLoraExportConfirm } from '@/hooks/useGalleryLoraExportConfirm';
import type { GalleryPanelBodyProps } from '@/components/gallery/gallery-panel-body-types';

export type {
  GalleryPanelBodyProps,
  GalleryPanelLightboxSlotProps,
} from '@/components/gallery/gallery-panel-body-types';

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
      <GalleryPanelLightboxSlot
        uploadInputRef={uploadInputRef}
        importDroppedImages={importDroppedImages}
        lightbox={lightbox}
      />

      <GalleryPanelStatusSection
        showHeader={showHeader}
        leanGallery={leanGallery}
        compact={compact}
        limit={limit}
        uploadInputRef={uploadInputRef}
        header={header}
        requeueStatus={requeueStatus}
        pickFor={pickFor}
      />

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

      <GalleryPanelAuxiliarySection
        showFilters={showFilters}
        filter={filter}
        duplicateClusters={duplicateClusters}
        duplicateEntriesById={duplicateEntriesById}
        setSelectedIds={setSelectedIds}
        setFilter={setFilter}
        removeEntries={removeEntries}
        setCompareOpen={setCompareOpen}
        showVisionInbox={showVisionInbox}
        visionInboxQueue={visionInboxQueue}
        setReviewRating={setReviewRating}
        setVisionInboxSkipIds={setVisionInboxSkipIds}
        setVisionInboxOpen={setVisionInboxOpen}
      />

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
