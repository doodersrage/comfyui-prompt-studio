'use client';

import ImageLightbox from '@/components/ui/ImageLightbox';
import { resolveGalleryLightboxEntry } from '@/lib/comfyui-gallery';
import { downloadGalleryImage } from '@/lib/comfyui-gallery-export';
import ListPaginator from '@/components/ui/ListPaginator';
import { writeBrowserString } from '@/lib/browser-storage';
import VirtualizedHistoryList from '@/components/studio/VirtualizedHistoryList';
import HistoryToolbar from '@/components/studio/history/HistoryToolbar';
import {
  EmptyState,
  ErrorState,
  isLikelyErrorStatus,
  SuccessBanner,
} from '@/components/ui/ViewState';
import { ToolBlockGroup, ToolSection } from '@/components/ui/ToolPageShell';
import { useStudioHistoryTabState } from '@/hooks/useStudioHistoryTabState';
import { saveHistoryDensity } from '@/lib/history-density';
import type { StudioHistoryTabProps } from '@/components/studio/history/studio-history-tab-types';

export type { StudioHistoryTabProps } from '@/components/studio/history/studio-history-tab-types';

export default function StudioHistoryTab(props: StudioHistoryTabProps) {
  const {
    accent,
    entries,
    filteredEntries,
    favoriteEntries,
    historyFilter,
    onHistoryFilterChange,
    projects,
    activeProjectId,
    onActiveProjectChange,
    backupStatus,
    onBackupStatusChange,
    comfyUiStatus,
    onClearHistory,
    onImportBackup,
    onRemoveEntries,
    onAddTagToEntries,
    onSendBatchFavorites,
  } = props;

  const {
    pageSize,
    setPageSize,
    density,
    setDensity,
    setPage,
    bulkTagDraft,
    setBulkTagDraft,
    savedViews,
    setSavedViews,
    viewNameDraft,
    setViewNameDraft,
    lightbox,
    setLightbox,
    lightboxEntries,
    setLightboxEntries,
    pagination,
    useVirtualHistory,
    visibleEntries,
    historyToolOptions,
    historyModelOptions,
    historyTagOptions,
    renderHistoryCard,
  } = useStudioHistoryTabState(props);

  return (
    <ToolSection title="Saved prompts">
      <ImageLightbox
        state={lightbox}
        onClose={() => {
          setLightbox(null);
          setLightboxEntries([]);
        }}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? { ...previous, index, title: previous.titles?.[index] ?? previous.title }
              : previous
          )
        }
        onDownloadImage={async displayIndex => {
          const resolved = resolveGalleryLightboxEntry(lightboxEntries, displayIndex);
          if (!resolved) {
            return;
          }
          await downloadGalleryImage(resolved.entry, resolved.imageIndex);
        }}
      />

      <HistoryToolbar
        accent={accent}
        entries={entries}
        filteredEntries={filteredEntries}
        favoriteEntries={favoriteEntries}
        historyFilter={historyFilter}
        onHistoryFilterChange={onHistoryFilterChange}
        projects={projects}
        activeProjectId={activeProjectId}
        onActiveProjectChange={onActiveProjectChange}
        density={density}
        onDensityChange={value => {
          setDensity(value);
          saveHistoryDensity(value);
        }}
        pageSize={pageSize}
        useVirtualHistory={useVirtualHistory}
        paginationPage={pagination.page}
        paginationTotalPages={pagination.totalPages}
        onSendBatchFavorites={onSendBatchFavorites}
        onClearHistory={onClearHistory}
        onRemoveEntries={onRemoveEntries}
        onAddTagToEntries={onAddTagToEntries}
        onImportBackup={onImportBackup}
        onBackupStatusChange={onBackupStatusChange}
        bulkTagDraft={bulkTagDraft}
        onBulkTagDraftChange={setBulkTagDraft}
        savedViews={savedViews}
        onSavedViewsChange={setSavedViews}
        viewNameDraft={viewNameDraft}
        onViewNameDraftChange={setViewNameDraft}
        historyToolOptions={historyToolOptions}
        historyModelOptions={historyModelOptions}
        historyTagOptions={historyTagOptions}
      />

      {backupStatus &&
        (isLikelyErrorStatus(backupStatus) ? (
          <ErrorState
            compact
            title="Action failed"
            description={backupStatus}
            action={{ label: 'Dismiss', onClick: () => onBackupStatusChange(null) }}
          />
        ) : (
          <SuccessBanner message={backupStatus} />
        ))}
      {comfyUiStatus ? (
        <p className="type-caption text-[var(--accent-text)]">{comfyUiStatus}</p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          branded
          icon="inbox"
          title="No saved prompts yet"
          description="Generate a scene in Character or another tool, then use Save to history on the result panel. Your prompts will appear here for re-queue, export, and diff."
          action={{ label: 'Open Character', href: '/character' }}
        />
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matches for these filters"
          description="Try a broader search term or remove tool, model, tag, or rating filters to see more history entries."
          action={{ label: 'Clear filters', onClick: () => onHistoryFilterChange({}) }}
        />
      ) : (
        <>
          {filteredEntries.length > pageSize && !useVirtualHistory ? (
            <ListPaginator
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={nextSize => {
                setPageSize(nextSize);
                writeBrowserString('studio-history-page-size', String(nextSize));
                setPage(1);
              }}
            />
          ) : null}
          {useVirtualHistory ? (
            <VirtualizedHistoryList
              entries={filteredEntries}
              renderEntry={renderHistoryCard}
              density={density}
            />
          ) : (
            <ToolBlockGroup className="mt-[var(--block-gap)]">
              {visibleEntries.map(entry => renderHistoryCard(entry))}
            </ToolBlockGroup>
          )}
          {filteredEntries.length > pageSize && !useVirtualHistory ? (
            <ListPaginator
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={nextSize => {
                setPageSize(nextSize);
                writeBrowserString('studio-history-page-size', String(nextSize));
                setPage(1);
              }}
            />
          ) : null}
        </>
      )}
    </ToolSection>
  );
}
