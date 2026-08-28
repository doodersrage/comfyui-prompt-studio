'use client';

import { useMemo } from 'react';
import {
  useGalleryBrowsePageClamp,
  type GalleryBrowsePageClampContext,
} from '@/hooks/useGalleryBrowseState';
import { previewGalleryCapEviction } from '@/lib/gallery-cap';
import { clusterGalleryDuplicates } from '@/lib/gallery-duplicate-clusters';
import {
  buildGalleryLineageGroups,
  galleryLineageGroupingEnabled,
} from '@/lib/gallery-lineage-groups';
import { groupGalleryExperiments } from '@/lib/experiment-groups';
import { groupGalleryQueueRuns } from '@/lib/gallery-queue-runs';
import {
  normalizeExperimentGroupAnchors,
  paginateGalleryEntriesWithGroups,
} from '@/lib/gallery-display-rows';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';
import {
  GALLERY_PAGE_SIZE_ALL,
  resolveGalleryPageSize,
  sortGalleryEntries,
  type ComfyGalleryEntry,
  type ComfyGalleryFilter,
  type ComfyGallerySort,
  type GalleryLayoutMode,
  type GalleryPageSize,
} from '@/lib/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery-density';
import type { ExperimentGroup } from '@/lib/experiment-groups';

export type UseGalleryDisplayPlanOptions = {
  showFilters: boolean;
  filteredEntries: ComfyGalleryEntry[];
  entries: ComfyGalleryEntry[];
  filter: ComfyGalleryFilter;
  paginationEnabled: boolean;
  sort: ComfyGallerySort;
  page: number;
  pageSize: GalleryPageSize;
  limit?: number;
  pageClamp: GalleryBrowsePageClampContext;
  layout: GalleryLayoutMode;
  density: GalleryDensity;
  compact: boolean;
  capWizardOpen: boolean;
  visionInboxOpen: boolean;
  visionInboxSkipIds: Set<string>;
};

export type UseGalleryDisplayPlanResult = {
  sortedSource: ComfyGalleryEntry[];
  experimentGroups: ExperimentGroup[];
  visibleEntries: ComfyGalleryEntry[];
  totalPages: number;
  currentPage: number;
  totalFiltered: number;
  effectivePageSize: number;
  showPagination: boolean;
  lineageGroups: ReturnType<typeof buildGalleryLineageGroups> | null;
  duplicateClusters: ReturnType<typeof clusterGalleryDuplicates>;
  duplicateEntriesById: Map<string, ComfyGalleryEntry> | null;
  capEvictionPreview: ComfyGalleryEntry[];
  showVisionInbox: boolean;
  visionInboxQueue: ComfyGalleryEntry[];
  galleryCardGridClass: string;
  galleryVirtualGridClass: string;
};

export function useGalleryDisplayPlan({
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
}: UseGalleryDisplayPlanOptions): UseGalleryDisplayPlanResult {
  const filteredSource = showFilters ? filteredEntries : entries;
  const sortedSource = useMemo(
    () => (paginationEnabled ? sortGalleryEntries(filteredSource, sort) : filteredSource),
    [filteredSource, paginationEnabled, sort]
  );

  const experimentGroups = useMemo(() => {
    const experiments = groupGalleryExperiments(sortedSource);
    const claimed = new Set(experiments.flatMap(group => group.entries.map(entry => entry.id)));
    const runs = groupGalleryQueueRuns(sortedSource).filter(
      group => !group.entries.some(entry => claimed.has(entry.id))
    );
    return normalizeExperimentGroupAnchors([...experiments, ...runs], sortedSource);
  }, [sortedSource]);

  const pagination = useMemo(() => {
    if (!paginationEnabled) {
      const items = limit ? sortedSource.slice(0, limit) : sortedSource;
      return {
        items,
        page: 1,
        totalPages: 1,
        totalItems: sortedSource.length,
      };
    }

    if (pageSize === GALLERY_PAGE_SIZE_ALL) {
      return {
        items: sortedSource,
        page: 1,
        totalPages: 1,
        totalItems: sortedSource.length,
      };
    }

    const effectivePageSize = resolveGalleryPageSize(pageSize, sortedSource.length);
    return paginateGalleryEntriesWithGroups(
      sortedSource,
      experimentGroups,
      page,
      effectivePageSize
    );
  }, [sortedSource, experimentGroups, limit, page, pageSize, paginationEnabled]);

  const visibleEntries = pagination.items;
  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;

  useGalleryBrowsePageClamp(pageClamp, totalPages, sortedSource.length);

  const totalFiltered = pagination.totalItems;
  const effectivePageSize = resolveGalleryPageSize(pageSize, totalFiltered);
  const showPagination =
    paginationEnabled && pageSize !== GALLERY_PAGE_SIZE_ALL && totalFiltered > effectivePageSize;
  const lineageGrouping = galleryLineageGroupingEnabled(filter);
  const lineageGroups = useMemo(
    () => (lineageGrouping ? buildGalleryLineageGroups(visibleEntries) : null),
    [lineageGrouping, visibleEntries]
  );
  const duplicateClusters = useMemo(
    () => (showFilters && filter.duplicatesOnly ? clusterGalleryDuplicates(entries) : []),
    [entries, filter.duplicatesOnly, showFilters]
  );
  const duplicateEntriesById = useMemo(
    () =>
      showFilters && filter.duplicatesOnly && duplicateClusters.length > 0
        ? new Map(entries.map(entry => [entry.id, entry]))
        : null,
    [entries, filter.duplicatesOnly, showFilters, duplicateClusters.length]
  );
  const capEvictionPreview = useMemo(
    () => (capWizardOpen ? previewGalleryCapEviction(entries, MAX_GALLERY_ENTRIES) : []),
    [capWizardOpen, entries]
  );
  const showVisionInbox = showFilters && (filter.needsVisionReview || visionInboxOpen);
  const visionInboxQueue = useMemo(
    () =>
      showVisionInbox
        ? entries.filter(
            entry =>
              entry.status === 'completed' &&
              entry.images.length > 0 &&
              !(entry.visionTags?.length ?? 0) &&
              !visionInboxSkipIds.has(entry.id)
          )
        : [],
    [showVisionInbox, entries, visionInboxSkipIds]
  );
  const galleryCardGridClass =
    layout === 'dense' || density === 'compact'
      ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7'
      : compact
        ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'
        : 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4';
  const galleryVirtualGridClass =
    layout === 'dense' || density === 'compact'
      ? 'grid gap-2'
      : compact
        ? 'grid gap-4'
        : 'grid gap-6';

  return {
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
  };
}
