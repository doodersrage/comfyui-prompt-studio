'use client';

import dynamic from 'next/dynamic';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useGalleryPanelActions } from '@/hooks/useGalleryPanelActions';
import ImageLightbox, {
  type ImageLightboxSlideChrome,
  type ImageLightboxState,
} from '@/components/ui/ImageLightbox';
import {
  startComposeFromGalleryEntry,
  startControlNetFromGalleryEntry,
  startImproveFromGalleryEntry,
  startInpaintFromGalleryEntry,
  startOutpaintFromGalleryEntry,
  startReeditComposeFromGalleryEntry,
  startRefineFromGalleryEntry,
  startReeditRefineFromGalleryEntry,
  startVideoFromGalleryEntry,
} from '@/lib/improve-output';
import { comfyUiJobProgressPercent, comfyUiJobStatusLabel } from '@/lib/comfyui-job-status';
import { formatComfyHostLabel } from '@/lib/queue-status-notes';
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
import GalleryVisionInbox from '@/components/gallery/GalleryVisionInbox';
import GalleryCapCleanupWizard from '@/components/gallery/GalleryCapCleanupWizard';
import StatusToastStrip from '@/components/ui/StatusToastStrip';
import {
  assessGalleryCapWarning,
  GALLERY_CAP_KEEPER_MIN_RATING,
  previewGalleryCapEviction,
} from '@/lib/gallery-cap';
import {
  galleryDerivedKindChipLabel,
  galleryDerivedKindLabel,
  GALLERY_DERIVED_KIND_FILTERS,
} from '@/lib/gallery-derived-kind';
import {
  applyGalleryPromptAndStackToSession,
  applyGalleryStackToSession,
  galleryEntryCanSaveLook,
  galleryEntryHasRestorableStack,
  saveGalleryLookFromEntry,
} from '@/lib/gallery-stack-restore';
import { applyGalleryFaceToSession, galleryEntryCanLockFace } from '@/lib/gallery-identity-lock';
import { galleryToolHref, galleryToolLabel } from '@/lib/gallery-tool-href';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';
import { applyGalleryUrlState, parseGalleryUrlState } from '@/lib/gallery-url-state';
import {
  galleryBrowseScope,
  galleryUrlHasBrowseState,
  loadGallerySessionState,
  patchGallerySessionPage,
  readInitialGalleryPage,
  saveGallerySessionState,
} from '@/lib/gallery-session-state';
import { useGalleryReview } from '@/hooks/useGalleryReview';
import { useGallerySelection } from '@/hooks/useGallerySelection';
import { useGalleryCompareHandlers } from '@/hooks/useGalleryCompareHandlers';
import { toneForStatusText } from '@/lib/status-progress';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { computeGalleryStats } from '@/lib/gallery-stats';
import { type ParamExperimentAxis } from '@/lib/param-experiment-queue';
import { useHeldMaxCount } from '@/hooks/useHeldMaxJobs';
import { suggestRatingMutations } from '@/lib/rating-prompt-mutations';
import { loadActiveProjectId, loadPromptProjects } from '@/lib/prompt-projects';
import {
  downloadGalleryImage,
  downloadGalleryImagesSequential,
  downloadGallerySidecarBundle,
} from '@/lib/comfyui-gallery-export';
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
import { clusterGalleryDuplicates, duplicateDropIds } from '@/lib/gallery-duplicate-clusters';
import {
  EXPERIMENT_WINNERS_UPDATED_EVENT,
  clearExperimentWinner,
  loadExperimentWinners,
  markExperimentWinner,
} from '@/lib/experiment-winners';
import { loadGalleryDensity, saveGalleryDensity, type GalleryDensity } from '@/lib/gallery-density';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import { buildLightboxStateFromPlaylist } from '@/lib/gallery-lightbox-state';
import {
  buildGalleryLightboxPlaylist,
  galleryEntryHeroPreviewUrl,
  galleryEntryLightboxUrls,
  galleryEntryMediaKinds,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  galleryEntryStripThumbUrls,
  galleryEntryViewUrls,
  GALLERY_PAGE_SIZE_ALL,
  GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  loadGalleryViewPreferences,
  resolveGalleryPageSize,
  resolveGalleryLightboxEntry,
  resolveGalleryLightboxOpenIndex,
  saveGalleryViewPreferences,
  setGalleryReviewNote,
  sortGalleryEntries,
  isGalleryStoreReady,
  type ComfyGalleryEntry,
  type ComfyGalleryFilter,
  type ComfyGallerySort,
  type GalleryLayoutMode,
  type GalleryPageSize,
  type GallerySlideshowIntervalMs,
  type GallerySlideshowTransition,
} from '@/lib/comfyui-gallery';
import { prefetchGalleryImageUrl } from '@/lib/gallery-image-prefetch';
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
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const [slideshowFullscreen, setSlideshowFullscreen] = useState(false);
  const [page, setPage] = useState(() =>
    browsePaginationEnabled ? readInitialGalleryPage(window.location.pathname) : 1
  );
  const [sort, setSort] = useState<ComfyGallerySort>('queued-desc');
  const [pageSize, setPageSize] = useState<GalleryPageSize>(12);
  const [slideshowIntervalMs, setSlideshowIntervalMs] = useState<GallerySlideshowIntervalMs>(5000);
  const [slideshowTransition, setSlideshowTransition] =
    useState<GallerySlideshowTransition>('slide');
  const [layout, setLayout] = useState<GalleryLayoutMode>('grid');
  const [viewPrefsLoaded, setViewPrefsLoaded] = useState(false);
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
  const [experimentWinners, setExperimentWinners] = useState(loadExperimentWinners);
  const [paramAxis, setParamAxis] = useState<ParamExperimentAxis>('cfg');
  const [projectFilterId, setProjectFilterId] = useState<string>('');
  const [projects] = useState(() => loadPromptProjects());
  const [density, setDensity] = useState<GalleryDensity>('comfortable');
  const [galleryUrlReady, setGalleryUrlReady] = useState(false);
  const [galleryEntriesSettled, setGalleryEntriesSettled] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const galleryBrowseBaselineRef = useRef<string | null>(null);
  const pendingRestorePageRef = useRef<number | null>(null);
  const galleryBrowsePathRef = useRef<string | null>(
    browsePaginationEnabled ? galleryBrowseScope(pathname) : null
  );
  const galleryBrowseSaveRef = useRef<{
    filter: ComfyGalleryFilter;
    sort: ComfyGallerySort;
    projectFilterId: string;
    page: number;
  }>({
    filter: { status: 'all' },
    sort: 'queued-desc',
    projectFilterId: '',
    page: 1,
  });
  const galleryBrowseRestoringRef = useRef(false);
  useLayoutEffect(() => {
    if (!browsePaginationEnabled) {
      return;
    }
    const initial = readInitialGalleryPage(window.location.pathname);
    if (initial > 1) {
      pendingRestorePageRef.current = initial;
      galleryBrowseRestoringRef.current = true;
    }
  }, [browsePaginationEnabled]);

  const [galleryBrowseHydrated, setGalleryBrowseHydrated] = useState(false);
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
    setSort('queued-desc');
    setPage(1);
  }, [setFilter]);

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

  useEffect(() => {
    setFilter(previous => ({
      ...previous,
      projectId: resolvedProjectFilterId,
    }));
  }, [resolvedProjectFilterId, setFilter]);

  const bulkEnabled = showFilters && !compact;
  /** Full experiment/export menus stay advanced; lean still gets select + compare. */
  const leanBulkEnabled = bulkEnabled;
  const paginationEnabled = browsePaginationEnabled;
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

  useEffect(() => {
    if (!browsePaginationEnabled) {
      return;
    }
    const scope = galleryBrowseScope(pathname);
    if (scope === '/gallery' || scope === '/m/gallery') {
      galleryBrowsePathRef.current = scope;
    }
  }, [pathname, browsePaginationEnabled]);

  useEffect(() => {
    galleryBrowseSaveRef.current = { filter, sort, projectFilterId, page };
  }, [filter, sort, projectFilterId, page]);

  useEffect(() => {
    if (!browsePaginationEnabled || typeof window === 'undefined') {
      return;
    }
    patchGallerySessionPage(galleryBrowseScope(pathname), page);
  }, [page, browsePaginationEnabled, pathname]);

  useEffect(() => {
    if (!browsePaginationEnabled) {
      return;
    }
    return () => {
      const scope = galleryBrowsePathRef.current;
      if (!scope) {
        return;
      }
      saveGallerySessionState(scope, galleryBrowseSaveRef.current);
    };
  }, [browsePaginationEnabled]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const preferences = loadGalleryViewPreferences();
      setSort(preferences.sort);
      setPageSize(preferences.pageSize);
      setSlideshowIntervalMs(preferences.slideshowIntervalMs);
      setSlideshowTransition(preferences.slideshowTransition);
      setLayout(preferences.layout);
      setDensity(loadGalleryDensity());
      setExperimentWinners(loadExperimentWinners());
      setViewPrefsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!viewPrefsLoaded || typeof window === 'undefined') {
      return;
    }
    scheduleAfterCommit(() => {
      const params = new URLSearchParams(window.location.search);
      const hasUrlBrowse = galleryUrlHasBrowseState(params);
      const cached = loadGallerySessionState(window.location.pathname);
      const urlParsed = parseGalleryUrlState(params);
      if (hasUrlBrowse) {
        const hasFilter = Object.keys(urlParsed.filter).length > 0;
        if (hasFilter) {
          setFilter(previous => ({
            ...previous,
            ...urlParsed.filter,
            ...(urlParsed.filter.query?.trim() ? { semanticSearch: true } : {}),
          }));
        }
        if (urlParsed.sort) {
          setSort(urlParsed.sort);
        }
        if (urlParsed.projectFilterId !== undefined) {
          setProjectFilterId(urlParsed.projectFilterId);
        }
      } else if (cached) {
        const cachedFilter = cached.filter ?? {};
        if (Object.keys(cachedFilter).length > 0) {
          setFilter(previous => ({
            ...previous,
            ...cachedFilter,
            status: cachedFilter.status ?? previous.status ?? 'all',
            ...(cachedFilter.query?.trim() ? { semanticSearch: true } : {}),
          }));
        }
        if (cached.sort) {
          setSort(cached.sort);
        }
        if (cached.projectFilterId !== undefined) {
          setProjectFilterId(cached.projectFilterId);
        }
      }
      const prefs = loadGalleryViewPreferences();
      const restoredPage =
        urlParsed.page ?? cached?.page ?? (prefs.page && prefs.page >= 1 ? prefs.page : undefined);
      if (restoredPage) {
        pendingRestorePageRef.current = restoredPage;
        setPage(restoredPage);
      }
      setGalleryUrlReady(true);
    });
  }, [viewPrefsLoaded, setFilter]);

  useEffect(() => {
    if (!galleryUrlReady || !showFilters || typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    applyGalleryUrlState(url.searchParams, { filter, sort, projectFilterId, page });
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(null, '', next);
    }
  }, [filter, sort, projectFilterId, page, galleryUrlReady, showFilters]);

  useEffect(() => {
    if (
      !galleryUrlReady ||
      !paginationEnabled ||
      typeof window === 'undefined' ||
      !galleryBrowseHydrated
    ) {
      return;
    }
    saveGallerySessionState(window.location.pathname, {
      filter,
      sort,
      projectFilterId,
      page,
    });
  }, [
    filter,
    sort,
    projectFilterId,
    page,
    galleryUrlReady,
    paginationEnabled,
    galleryBrowseHydrated,
  ]);

  useEffect(() => {
    const onWinners = () => setExperimentWinners(loadExperimentWinners());
    window.addEventListener(EXPERIMENT_WINNERS_UPDATED_EVENT, onWinners);
    return () => window.removeEventListener(EXPERIMENT_WINNERS_UPDATED_EVENT, onWinners);
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
      page: galleryBrowseHydrated ? page : undefined,
    });
    saveGalleryDensity(density);
  }, [
    sort,
    pageSize,
    slideshowIntervalMs,
    slideshowTransition,
    layout,
    density,
    page,
    viewPrefsLoaded,
    paginationEnabled,
    galleryBrowseHydrated,
  ]);

  useEffect(() => {
    if (!galleryUrlReady || !paginationEnabled || !galleryBrowseHydrated) {
      return;
    }
    if (galleryBrowseRestoringRef.current) {
      return;
    }
    const { projectId: _projectId, ...filterWithoutProject } = filter;
    const sig = JSON.stringify({
      filter: filterWithoutProject,
      sort,
      pageSize,
      projectFilterId,
    });
    if (galleryBrowseBaselineRef.current === null) {
      galleryBrowseBaselineRef.current = sig;
      return;
    }
    if (galleryBrowseBaselineRef.current !== sig) {
      galleryBrowseBaselineRef.current = sig;
      setPage(1);
    }
  }, [
    filter,
    sort,
    pageSize,
    projectFilterId,
    galleryUrlReady,
    paginationEnabled,
    galleryBrowseHydrated,
  ]);

  const experimentGroups = useMemo(() => {
    // Group across the full filtered/sorted set, not just the current page's
    // `visibleEntries`. Grouping on the paginated slice made membership (and
    // whether a group even qualifies as an "experiment") depend on which
    // page happened to be showing, so groups would flicker, split, or
    // reappear with stale membership as the user paginated. `sortedSource`
    // is stable across pages; buildGalleryDisplayRows anchors each group's
    // block to a single page (the page holding its newest member) and
    // renders the group's full entry list there, so a group whose members
    // straddle a page boundary shows once, complete, instead of appearing
    // again on the next page with a leftover subset of its entries.
    // `pagination` below plans page boundaries around these same groups (see
    // paginateGalleryEntriesWithGroups) so a group's true size is accounted
    // for up front, instead of a flat index slice accidentally handing a
    // later page's entries to an earlier page's group and leaving it empty.
    const experiments = groupGalleryExperiments(sortedSource);
    const claimed = new Set(experiments.flatMap(group => group.entries.map(entry => entry.id)));
    const runs = groupGalleryQueueRuns(sortedSource).filter(
      group => !group.entries.some(entry => claimed.has(entry.id))
    );
    // See normalizeExperimentGroupAnchors's doc comment: groupGalleryQueueRuns orders its
    // entries oldest-first, which breaks the entries[0]-is-the-anchor assumption both
    // buildGalleryDisplayRows and paginateGalleryEntriesWithGroups rely on.
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

  useEffect(() => {
    if (
      !paginationEnabled ||
      !galleryUrlReady ||
      !storeReady ||
      !galleryEntriesSettled ||
      galleryBrowseHydrated
    ) {
      return;
    }
    const pending = pendingRestorePageRef.current;
    if (pending !== null && totalPages > 0) {
      if (pending <= totalPages) {
        pendingRestorePageRef.current = null;
        if (page !== pending) {
          setPage(pending);
        }
      } else if (sortedSource.length > 0) {
        pendingRestorePageRef.current = null;
        setPage(totalPages);
      }
    } else if (pending === null && totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
    scheduleAfterCommit(() => {
      galleryBrowseRestoringRef.current = false;
      setGalleryBrowseHydrated(true);
      const { projectId: _projectId, ...filterWithoutProject } = filter;
      galleryBrowseBaselineRef.current = JSON.stringify({
        filter: filterWithoutProject,
        sort,
        pageSize,
        projectFilterId,
      });
    });
  }, [
    filter,
    sort,
    pageSize,
    projectFilterId,
    page,
    totalPages,
    sortedSource.length,
    galleryUrlReady,
    paginationEnabled,
    storeReady,
    galleryEntriesSettled,
    galleryBrowseHydrated,
  ]);
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
  // Rebuilding this Map from `entries` (up to MAX_GALLERY_ENTRIES) was previously
  // done inline in JSX, so it ran on every render of the panel while the
  // duplicates view was open, not just when `entries` actually changed.
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
  // Same issue as duplicateEntriesById: this filter over the full entries list
  // was inline in JSX and re-ran on every render while the inbox was open,
  // including renders triggered by unrelated state (e.g. hover/lightbox).
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

  const retryFailedEntries = useCallback(
    (targets: ComfyGalleryEntry[], mode: 'same' | 'new' | 'exact' = 'same') => {
      const failed = targets.filter(entry => entry.status === 'error');
      if (failed.length === 0) {
        return;
      }
      setRequeueStatus(`Retrying ${failed.length} failed job(s)…`);
      void import('@/lib/comfyui-requeue')
        .then(({ requeueComfyJobs }) =>
          requeueComfyJobs(
            failed.map(entry => {
              const canExact = Boolean(entry.hasStoredWorkflow || entry.workflowJson);
              const exactGraph = mode === 'exact' && canExact;
              return {
                prompt: entry.prompt,
                negativePrompt: entry.negativePrompt,
                tool: entry.tool,
                model: entry.model,
                queueParams: entry.queueParams,
                workflowJson: entry.workflowJson,
                newSeed: mode === 'new',
                exactGraph,
                parentGalleryEntryId: entry.id,
                derivedKind: 'variation' as const,
              };
            }),
            setRequeueStatus
          )
        )
        .then(({ queued, failed: failCount }) => {
          toastBulkQueueSummary({
            label: 'Failed retry finished',
            queued,
            failed: failCount,
          });
        });
    },
    [setRequeueStatus]
  );

  const exportCapKeepers = useCallback(() => {
    const keepers = entries.filter(
      entry => Boolean(entry.favorite) || (entry.reviewRating ?? 0) >= GALLERY_CAP_KEEPER_MIN_RATING
    );
    if (keepers.length === 0) {
      setRequeueStatus('No keepers yet — favorite or rate ≥4★ first.');
      return;
    }
    downloadGallerySidecarBundle(keepers);
    setRequeueStatus(`Exporting ${keepers.length} keeper image(s)…`);
    void downloadGalleryImagesSequential(keepers).then(count => {
      setRequeueStatus(`Exported ${count} keeper image(s) + sidecars.`);
    });
  }, [entries]);

  // Full filtered/sorted set — not just the current page — so slideshow/nav spans the view.
  const lightboxEntries = sortedSource;
  const lightboxEntriesRef = useRef(lightboxEntries);
  const lightboxPlaylist = useMemo(
    () => buildGalleryLightboxPlaylist(lightboxEntries),
    [lightboxEntries]
  );

  useLayoutEffect(() => {
    lightboxEntriesRef.current = lightboxEntries;
  }, [lightboxEntries]);

  const applyPlaylistState = useCallback(
    (index: number, extras?: { playing?: boolean; fullscreen?: boolean }) => {
      const next = buildLightboxStateFromPlaylist(lightboxPlaylist, index);
      if (!next) {
        return;
      }
      setLightbox(next);
      if (extras?.playing != null) {
        setSlideshowPlaying(extras.playing);
      }
      if (extras?.fullscreen != null) {
        setSlideshowFullscreen(extras.fullscreen);
      }
    },
    [lightboxPlaylist]
  );

  // Derive live playlist into the open lightbox so filter/sort changes don't require setState sync.
  const resolvedLightbox = useMemo<ImageLightboxState | null>(() => {
    if (!lightbox) {
      return null;
    }
    return buildLightboxStateFromPlaylist(lightboxPlaylist, lightbox.index);
  }, [lightbox, lightboxPlaylist]);

  useEffect(() => {
    if (!lightbox || lightboxPlaylist.images.length > 0) {
      return;
    }
    scheduleAfterCommit(() => {
      setLightbox(null);
      setSlideshowPlaying(false);
      setSlideshowFullscreen(false);
    });
  }, [lightbox, lightboxPlaylist.images.length]);

  const openEntryLightbox = useCallback(
    (entry: ComfyGalleryEntry, imageIndex: number) => {
      if (lightboxPlaylist.images.length === 0) {
        return;
      }

      const index = resolveGalleryLightboxOpenIndex(
        lightboxEntriesRef.current,
        entry.id,
        imageIndex
      );

      applyPlaylistState(index, { playing: false, fullscreen: false });
    },
    [applyPlaylistState, lightboxPlaylist.images.length]
  );

  const openLightboxForEntryId = useCallback(
    (entryId: string, imageIndex: number) => {
      const entry = lightboxEntriesRef.current.find(item => item.id === entryId);
      if (entry) {
        openEntryLightbox(entry, imageIndex);
      }
    },
    [openEntryLightbox]
  );

  const prefetchLightboxForEntryId = useCallback((entryId: string, imageIndex: number) => {
    const entry = lightboxEntriesRef.current.find(item => item.id === entryId);
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
    const startIndex = resolvedLightbox?.index ?? lightbox?.index ?? 0;
    applyPlaylistState(startIndex, { playing: true, fullscreen: false });
  };

  const startFullscreenSlideshow = () => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }
    const startIndex = resolvedLightbox?.index ?? lightbox?.index ?? 0;
    applyPlaylistState(startIndex, { playing: true, fullscreen: true });
  };

  const closeLightbox = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    setLightbox(null);
    setSlideshowPlaying(false);
    setSlideshowFullscreen(false);
  };

  const deepLinkOpenedRef = useRef<string | null>(null);
  /** Preserve ?lightbox= across early URL sync clears until the store can open it. */
  const pendingLightboxDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    const id = searchParams.get('lightbox')?.trim();
    if (id) {
      pendingLightboxDeepLinkRef.current = id;
    }
  }, [searchParams]);

  // Open from ?lightbox=<entryId> once gallery data is ready.
  useEffect(() => {
    if (!storeReady || lightboxPlaylist.images.length === 0) {
      return;
    }
    const id = pendingLightboxDeepLinkRef.current ?? searchParams.get('lightbox')?.trim();
    if (!id || deepLinkOpenedRef.current === id) {
      return;
    }
    const entry =
      lightboxEntriesRef.current.find(item => item.id === id) ??
      entries.find(item => item.id === id);
    if (!entry) {
      return;
    }
    deepLinkOpenedRef.current = id;
    openEntryLightbox(entry, 0);
  }, [storeReady, lightboxPlaylist.images.length, searchParams, entries, openEntryLightbox]);

  // Keep ?lightbox= in sync with the open preview for shareable links.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (!resolvedLightbox) {
      // Don't strip deep-link targets before the gallery store is ready to open them.
      if (!storeReady) {
        return;
      }
      const pending =
        url.searchParams.get('lightbox')?.trim() || pendingLightboxDeepLinkRef.current;
      if (pending && deepLinkOpenedRef.current !== pending) {
        const exists =
          lightboxEntriesRef.current.some(item => item.id === pending) ||
          entries.some(item => item.id === pending);
        if (exists) {
          return;
        }
      }
      if (url.searchParams.has('lightbox')) {
        url.searchParams.delete('lightbox');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
      return;
    }
    const resolved = resolveGalleryLightboxEntry(lightboxEntries, resolvedLightbox.index);
    if (!resolved) {
      return;
    }
    if (url.searchParams.get('lightbox') === resolved.entry.id) {
      return;
    }
    url.searchParams.set('lightbox', resolved.entry.id);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    deepLinkOpenedRef.current = resolved.entry.id;
  }, [resolvedLightbox, lightboxEntries, storeReady, entries]);

  const onDownloadImage = useCallback(async (displayIndex: number) => {
    const resolved = resolveGalleryLightboxEntry(lightboxEntriesRef.current, displayIndex);
    if (!resolved) return;
    await downloadGalleryImage(resolved.entry, resolved.imageIndex);
  }, []);

  const lightboxSlideChrome = useMemo<ImageLightboxSlideChrome | null>(() => {
    if (!resolvedLightbox) {
      return null;
    }
    const resolved = resolveGalleryLightboxEntry(lightboxEntries, resolvedLightbox.index);
    if (!resolved) {
      return null;
    }
    const { entry } = resolved;
    const isVideo = galleryEntryPrimaryMediaKind(entry) === 'video';
    const completed = entry.status === 'completed';
    const qp = entry.queueParams;
    const parentId = entry.parentGalleryEntryId;
    const hasParent = Boolean(parentId);
    const hasDerivatives = entryIdsWithDerivatives.has(entry.id);
    const hasSibling = Boolean(
      parentId &&
      entries.some(item => item.parentGalleryEntryId === parentId && item.id !== entry.id)
    );
    const paramString = (value: unknown) =>
      value === undefined || value === null || value === '' ? undefined : String(value);
    const parentEntry = parentId ? entries.find(item => item.id === parentId) : undefined;
    const beforeAfterUrl = parentEntry
      ? galleryEntryLightboxUrls(parentEntry)[0] ||
        galleryEntryPrimaryThumbUrl(parentEntry) ||
        undefined
      : undefined;
    const jobLive =
      entry.status === 'pending' || entry.status === 'running' || entry.status === 'error'
        ? {
            status: entry.status,
            label:
              entry.statusMessage?.trim() ||
              comfyUiJobStatusLabel({
                status: entry.status,
                progressValue: entry.progressValue,
                progressMax: entry.progressMax,
                progressNode: entry.progressNode,
                queuePosition: entry.queuePosition,
                promptId: entry.promptId,
              }),
            percent: comfyUiJobProgressPercent(entry),
          }
        : null;

    return {
      rating: entry.reviewRating ?? null,
      favorite: Boolean(entry.favorite),
      onRate: rating => handleReviewRating(entry, rating),
      onToggleFavorite: () => toggleFavorite(entry.id),
      showImprove: completed && !isVideo,
      showCompose: completed && !isVideo,
      showInpaint: completed && !isVideo,
      showExact: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
      showUseStack: galleryEntryHasRestorableStack(entry),
      showUsePromptStack: galleryEntryHasRestorableStack(entry) && Boolean(entry.prompt?.trim()),
      showUseFace: galleryEntryCanLockFace(entry),
      showSaveLook: galleryEntryCanSaveLook(entry),
      showRequeue: true,
      onImprove: () => startImproveFromGalleryEntry(entry),
      onCompose: () => startComposeFromGalleryEntry(entry),
      onInpaint: () => startInpaintFromGalleryEntry(entry),
      onExactRequeue: () => {
        setRequeueStatus('Replaying exact graph…');
        void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
          requeueComfyJobFromEntry(entry, {
            newSeed: false,
            exactGraph: true,
            onStatus: setRequeueStatus,
          })
        );
      },
      onUseStack: galleryEntryHasRestorableStack(entry)
        ? () => {
            applyGalleryStackToSession(entry);
            router.push(galleryToolHref(entry.tool));
          }
        : undefined,
      onUsePromptStack:
        galleryEntryHasRestorableStack(entry) && entry.prompt?.trim()
          ? () => {
              applyGalleryPromptAndStackToSession(entry);
              router.push(galleryToolHref(entry.tool));
            }
          : undefined,
      onUseFace: galleryEntryCanLockFace(entry)
        ? () => {
            setRequeueStatus(`Locking face on ${galleryToolLabel(entry.tool)}…`);
            void applyGalleryFaceToSession(entry).then(result => {
              if (result.ok) {
                router.push(galleryToolHref(entry.tool));
                return;
              }
              setRequeueStatus(result.error ?? 'Face lock failed.');
            });
          }
        : undefined,
      onSaveLook: galleryEntryCanSaveLook(entry)
        ? () => {
            const saved = saveGalleryLookFromEntry(entry);
            setRequeueStatus(
              saved.ok ? `Saved look · ${saved.label}` : (saved.error ?? 'Save look failed.')
            );
          }
        : undefined,
      onRequeue: () => {
        setRequeueStatus('Re-queueing…');
        void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
          requeueComfyJobFromEntry(entry, {
            newSeed: false,
            onStatus: setRequeueStatus,
          })
        );
      },
      onRetryStickyHost: entry.comfyUrl?.trim()
        ? () => {
            setRequeueStatus(`Re-queueing on ${entry.comfyUrl}…`);
            void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
              requeueComfyJobFromEntry(entry, {
                newSeed: false,
                exactGraph: Boolean(entry.hasStoredWorkflow || entry.workflowJson),
                comfyUrlOverride: entry.comfyUrl,
                onStatus: setRequeueStatus,
              })
            );
          }
        : undefined,
      showSeedVariation: completed,
      onRequeueNewSeed: completed
        ? () => {
            setRequeueStatus('Re-queueing with new seed…');
            void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
              requeueComfyJobFromEntry(entry, {
                newSeed: true,
                exactGraph: false,
                onStatus: setRequeueStatus,
              })
            );
          }
        : undefined,
      onRequeueSeedPlusOne: completed
        ? () => {
            const currentSeed = Number(entry.queueParams?.seed);
            if (!Number.isFinite(currentSeed)) {
              setRequeueStatus('Re-queueing with new seed…');
              void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
                requeueComfyJobFromEntry(entry, {
                  newSeed: true,
                  exactGraph: false,
                  onStatus: setRequeueStatus,
                })
              );
              return;
            }
            const nextSeed = Math.trunc(currentSeed) + 1;
            setRequeueStatus(`Re-queueing with seed ${nextSeed}…`);
            void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
              requeueComfyJobFromEntry(entry, {
                seedOverride: nextSeed,
                exactGraph: false,
                onStatus: setRequeueStatus,
              })
            );
          }
        : undefined,
      note: entry.reviewNote ?? '',
      onNoteChange: note => {
        setGalleryReviewNote(entry.id, note);
        setRequeueStatus(note.trim() ? 'Review note saved' : 'Review note cleared');
      },
      meta: {
        model: entry.model,
        tool: entry.tool,
        seed: paramString(qp?.seed),
        cfg: paramString(qp?.cfg),
        steps: paramString(qp?.steps),
        width: paramString(qp?.width),
        height: paramString(qp?.height),
        prompt: entry.prompt,
        negativePrompt: entry.negativePrompt,
        derivedKind: galleryDerivedKindLabel(entry.derivedKind),
        host: formatComfyHostLabel(entry.comfyUrl) ?? undefined,
      },
      onCopyPrompt: entry.prompt
        ? () => {
            void navigator.clipboard.writeText(entry.prompt).catch(() => undefined);
          }
        : undefined,
      onCopyNegative: entry.negativePrompt
        ? () => {
            void navigator.clipboard.writeText(entry.negativePrompt ?? '').catch(() => undefined);
          }
        : undefined,
      compareSelected: selectedIdSet.has(entry.id),
      compareCount: selectedIds.length,
      onAddToCompare: () => {
        toggleSelected(entry.id);
        const nextSelected = selectedIdSet.has(entry.id)
          ? selectedIds.length - 1
          : selectedIds.length + 1;
        setRequeueStatus(
          nextSelected === 0
            ? 'Removed from compare selection'
            : `${nextSelected} selected for compare${
                nextSelected >= 2 && nextSelected <= 4
                  ? ' · ready'
                  : nextSelected > 4
                    ? ' · max 4'
                    : ''
              }`
        );
      },
      onOpenCompare: () => {
        if (selectedIds.length >= 2 && selectedIds.length <= 4) {
          setCompareOpen(true);
        } else if (!selectedIdSet.has(entry.id) && selectedIds.length === 1) {
          toggleSelected(entry.id);
          setCompareOpen(true);
        } else {
          setRequeueStatus('Select 2–4 images to compare');
        }
      },
      onRemove: () => {
        if (!window.confirm('Remove this entry from the gallery?')) {
          return;
        }
        removeEntry(entry.id);
        setRequeueStatus('Removed from gallery');
      },
      hasParent,
      hasDerivatives,
      hasSibling,
      beforeAfterUrl,
      beforeAfterLabel: beforeAfterUrl
        ? galleryDerivedKindLabel(entry.derivedKind) || 'Parent'
        : undefined,
      job: jobLive,
      showOutpaint: completed && !isVideo,
      showControlNet: completed && !isVideo,
      showVideo: completed && !isVideo,
      onOutpaint: completed && !isVideo ? () => startOutpaintFromGalleryEntry(entry) : undefined,
      onControlNet:
        completed && !isVideo ? () => startControlNetFromGalleryEntry(entry) : undefined,
      onVideo: completed && !isVideo ? () => startVideoFromGalleryEntry(entry) : undefined,
      onReeditRefine: completed ? () => startReeditRefineFromGalleryEntry(entry) : undefined,
      onReeditCompose:
        completed && !isVideo ? () => startReeditComposeFromGalleryEntry(entry) : undefined,
      onShowParent: hasParent
        ? () => {
            if (!parentId) {
              return;
            }
            if (lightboxEntries.some(item => item.id === parentId)) {
              applyPlaylistState(resolveGalleryLightboxOpenIndex(lightboxEntries, parentId, 0));
              setRequeueStatus('Jumped to parent output');
              return;
            }
            setFilter(previous => ({
              ...previous,
              focusEntryId: parentId,
              derivativeOfEntryId: undefined,
              similarToEntryId: undefined,
            }));
            setRequeueStatus('Showing source output…');
          }
        : undefined,
      onShowDerivatives: hasDerivatives
        ? () => {
            setFilter(previous => ({
              ...previous,
              derivativeOfEntryId: entry.id,
              focusEntryId: undefined,
              similarToEntryId: undefined,
            }));
            setRequeueStatus('Showing derived outputs…');
          }
        : undefined,
      onJumpToSibling: hasSibling
        ? () => {
            if (!parentId) {
              return;
            }
            const siblings = lightboxEntries.filter(item => item.parentGalleryEntryId === parentId);
            if (siblings.length >= 2) {
              const current = siblings.findIndex(item => item.id === entry.id);
              const next = siblings[(current + 1) % siblings.length];
              if (next) {
                applyPlaylistState(resolveGalleryLightboxOpenIndex(lightboxEntries, next.id, 0));
                setRequeueStatus('Jumped to sibling output');
              }
              return;
            }
            setFilter(previous => ({
              ...previous,
              derivativeOfEntryId: parentId,
              focusEntryId: undefined,
              similarToEntryId: undefined,
            }));
            setRequeueStatus('Showing sibling outputs…');
          }
        : undefined,
    };
  }, [
    applyPlaylistState,
    entries,
    entryIdsWithDerivatives,
    handleReviewRating,
    lightboxEntries,
    removeEntry,
    resolvedLightbox,
    selectedIdSet,
    selectedIds.length,
    setFilter,
    toggleFavorite,
    toggleSelected,
  ]);

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
      {filter.derivativeOfEntryId || filter.focusEntryId || filter.derivedKind ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-xs text-[var(--accent-text)]">
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
            className="rounded-lg border border-[var(--accent-border)] px-2 py-0.5 text-[11px] transition hover:border-[var(--accent-border)] hover:text-[var(--accent-text)]"
          >
            Clear lineage filter
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {GALLERY_DERIVED_KIND_FILTERS.map(kind => (
            <button
              key={kind}
              type="button"
              data-testid={`gallery-derived-kind-${kind}`}
              onClick={() =>
                setFilter(previous => ({
                  ...previous,
                  derivedKind: previous.derivedKind === kind ? undefined : kind,
                }))
              }
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                filter.derivedKind === kind
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-base)]/40 text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }`}
            >
              {galleryDerivedKindChipLabel(kind)}
            </button>
          ))}
        </div>
      )}

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
