import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import type { GalleryComparePanelProps } from '@/components/GalleryComparePanel';
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
import type { GalleryCapWarningLevel } from '@/lib/gallery-cap';
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
  setVisionInboxSkipIds: Dispatch<SetStateAction<Set<string>>>;
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
