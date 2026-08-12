'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { ButtonLink } from '@/components/ui/Button';
import { useComfyUiGallery } from '@/hooks/useComfyUiGallery';
import GalleryVisionReviewButton from '@/components/gallery/GalleryVisionReviewButton';
import GalleryCardItem from '@/components/gallery/GalleryCardItem';
import GalleryDisplayGrid from '@/components/gallery/GalleryDisplayGrid';
import GalleryEmptyPanel from '@/components/gallery/GalleryEmptyPanel';
import GalleryFiltersBar from '@/components/gallery/GalleryFiltersBar';
import GalleryFailedRecoveryBanner from '@/components/gallery/GalleryFailedRecoveryBanner';
import GalleryReviewBanner from '@/components/gallery/GalleryReviewBanner';
import GalleryExperimentPanel from '@/components/gallery/GalleryExperimentPanel';
import GalleryStatsBar from '@/components/gallery/GalleryStatsBar';
import GalleryReviewTouchBar from '@/components/gallery/GalleryReviewTouchBar';
import GalleryPanelSkeleton from '@/components/gallery/GalleryPanelSkeleton';
import GalleryPaginator from '@/components/gallery/GalleryPaginator';
import StatusToastStrip from '@/components/ui/StatusToastStrip';
import { assessGalleryCapWarning, GALLERY_CAP_KEEPER_MIN_RATING } from '@/lib/gallery-cap';
import { galleryDerivedKindChipLabel, galleryDerivedKindLabel } from '@/lib/gallery-derived-kind';
import { MAX_GALLERY_ENTRIES } from '@/lib/comfyui-gallery-storage-meta';
import { applyGalleryUrlState, parseGalleryUrlState } from '@/lib/gallery-url-state';
import { useGalleryReview } from '@/hooks/useGalleryReview';
import { useGallerySelection } from '@/hooks/useGallerySelection';
import { useGalleryCompareHandlers } from '@/hooks/useGalleryCompareHandlers';
import { toneForStatusText } from '@/lib/status-progress';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
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
import {
  EXPERIMENT_WINNERS_UPDATED_EVENT,
  clearExperimentWinner,
  loadExperimentWinners,
  markExperimentWinner,
} from '@/lib/experiment-winners';
import { loadGalleryDensity, saveGalleryDensity, type GalleryDensity } from '@/lib/gallery-density';
import { toastBulkQueueSummary } from '@/lib/app-toast';
import {
  buildGalleryLightboxPlaylist,
  galleryEntryLightboxUrls,
  galleryEntryMediaKinds,
  galleryEntryPrimaryMediaKind,
  galleryEntryPrimaryThumbUrl,
  galleryEntryStripThumbUrls,
  galleryEntryViewUrls,
  GALLERY_PAGE_SIZE_ALL,
  GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  loadGalleryViewPreferences,
  paginateGalleryEntries,
  resolveGalleryPageSize,
  resolveGalleryLightboxEntry,
  resolveGalleryLightboxOpenIndex,
  saveGalleryViewPreferences,
  setGalleryReviewNote,
  sortGalleryEntries,
  type ComfyGalleryEntry,
  type ComfyGallerySort,
  type GalleryLayoutMode,
  type GalleryPageSize,
  type GallerySlideshowIntervalMs,
  type GallerySlideshowTransition,
} from '@/lib/comfyui-gallery';
import { prefetchGalleryImageUrl } from '@/lib/gallery-image-prefetch';
import {
  galleryHandoffHomePath,
  galleryPickActionLabel,
  galleryPickPurposeLabel,
  parseGalleryPickTarget,
} from '@/lib/gallery-handoff';
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
  const workspaceMode = useWorkspaceMode();
  const leanGallery = workspaceMode === 'simple' && showFilters && !compact;

  const {
    storeReady,
    entries,
    filteredEntries,
    filter,
    setFilter,
    tools,
    models,
    removeEntry,
    removeEntries,
    toggleFavorite,
    setFavorites,
    setReviewRatings,
    setProjectIds,
    clearAll,
    refreshPending,
    primaryThumbUrl,
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
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ComfyGallerySort>('queued-desc');
  const [pageSize, setPageSize] = useState<GalleryPageSize>(12);
  const [slideshowIntervalMs, setSlideshowIntervalMs] = useState<GallerySlideshowIntervalMs>(5000);
  const [slideshowTransition, setSlideshowTransition] =
    useState<GallerySlideshowTransition>('slide');
  const [layout, setLayout] = useState<GalleryLayoutMode>('grid');
  const [viewPrefsLoaded, setViewPrefsLoaded] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
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

  useEffect(() => {
    setFilter(previous => ({
      ...previous,
      projectId: resolvedProjectFilterId,
    }));
  }, [resolvedProjectFilterId, setFilter]);

  const bulkEnabled = showFilters && !compact;
  /** Full experiment/export menus stay advanced; lean still gets select + compare. */
  const leanBulkEnabled = bulkEnabled;
  const paginationEnabled = showFilters && !compact && !limit;
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
      const parsed = parseGalleryUrlState(new URLSearchParams(window.location.search));
      const hasFilter = Object.keys(parsed.filter).length > 0;
      if (hasFilter) {
        setFilter(previous => ({
          ...previous,
          ...parsed.filter,
          ...(parsed.filter.query?.trim() ? { semanticSearch: true } : {}),
        }));
      }
      if (parsed.sort) {
        setSort(parsed.sort);
      }
      if (parsed.projectFilterId !== undefined) {
        setProjectFilterId(parsed.projectFilterId);
      }
      setGalleryUrlReady(true);
    });
  }, [viewPrefsLoaded, setFilter]);

  useEffect(() => {
    if (!galleryUrlReady || !showFilters || typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    applyGalleryUrlState(url.searchParams, { filter, sort, projectFilterId });
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(null, '', next);
    }
  }, [filter, sort, projectFilterId, galleryUrlReady, showFilters]);

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
    });
    saveGalleryDensity(density);
  }, [
    sort,
    pageSize,
    slideshowIntervalMs,
    slideshowTransition,
    layout,
    density,
    viewPrefsLoaded,
    paginationEnabled,
  ]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPage(1);
    });
  }, [filter, sort, pageSize]);

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
    return paginateGalleryEntries(sortedSource, page, effectivePageSize);
  }, [sortedSource, limit, page, pageSize, paginationEnabled]);

  const visibleEntries = pagination.items;
  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;
  const totalFiltered = pagination.totalItems;
  const effectivePageSize = resolveGalleryPageSize(pageSize, totalFiltered);
  const showPagination =
    paginationEnabled && pageSize !== GALLERY_PAGE_SIZE_ALL && totalFiltered > effectivePageSize;
  const lineageGrouping = galleryLineageGroupingEnabled(filter);
  const lineageGroups = useMemo(
    () => (lineageGrouping ? buildGalleryLineageGroups(visibleEntries) : null),
    [lineageGrouping, visibleEntries]
  );
  const experimentGroups = useMemo(() => groupGalleryExperiments(visibleEntries), [visibleEntries]);
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
      if (lightboxPlaylist.images.length === 0) {
        return;
      }
      const safeIndex = Math.min(Math.max(index, 0), lightboxPlaylist.images.length - 1);
      setLightbox({
        images: lightboxPlaylist.images,
        thumbImages: lightboxPlaylist.thumbImages,
        originalImages: lightboxPlaylist.originalImages,
        downloadUrls: lightboxPlaylist.downloadUrls,
        downloadFilenames: lightboxPlaylist.downloadFilenames,
        titles: lightboxPlaylist.titles,
        mediaKinds: lightboxPlaylist.mediaKinds,
        index: safeIndex,
        title: lightboxPlaylist.titles[safeIndex],
      });
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
    if (lightboxPlaylist.images.length === 0) {
      return null;
    }
    const safeIndex = Math.min(Math.max(lightbox.index, 0), lightboxPlaylist.images.length - 1);
    return {
      images: lightboxPlaylist.images,
      thumbImages: lightboxPlaylist.thumbImages,
      originalImages: lightboxPlaylist.originalImages,
      downloadUrls: lightboxPlaylist.downloadUrls,
      downloadFilenames: lightboxPlaylist.downloadFilenames,
      titles: lightboxPlaylist.titles,
      mediaKinds: lightboxPlaylist.mediaKinds,
      index: safeIndex,
      title: lightboxPlaylist.titles[safeIndex],
    };
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
      onRequeue: () => {
        setRequeueStatus('Re-queueing…');
        void import('@/lib/comfyui-requeue').then(({ requeueComfyJobFromEntry }) =>
          requeueComfyJobFromEntry(entry, {
            newSeed: false,
            onStatus: setRequeueStatus,
          })
        );
      },
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
    paramAxis,
    filter,
    setLoraExportScope,
    setLoraExportOpen,
  });

  useEffect(() => {
    if (!paginationEnabled || page === currentPage) {
      return;
    }
    scheduleAfterCommit(() => {
      setPage(currentPage);
    });
  }, [currentPage, page, paginationEnabled]);

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
        previewUrl={primaryThumbUrl(entry)}
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
      pickFor,
      primaryThumbUrl,
      reviewFocusEntry?.id,
      selectedIdSet,
    ]
  );

  if (entries.length === 0 && !storeReady) {
    return <GalleryPanelSkeleton showFilters={showFilters} compact={compact} />;
  }

  return (
    <section className="space-y-6">
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
      {showHeader && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="type-heading text-[var(--text-primary)]">Gallery</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {leanGallery
                ? 'Browse ComfyUI outputs and rate results.'
                : 'Browse ComfyUI outputs, rate results, compare variants, and queue follow-up experiments.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshPending()}
              className="ui-btn-ghost ui-btn-sm text-xs"
            >
              Refresh jobs
            </button>
            {activeJobs > 0 ? (
              <span className="self-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100">
                {activeJobs} active
              </span>
            ) : null}
            {entries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Clear all gallery entries?')) {
                    clearAll();
                  }
                }}
                className="ui-btn-ghost ui-btn-sm text-xs text-[var(--text-muted)] hover:text-[var(--tint-danger-text)]"
              >
                Clear all
              </button>
            )}
            {!compact && limit && entries.length > limit && (
              <ButtonLink href="/gallery" size="sm">
                View all
              </ButtonLink>
            )}
          </div>
        </div>
      )}

      {pickFor ? (
        <div className="sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-3 shadow-[0_12px_40px_-20px_rgba(56,189,248,0.28)] backdrop-blur-md">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Choosing {galleryPickPurposeLabel(pickFor)}
            </p>
            <p className="type-caption text-[var(--text-secondary)]">
              Click a completed still image to send it back. Video clips are skipped.
            </p>
          </div>
          <ButtonLink href={galleryHandoffHomePath(pickFor)} variant="ghost" size="sm">
            Cancel
          </ButtonLink>
        </div>
      ) : null}

      {galleryCapWarning.message ? (
        <div
          data-testid="gallery-cap-warning"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
            galleryCapWarning.level === 'urgent'
              ? 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]'
              : 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
          }`}
        >
          <p className="min-w-0 flex-1">{galleryCapWarning.message}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setFilter(previous => ({
                  ...previous,
                  atRiskOnly: true,
                  favoritesOnly: undefined,
                  minRating: undefined,
                }))
              }
              className="rounded-xl border border-current/30 bg-black/10 px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 active:scale-[0.98]"
            >
              Show at-risk
            </button>
            <button
              type="button"
              onClick={exportCapKeepers}
              className="rounded-xl border border-current/30 bg-black/10 px-2.5 py-1 text-[11px] font-medium transition hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 active:scale-[0.98]"
            >
              Export keepers
            </button>
          </div>
        </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/20 px-4 py-3 text-xs text-[var(--text-muted)]">
          <span>Select cards to compare, export, queue, assign projects, or remove.</span>
          <div className="flex items-center gap-2">
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
          onCompare={() => setCompareOpen(true)}
          {...bulkExperimentHandlers}
        />
      ) : null}

      {downloadError && <p className="text-xs ui-status-danger">{downloadError}</p>}
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
          {(
            [
              'upscale',
              'refine',
              'soft-pass',
              'variation',
              'moire-clean',
              'face-detail',
              'controlnet',
            ] as const
          ).map(kind => (
            <button
              key={kind}
              type="button"
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
      {requeueStatus ? (
        <StatusToastStrip
          notes={[
            {
              id: 'gallery-requeue',
              text: requeueStatus,
              tone: toneForStatusText(requeueStatus),
            },
          ]}
        />
      ) : null}

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
        <GalleryEmptyPanel filtered={entries.length > 0} onClearFilters={clearGalleryFilters} />
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
