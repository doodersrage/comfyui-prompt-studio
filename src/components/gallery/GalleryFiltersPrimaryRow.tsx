'use client';

import type {
  ComfyGalleryFilter,
  ComfyGallerySort,
  GalleryLayoutMode,
  GalleryPageSize,
} from '@/lib/comfyui-gallery';
import type { GalleryDensity } from '@/lib/gallery-density';
import { useGalleryFilterQueryDraft } from '@/components/gallery/useGalleryFilterQueryDraft';
import { GalleryFiltersSearchGroup } from '@/components/gallery/filters/GalleryFiltersSearchGroup';
import { GalleryFiltersLayoutGroup } from '@/components/gallery/filters/GalleryFiltersLayoutGroup';
import { GalleryFiltersGroupsRail } from '@/components/gallery/filters/GalleryFiltersGroupsRail';
import { GalleryFiltersRatingModelRow } from '@/components/gallery/filters/GalleryFiltersRatingModelRow';
import { GalleryFiltersLeanRow } from '@/components/gallery/filters/GalleryFiltersLeanRow';

export type GalleryFiltersPrimaryRowProps = {
  filter: ComfyGalleryFilter;
  setFilter: React.Dispatch<React.SetStateAction<ComfyGalleryFilter>>;
  models: string[];
  customGroups?: string[];
  onRenameCustomGroup?: (from: string, to: string) => void;
  onDeleteCustomGroup?: (name: string) => void;
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
  lean?: boolean;
};

export default function GalleryFiltersPrimaryRow({
  filter,
  setFilter,
  models,
  customGroups = [],
  onRenameCustomGroup,
  onDeleteCustomGroup,
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
  lean = false,
}: GalleryFiltersPrimaryRowProps) {
  const { queryDraft, setQueryDraft } = useGalleryFilterQueryDraft(filter, setFilter);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <GalleryFiltersSearchGroup
          lean={lean}
          filter={filter}
          setFilter={setFilter}
          queryDraft={queryDraft}
          setQueryDraft={setQueryDraft}
          embeddingSearchActive={embeddingSearchActive}
          embeddingSearchLoading={embeddingSearchLoading}
          embeddingSearchUnavailable={embeddingSearchUnavailable}
          customGroups={customGroups}
          onRenameCustomGroup={onRenameCustomGroup}
          onDeleteCustomGroup={onDeleteCustomGroup}
        />
        <GalleryFiltersLayoutGroup
          lean={lean}
          filter={filter}
          setFilter={setFilter}
          sort={sort}
          setSort={setSort}
          paginationEnabled={paginationEnabled}
          layout={layout}
          setLayout={setLayout}
          density={density}
          setDensity={setDensity}
          totalFiltered={totalFiltered}
          totalEntries={totalEntries}
          currentPage={currentPage}
          totalPages={totalPages}
          showPagination={showPagination}
          embeddingSearchLoading={embeddingSearchLoading}
          embeddingSearchUnavailable={embeddingSearchUnavailable}
          similarSearchLoading={similarSearchLoading}
        />
      </div>

      <GalleryFiltersGroupsRail filter={filter} setFilter={setFilter} customGroups={customGroups} />

      <GalleryFiltersRatingModelRow filter={filter} setFilter={setFilter} models={models} />

      {lean ? (
        <GalleryFiltersLeanRow
          filter={filter}
          setFilter={setFilter}
          paginationEnabled={paginationEnabled}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      ) : null}
    </>
  );
}
