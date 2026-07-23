"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
import ModalPortal from "@/components/ui/ModalPortal";
import ImageLightbox, { type ImageLightboxState } from "@/components/ui/ImageLightbox";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useComfyUiGallery } from "@/hooks/useComfyUiGallery";
import { startImproveFromGalleryEntry } from "@/lib/improve-output";
import {
  appendUserToolQualityRecipe,
  buildToolQualityRecipeFromGalleryEntry,
} from "@/lib/tool-quality-recipes";
import { loadSettingsCache, saveSharedSettings } from "@/lib/settings-cache";
import { recordAvoidedTokensFromGalleryEntry } from "@/lib/avoided-tokens";
import { recordCatalogBiasFromPrompt } from "@/lib/catalog-rating-bias";
import GalleryVisionReviewButton from "@/components/gallery/GalleryVisionReviewButton";
import GalleryCardItem, {
  type GalleryCardActions,
} from "@/components/gallery/GalleryCardItem";
import VirtualizedGalleryGrid, {
  shouldVirtualizeGalleryGrid,
} from "@/components/gallery/VirtualizedGalleryGrid";
import GalleryFiltersBar from "@/components/gallery/GalleryFiltersBar";
import GallerySelectionBar from "@/components/gallery/GallerySelectionBar";
import GalleryStatsBar from "@/components/gallery/GalleryStatsBar";
import GalleryReviewTouchBar from "@/components/gallery/GalleryReviewTouchBar";
import GalleryPanelSkeleton from "@/components/gallery/GalleryPanelSkeleton";
import { EmptyState } from "@/components/ui/ViewState";
import StatusToastStrip from "@/components/ui/StatusToastStrip";
import { resolveGenerateEmptyCta } from "@/lib/empty-cta";
import { toneForStatusText } from "@/lib/status-progress";
import { computeGalleryStats } from "@/lib/gallery-stats";
import { queueMutatedGalleryJobs } from "@/lib/gallery-mutations";
import { queueNegativeAbTest } from "@/lib/negative-ab-queue";
import { queueSeedExperiment } from "@/lib/seed-experiment-queue";
import {
  queueParamExperiment,
  type ParamExperimentAxis,
} from "@/lib/param-experiment-queue";
import { learnFromLowRatedPrompt } from "@/lib/negative-learner";
import { pushNotification } from "@/lib/notification-center";
import { toastBulkQueueSummary, toastHeldMax, toastQueueOutcome } from "@/lib/app-toast";
import { useHeldMaxCount } from "@/hooks/useHeldMaxJobs";
import { suggestRatingMutations } from "@/lib/rating-prompt-mutations";
import { markOnboardingGalleryReview } from "@/lib/onboarding-hooks";
import { setLineageParent } from "@/lib/prompt-lineage-session";
import { loadActiveProjectId, loadPromptProjects } from "@/lib/prompt-projects";
import {
  galleryTopicsPath,
  galleryVariationsPath,
  saveGalleryTopicsHandoff,
  saveGalleryVariationsHandoff,
  buildGalleryVariationsHandoff,
} from "@/lib/gallery-variations-handoff";
import { exportGalleryCsv, exportGalleryJsonl, downloadTextFile } from "@/lib/history-export-formats";
import {
  downloadGalleryImagesSequential,
  downloadGallerySidecarBundle,
} from "@/lib/comfyui-gallery-export";
import { studioHistoryUrl } from "@/lib/prompt-lineage";
import { cancelComfyGalleryJob } from "@/lib/comfyui-queue-cancel";
import {
  buildGalleryLineageGroups,
  galleryLineageGroupingEnabled,
} from "@/lib/gallery-lineage-groups";
import { resolveRequeueImageUrlsFromEntry } from "@/lib/queue-requeue-images";
import {
  buildGalleryLightboxPlaylist,
  galleryEntryPrimaryMediaKind,
  galleryEntryStripThumbUrls,
  galleryEntryViewUrls,
  GALLERY_ALL_RENDER_CHUNK,
  GALLERY_PAGE_SIZE_ALL,
  GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
  GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
  loadGalleryViewPreferences,
  paginateGalleryEntries,
  resolveGalleryPageSize,
  resolveGalleryLightboxOpenIndex,
  saveGalleryViewPreferences,
  sortGalleryEntries,
  type ComfyGalleryEntry,
  type ComfyGallerySort,
  type GalleryLayoutMode,
  type GalleryPageSize,
  type GallerySlideshowIntervalMs,
  type GallerySlideshowTransition,
} from "@/lib/comfyui-gallery";
import {
  buildGalleryHandoff,
  galleryHandoffHomePath,
  galleryHandoffPath,
  galleryPickActionLabel,
  galleryPickPurposeLabel,
  parseGalleryPickTarget,
  saveGalleryHandoff,
} from "@/lib/gallery-handoff";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import LoraDatasetExportDialog from "@/components/LoraDatasetExportDialog";

const GalleryComparePanel = dynamic(() => import("@/components/GalleryComparePanel"), {
  loading: () => null,
});
const GalleryWorkflowModal = dynamic(
  () => import("@/components/gallery/GalleryWorkflowModal"),
  { loading: () => null },
);

/** Lazy-load the requeue pipeline so gallery browse TTI stays light. */
const loadGalleryRequeue = () => import("@/lib/comfyui-requeue");

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
  const {
    storeReady,
    entries,
    filteredEntries,
    filter,
    setFilter,
    tools,
    removeEntry,
    removeEntries,
    toggleFavorite,
    setFavorites,
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
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");
    const focus = params.get("focus");
    const review = params.get("review");
    if (!query?.trim() && !focus?.trim() && review !== "1") {
      return;
    }
    setFilter((previous) => ({
      ...previous,
      ...(query?.trim()
        ? { query: query.trim(), semanticSearch: true }
        : {}),
      ...(focus?.trim() ? { focusEntryId: focus.trim() } : {}),
      ...(review === "1"
        ? { reviewMode: true, unreviewedOnly: true }
        : {}),
    }));
  }, [setFilter]);

  // Derive from the live URL — Soft nav from /gallery → /gallery?pickFor=… reuses
  // this panel; a one-shot useState initializer would leave pick mode stuck off.
  const searchParams = useSearchParams();
  const pickFor = useMemo(
    () => parseGalleryPickTarget(searchParams.get("pickFor")),
    [searchParams],
  );

  const router = useRouter();
  const heldMaxCount = useHeldMaxCount();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [requeueStatus, setRequeueStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const [slideshowFullscreen, setSlideshowFullscreen] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ComfyGallerySort>("queued-desc");
  const [pageSize, setPageSize] = useState<GalleryPageSize>(12);
  const [slideshowIntervalMs, setSlideshowIntervalMs] =
    useState<GallerySlideshowIntervalMs>(5000);
  const [slideshowTransition, setSlideshowTransition] =
    useState<GallerySlideshowTransition>("slide");
  const [layout, setLayout] = useState<GalleryLayoutMode>("grid");
  const [viewPrefsLoaded, setViewPrefsLoaded] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [loraExportOpen, setLoraExportOpen] = useState(false);
  const [loraExportScope, setLoraExportScope] = useState<"favorites" | "selected">(
    "favorites",
  );
  const [compareWinnerId, setCompareWinnerId] = useState<string | null>(null);
  const [workflowEntry, setWorkflowEntry] = useState<ComfyGalleryEntry | null>(null);
  const [compareStatus, setCompareStatus] = useState<string | null>(null);
  const [collapsedLineageGroups, setCollapsedLineageGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [paramAxis, setParamAxis] = useState<ParamExperimentAxis>("cfg");
  const [projectFilterId, setProjectFilterId] = useState<string>("");
  const [projects] = useState(() => loadPromptProjects());
  const [allRenderLimit, setAllRenderLimit] = useState(GALLERY_ALL_RENDER_CHUNK);
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
  const galleryCardActionsRef = useRef<GalleryCardActions>({
    toggleSelected: () => undefined,
    remove: () => undefined,
    toggleFavorite: () => undefined,
    requeue: () => undefined,
    cancel: () => undefined,
    upscale: () => undefined,
    refine: () => undefined,
    faceDetail: () => undefined,
    moireClean: () => undefined,
    showParent: () => undefined,
    showDerivatives: () => undefined,
    openImage: () => undefined,
    reviewRating: () => undefined,
    downloadError: () => undefined,
    visionTagClick: () => undefined,
    viewWorkflow: () => undefined,
    pick: () => undefined,
  });
  const resolvedProjectFilterId = useMemo(() => {
    if (projectFilterId === "active") {
      return loadActiveProjectId();
    }
    return projectFilterId || undefined;
  }, [projectFilterId]);

  useEffect(() => {
    setFilter((previous) => ({
      ...previous,
      projectId: resolvedProjectFilterId,
    }));
  }, [resolvedProjectFilterId, setFilter]);

  const bulkEnabled = showFilters && !compact;
  const paginationEnabled = showFilters && !compact && !limit;
  const galleryStats = useMemo(() => computeGalleryStats(entries), [entries]);
  const activeJobs = galleryStats.pending + galleryStats.running;

  const filteredSource = showFilters ? filteredEntries : entries;
  const sortedSource = useMemo(
    () => (paginationEnabled ? sortGalleryEntries(filteredSource, sort) : filteredSource),
    [filteredSource, paginationEnabled, sort],
  );

  useEffect(() => {
    scheduleAfterCommit(() => {
      const preferences = loadGalleryViewPreferences();
      setSort(preferences.sort);
      setPageSize(preferences.pageSize);
      setSlideshowIntervalMs(preferences.slideshowIntervalMs);
      setSlideshowTransition(preferences.slideshowTransition);
      setLayout(preferences.layout);
      setViewPrefsLoaded(true);
    });
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
  }, [
    sort,
    pageSize,
    slideshowIntervalMs,
    slideshowTransition,
    layout,
    viewPrefsLoaded,
    paginationEnabled,
  ]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPage(1);
      setAllRenderLimit(GALLERY_ALL_RENDER_CHUNK);
    });
  }, [filter.status, filter.tool, filter.favoritesOnly, filter.query, sort, pageSize]);

  const pagination = useMemo(() => {
    if (!paginationEnabled) {
      const items = limit ? sortedSource.slice(0, limit) : sortedSource;
      return {
        items,
        page: 1,
        totalPages: 1,
        totalItems: sortedSource.length,
        hasMoreAll: false,
        remainingAll: 0,
      };
    }

    if (pageSize === GALLERY_PAGE_SIZE_ALL) {
      const items = sortedSource.slice(0, allRenderLimit);
      const remainingAll = Math.max(sortedSource.length - allRenderLimit, 0);
      return {
        items,
        page: 1,
        totalPages: 1,
        totalItems: sortedSource.length,
        hasMoreAll: remainingAll > 0,
        remainingAll,
      };
    }

    const effectivePageSize = resolveGalleryPageSize(pageSize, sortedSource.length);
    return {
      ...paginateGalleryEntries(sortedSource, page, effectivePageSize),
      hasMoreAll: false,
      remainingAll: 0,
    };
  }, [sortedSource, limit, page, pageSize, paginationEnabled, allRenderLimit]);

  const visibleEntries = pagination.items;
  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;
  const totalFiltered = pagination.totalItems;
  const hasMoreAll = pagination.hasMoreAll;
  const remainingAll = pagination.remainingAll;
  const effectivePageSize = resolveGalleryPageSize(pageSize, totalFiltered);
  const showPagination = paginationEnabled && pageSize !== GALLERY_PAGE_SIZE_ALL && totalFiltered > effectivePageSize;
  const lineageGrouping = galleryLineageGroupingEnabled(filter);
  const lineageGroups = useMemo(
    () => (lineageGrouping ? buildGalleryLineageGroups(visibleEntries) : null),
    [lineageGrouping, visibleEntries],
  );
  const galleryCardGridClass =
    layout === "dense"
      ? compact
        ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        : "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      : compact
        ? "grid grid-cols-2 gap-4 sm:grid-cols-3"
        : "grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
  const galleryVirtualGridClass =
    layout === "dense"
      ? compact
        ? "grid gap-3"
        : "grid gap-4"
      : compact
        ? "grid gap-4"
        : "grid gap-6";
  const lineageFlatEntries = useMemo(() => {
    if (!lineageGroups) {
      return visibleEntries;
    }
    const flat: ComfyGalleryEntry[] = [];
    for (const group of lineageGroups) {
      flat.push(group.root);
      if (!collapsedLineageGroups.has(group.root.id)) {
        flat.push(...group.derivatives);
      }
    }
    return flat;
  }, [collapsedLineageGroups, lineageGroups, visibleEntries]);

  const virtualizeGrid = shouldVirtualizeGalleryGrid(
    lineageGrouping ? lineageFlatEntries.length : visibleEntries.length,
  );
  const virtualizedEntries = lineageGrouping ? lineageFlatEntries : visibleEntries;

  const lightboxPlaylist = useMemo(
    () => buildGalleryLightboxPlaylist(visibleEntries),
    [visibleEntries],
  );

  const openEntryLightbox = useCallback(
    (entry: ComfyGalleryEntry, imageIndex: number) => {
      if (lightboxPlaylist.images.length === 0) {
        return;
      }

      const index = resolveGalleryLightboxOpenIndex(
        visibleEntriesRef.current,
        entry.id,
        imageIndex,
      );

      setLightbox({
        images: lightboxPlaylist.images,
        originalImages: lightboxPlaylist.originalImages,
        titles: lightboxPlaylist.titles,
        mediaKinds: lightboxPlaylist.mediaKinds,
        index,
        title: lightboxPlaylist.titles[index],
      });
      setSlideshowPlaying(false);
      setSlideshowFullscreen(false);
    },
    [lightboxPlaylist],
  );

  const openLightboxForEntryId = useCallback(
    (entryId: string, imageIndex: number) => {
      const entry = visibleEntriesRef.current.find((item) => item.id === entryId);
      if (entry) {
        openEntryLightbox(entry, imageIndex);
      }
    },
    [openEntryLightbox],
  );

  const startSlideshow = () => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }

    setLightbox({
      images: lightboxPlaylist.images,
      originalImages: lightboxPlaylist.originalImages,
      titles: lightboxPlaylist.titles,
      mediaKinds: lightboxPlaylist.mediaKinds,
      index: 0,
      title: lightboxPlaylist.titles[0],
    });
    setSlideshowFullscreen(false);
    setSlideshowPlaying(true);
  };

  const startFullscreenSlideshow = () => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }

    setLightbox({
      images: lightboxPlaylist.images,
      originalImages: lightboxPlaylist.originalImages,
      titles: lightboxPlaylist.titles,
      mediaKinds: lightboxPlaylist.mediaKinds,
      index: 0,
      title: lightboxPlaylist.titles[0],
    });
    setSlideshowFullscreen(true);
    setSlideshowPlaying(true);
  };

  const closeLightbox = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    setLightbox(null);
    setSlideshowPlaying(false);
    setSlideshowFullscreen(false);
  };

  useEffect(() => {
    if (!paginationEnabled || page === currentPage) {
      return;
    }
    scheduleAfterCommit(() => {
      setPage(currentPage);
    });
  }, [currentPage, page, paginationEnabled]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedEntries = useMemo(
    () => visibleEntries.filter((entry) => selectedIdSet.has(entry.id)),
    [selectedIdSet, visibleEntries],
  );

  const reviewFocusIndex = useMemo(() => {
    if (!filter.reviewMode || visibleEntries.length === 0) {
      return 0;
    }
    const selectedIndex = visibleEntries.findIndex((entry) => selectedIdSet.has(entry.id));
    return selectedIndex >= 0 ? selectedIndex : 0;
  }, [filter.reviewMode, visibleEntries, selectedIdSet]);

  const reviewFocusEntry = visibleEntries[reviewFocusIndex] ?? null;

  const advanceReviewFocus = useCallback(
    (entryId: string) => {
      if (!filter.reviewAutoAdvance) {
        return;
      }
      const startIndex = visibleEntries.findIndex((entry) => entry.id === entryId);
      for (let index = startIndex + 1; index < visibleEntries.length; index += 1) {
        const nextEntry = visibleEntries[index];
        if (nextEntry.status === "completed" && !nextEntry.reviewRating) {
          setSelectedIds([nextEntry.id]);
          return;
        }
      }
    },
    [filter.reviewAutoAdvance, visibleEntries],
  );

  const handleReviewRating = useCallback(
    (entry: ComfyGalleryEntry, rating: NonNullable<ComfyGalleryEntry["reviewRating"]>) => {
      setReviewRating(entry.id, rating);
      recordCatalogBiasFromPrompt(entry.prompt, rating);
      if (rating >= 4) {
        void import("@/lib/sampler-memory").then(({ rememberSamplerFromGalleryEntry }) => {
          rememberSamplerFromGalleryEntry(entry);
        });
      }
      if (rating <= 2) {
        const added = recordAvoidedTokensFromGalleryEntry({
          prompt: entry.prompt,
          visionTags: entry.visionTags,
        });
        if (added > 0) {
          setRequeueStatus(`Added ${added} motif(s) to avoided tokens from low rating.`);
        }
        const learned = learnFromLowRatedPrompt(entry.prompt, rating);
        if (learned > 0) {
          pushNotification({
            title: "Negative learner",
            body: `${learned} token(s) recorded from low rating. Review in Settings → Advanced.`,
            href: "/settings",
            kind: "system",
          });
        }
      }
      markOnboardingGalleryReview();
      void import("@/lib/auto-improve-loop")
        .then(({ runAutoImproveOnRating }) => runAutoImproveOnRating(entry, rating))
        .then((message) => {
          if (message) {
            setRequeueStatus(message);
          }
        })
        .catch((error) => {
          setRequeueStatus(
            error instanceof Error ? error.message : "Auto-improve failed after rating.",
          );
        });
      advanceReviewFocus(entry.id);
    },
    [advanceReviewFocus, setReviewRating],
  );

  useEffect(() => {
    if (!filter.reviewMode || visibleEntries.length === 0) {
      return;
    }
    if (selectedIds.length === 0) {
      const firstCompleted =
        visibleEntries.find((entry) => entry.status === "completed") ??
        visibleEntries[0];
      if (firstCompleted) {
        scheduleAfterCommit(() => {
          setSelectedIds([firstCompleted.id]);
        });
      }
    }
  }, [filter.reviewMode, visibleEntries, selectedIds.length]);

  useEffect(() => {
    if (!filter.focusEntryId?.trim()) {
      return;
    }
    const id = filter.focusEntryId.trim();
    const node = document.querySelector(`[data-gallery-entry="${CSS.escape(id)}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    scheduleAfterCommit(() => {
      setSelectedIds((previous) => (previous.includes(id) ? previous : [id]));
    });
  }, [filter.focusEntryId, visibleEntries.length]);

  useEffect(() => {
    if (!filter.reviewMode || !reviewFocusEntry) {
      return;
    }
    const node = document.querySelector(`[data-gallery-entry="${reviewFocusEntry.id}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [filter.reviewMode, reviewFocusEntry?.id, reviewFocusEntry]);

  useEffect(() => {
    if (!filter.reviewMode || !reviewFocusEntry) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key >= "1" && event.key <= "5") {
        const rating = Number(event.key) as 1 | 2 | 3 | 4 | 5;
        handleReviewRating(reviewFocusEntry, rating);
        event.preventDefault();
        return;
      }

      if (event.key === "f" || event.key === "F") {
        toggleFavorite(reviewFocusEntry.id);
        event.preventDefault();
        return;
      }

      if (event.key === "n" || event.key === "N" || event.key === "ArrowRight") {
        const nextIndex = Math.min(reviewFocusIndex + 1, visibleEntries.length - 1);
        const nextEntry = visibleEntries[nextIndex];
        if (nextEntry) {
          setSelectedIds([nextEntry.id]);
        }
        event.preventDefault();
        return;
      }

      if (event.key === "p" || event.key === "P" || event.key === "ArrowLeft") {
        const previousIndex = Math.max(reviewFocusIndex - 1, 0);
        const previousEntry = visibleEntries[previousIndex];
        if (previousEntry) {
          setSelectedIds([previousEntry.id]);
        }
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    filter.reviewMode,
    reviewFocusEntry,
    reviewFocusIndex,
    visibleEntries,
    handleReviewRating,
    toggleFavorite,
  ]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return [...next];
    });
  }, []);

  useLayoutEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useLayoutEffect(() => {
    visibleEntriesRef.current = visibleEntries;
  }, [visibleEntries]);

  useLayoutEffect(() => {
    galleryCardActionsRef.current = {
      toggleSelected,
      remove: removeEntry,
      toggleFavorite: (id: string) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        const willFavorite = entry ? !entry.favorite : false;
        toggleFavorite(id);
        if (entry && willFavorite) {
          void import("@/lib/auto-improve-loop").then(({ runAutoImproveOnFavorite }) =>
            runAutoImproveOnFavorite(entry, true),
          ).then((message) => {
            if (message) {
              setRequeueStatus(message);
            }
          });
        }
      },
      requeue: (id: string, newSeed: boolean, qualityProfile?: import("@/lib/queue-quality-profile").QueueQualityProfile) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus("Queueing variation…");
        void loadGalleryRequeue()
          .then(({ requeueComfyJobFromEntry }) =>
            requeueComfyJobFromEntry(entry, {
              newSeed,
              qualityProfile,
              onStatus: setRequeueStatus,
            }),
          )
          .then((result) => {
          if (!result.ok) {
            const message = result.error ?? "Re-queue failed.";
            setRequeueStatus(message);
            toastQueueOutcome({ ok: false, text: message });
            return;
          }
          const profileNote = qualityProfile ? `${qualityProfile} quality · ` : "";
          const message = [
              "queued variation",
              profileNote,
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
              newSeed ? "new seed" : "same params",
            ]
              .filter(Boolean)
              .join(" · ");
          setRequeueStatus(message);
          toastQueueOutcome({ ok: true, text: message });
        });
      },
      cancel: (id: string) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus("Cancelling job…");
        void cancelComfyGalleryJob(entry).then((result) => {
          if (!result.ok) {
            const message = result.error ?? "Cancel failed.";
            setRequeueStatus(message);
            toastQueueOutcome({ ok: false, text: message });
            return;
          }
          setRequeueStatus("Job cancelled.");
          toastQueueOutcome({ ok: true, text: "Job cancelled" });
        });
      },
      upscale: (
        id: string,
        qualityProfile: "final" | "max",
        options?: { force?: boolean },
      ) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus(options?.force ? "Force upscaling…" : "Upscaling…");
        void loadGalleryRequeue()
          .then(({ requeueUpscaleFromGalleryEntry }) =>
            requeueUpscaleFromGalleryEntry(entry, {
              qualityProfile,
              force: options?.force,
              onStatus: setRequeueStatus,
            }),
          )
          .then((result) => {
          if (!result.ok) {
            setRequeueStatus(result.error ?? "Upscale failed.");
            toastQueueOutcome({ ok: false, text: result.error ?? "Upscale failed." });
            return;
          }
          if (result.held) {
            const message = "Max upscale held until ComfyUI queue is idle";
            setRequeueStatus(message);
            toastHeldMax({ text: message });
            return;
          }
          const message = [
              options?.force ? "force upscale queued" : "upscale queued",
              result.vramDowngraded
                ? "Max → Final (VRAM)"
                : `${qualityProfile} quality · same image`,
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(" · ");
          setRequeueStatus(message);
          toastQueueOutcome({ ok: true, text: message });
        });
      },
      refine: (id: string) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus("Queueing low-denoise refine…");
        void loadGalleryRequeue()
          .then(({ requeueRefineFromGalleryEntry }) =>
            requeueRefineFromGalleryEntry(entry, {
              onStatus: setRequeueStatus,
            }),
          )
          .then((result) => {
          if (!result.ok) {
            setRequeueStatus(result.error ?? "Refine failed.");
            toastQueueOutcome({ ok: false, text: result.error ?? "Refine failed." });
            return;
          }
          if (result.held) {
            const message = "Max refine held until ComfyUI queue is idle";
            setRequeueStatus(message);
            toastHeldMax({ text: message });
            return;
          }
          const message = [
              "refine queued",
              result.vramDowngraded
                ? "Max → Final (VRAM)"
                : "low denoise · same seed",
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(" · ");
          setRequeueStatus(message);
          toastQueueOutcome({ ok: true, text: message });
        });
      },
      faceDetail: (id: string) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus("Queueing face detail…");
        void loadGalleryRequeue()
          .then(({ requeueFaceDetailFromGalleryEntry }) =>
            requeueFaceDetailFromGalleryEntry(entry, {
              onStatus: setRequeueStatus,
            }),
          )
          .then((result) => {
          if (!result.ok) {
            setRequeueStatus(result.error ?? "Face detail failed.");
            toastQueueOutcome({ ok: false, text: result.error ?? "Face detail failed." });
            return;
          }
          if (result.held) {
            const message = "Face detail held until ComfyUI queue is idle";
            setRequeueStatus(message);
            toastHeldMax({ text: message });
            return;
          }
          const message = [
              "face detail queued",
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(" · ");
          setRequeueStatus(message);
          toastQueueOutcome({ ok: true, text: message });
        });
      },
      moireClean: (
        id: string,
        qualityProfile: "final" | "max",
        options?: { force?: boolean },
      ) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus(
          options?.force
            ? qualityProfile === "max"
              ? "Force moiré clean (Max)…"
              : "Force moiré clean (Final)…"
            : qualityProfile === "max"
              ? "Queueing moiré clean (Max)…"
              : "Queueing moiré clean (Final)…",
        );
        void loadGalleryRequeue()
          .then(({ requeueMoireCleanFromGalleryEntry }) =>
            requeueMoireCleanFromGalleryEntry(entry, {
              qualityProfile,
              force: options?.force,
              onStatus: setRequeueStatus,
            }),
          )
          .then((result) => {
          if (!result.ok) {
            setRequeueStatus(result.error ?? "Moiré clean failed.");
            toastQueueOutcome({
              ok: false,
              text: result.error ?? "Moiré clean failed.",
            });
            return;
          }
          if (result.held) {
            const message = "Max moiré clean held until ComfyUI queue is idle";
            setRequeueStatus(message);
            toastHeldMax({ text: message });
            return;
          }
          const message = [
              options?.force ? "force moiré clean queued" : "moiré clean queued",
              result.vramDowngraded
                ? "Max → Final (VRAM)"
                : qualityProfile === "max"
                  ? "Max · blur → bicubic → Lanczos"
                  : "Final · soft blur only",
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(" · ");
          setRequeueStatus(message);
          toastQueueOutcome({ ok: true, text: message });
        });
      },
      showParent: (id: string) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (!entry?.parentGalleryEntryId) {
          return;
        }
        setFilter((previous) => ({
          ...previous,
          focusEntryId: entry.parentGalleryEntryId,
          derivativeOfEntryId: undefined,
          similarToEntryId: undefined,
        }));
        setRequeueStatus("Showing source output…");
      },
      showDerivatives: (id: string) => {
        setFilter((previous) => ({
          ...previous,
          derivativeOfEntryId: id,
          focusEntryId: undefined,
          similarToEntryId: undefined,
        }));
        setRequeueStatus("Showing derived outputs…");
      },
      openImage: openLightboxForEntryId,
      reviewRating: (id: string, rating: ComfyGalleryEntry["reviewRating"]) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (entry && rating) {
          handleReviewRating(entry, rating);
        }
      },
      downloadError: setDownloadError,
      visionTagClick: (tag: string) => {
        setFilter((previous) => ({ ...previous, query: tag }));
      },
      viewWorkflow: (id: string) => {
        const entry = entriesRef.current.find((item) => item.id === id);
        if (entry) {
          setWorkflowEntry(entry);
        }
      },
      pick: (id: string) => {
        const target = pickFor;
        if (!target) {
          return;
        }
        const entry = entriesRef.current.find((item) => item.id === id);
        if (!entry || entry.status !== "completed") {
          setRequeueStatus("Pick a completed still image.");
          return;
        }
        if (galleryEntryPrimaryMediaKind(entry) !== "image") {
          setRequeueStatus("Only still images can be picked in this mode.");
          return;
        }
        saveGalleryHandoff(buildGalleryHandoff(entry, target));
        router.push(galleryHandoffPath(target));
      },
    };
  }, [
    toggleSelected,
    removeEntry,
    toggleFavorite,
    openLightboxForEntryId,
    handleReviewRating,
    setFilter,
    pickFor,
    router,
  ]);

  if (entries.length === 0 && !storeReady) {
    return <GalleryPanelSkeleton showFilters={showFilters} compact={compact} />;
  }

  return (
    <section className="space-y-6">
      <ImageLightbox
        state={lightbox}
        onClose={closeLightbox}
        onIndexChange={(index) =>
          setLightbox((previous) =>
            previous
              ? {
                  ...previous,
                  index,
                  title: previous.titles?.[index] ?? previous.title,
                }
              : previous,
          )
        }
        slideshow={
          lightboxPlaylist.images.length > 1
            ? {
                playing: slideshowPlaying,
                intervalMs: slideshowIntervalMs,
                intervalOptions: GALLERY_SLIDESHOW_INTERVAL_OPTIONS,
                transition: slideshowTransition,
                transitionOptions: GALLERY_SLIDESHOW_TRANSITION_OPTIONS,
                onPlayingChange: setSlideshowPlaying,
                onIntervalChange: (intervalMs) =>
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
            <h2 className="type-heading text-zinc-100">Gallery</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Browse ComfyUI outputs, rate results, compare variants, and queue follow-up
              experiments.
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
                  if (window.confirm("Clear all gallery entries?")) {
                    clearAll();
                  }
                }}
                className="ui-btn-ghost ui-btn-sm text-xs text-zinc-500 hover:text-rose-300"
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
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 shadow-[0_12px_40px_-20px_rgba(109,40,217,0.55)] backdrop-blur-md">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-violet-50">
              Choosing {galleryPickPurposeLabel(pickFor)}
            </p>
            <p className="type-caption text-violet-100/70">
              Click a completed still image to send it back. Video clips are skipped.
            </p>
          </div>
          <ButtonLink href={galleryHandoffHomePath(pickFor)} variant="ghost" size="sm">
            Cancel
          </ButtonLink>
        </div>
      ) : null}

      {showFilters && entries.length > 0 ? (
        <GalleryStatsBar
          stats={galleryStats}
          filter={filter}
          activeJobs={activeJobs}
          heldMaxJobs={heldMaxCount}
          onRefreshPending={() => void refreshPending()}
          onQuickFilter={(patch) => setFilter((previous) => ({ ...previous, ...patch }))}
        />
      ) : null}

      {showFilters && (
        <GalleryFiltersBar
          filter={filter}
          setFilter={setFilter}
          tools={tools}
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

      {showPagination && (
        <GalleryPaginator
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalFiltered}
          pageSize={effectivePageSize}
          onPageChange={setPage}
        />
      )}

      {bulkEnabled && visibleEntries.length > 0 && selectedIds.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-zinc-800/80 bg-zinc-950/20 px-4 py-3 text-xs text-zinc-500">
          <span>
            Select cards to compare, export, queue, assign projects, or remove.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoraExportScope("favorites");
                setLoraExportOpen(true);
              }}
              className="ui-btn-ghost ui-btn-sm"
            >
              Export LoRA dataset (favorites/4–5★)
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(visibleEntries.map((entry) => entry.id))}
              className="ui-btn-ghost ui-btn-sm"
            >
              Select visible ({visibleEntries.length})
            </button>
          </div>
        </div>
      ) : null}

      {bulkEnabled ? (
        <GallerySelectionBar
          selectedCount={selectedIds.length}
          selectedEntries={selectedEntries}
          projects={projects}
          paramAxis={paramAxis}
          setParamAxis={setParamAxis}
          similarSearchActive={similarSearchActive}
          onClearSelection={() => setSelectedIds([])}
          onCompare={() => setCompareOpen(true)}
          onAssignActiveProject={() => {
            const projectId = loadActiveProjectId();
            if (!projectId) {
              setRequeueStatus("Set an active project in Studio first.");
              return;
            }
            setProjectIds(selectedIds, projectId);
            setRequeueStatus(`Assigned ${selectedIds.length} entries to active project.`);
          }}
          onAssignProject={(projectId) => {
            setProjectIds(selectedIds, projectId);
            setRequeueStatus(`Assigned ${selectedIds.length} entries.`);
          }}
          onFavorite={(favorite) => setFavorites(selectedIds, favorite)}
          onDelete={() => {
            const count = selectedIds.length;
            if (
              !window.confirm(
                `Remove ${count} selected ${count === 1 ? "entry" : "entries"} from the gallery?`,
              )
            ) {
              return;
            }
            removeEntries(selectedIds);
            setSelectedIds([]);
            setRequeueStatus(`Removed ${count} ${count === 1 ? "entry" : "entries"}.`);
          }}
          onExportSidecars={() => {
            downloadGallerySidecarBundle(selectedEntries);
            setRequeueStatus(`Exported ${selectedEntries.length} sidecar(s).`);
          }}
          onDownloadImages={() => {
            setRequeueStatus("Downloading selected images…");
            void downloadGalleryImagesSequential(selectedEntries).then((count) => {
              setRequeueStatus(`Downloaded ${count} image(s).`);
            });
          }}
          onExportZip={() => {
            setRequeueStatus("Building ZIP export…");
            void import("@/lib/gallery-zip-export").then(({ downloadGalleryZipBundle }) =>
              downloadGalleryZipBundle(selectedEntries),
            ).then((count) => {
              setRequeueStatus(`ZIP export prepared for ${count} entries.`);
            });
          }}
          onExportLoraDataset={() => {
            setLoraExportScope("selected");
            setLoraExportOpen(true);
          }}
          onExportCompareJson={() => {
            void import("@/lib/gallery-compare-export").then(({ downloadCompareExport }) =>
              downloadCompareExport(selectedEntries.slice(0, 4), "json"),
            );
          }}
          onExportCompareHtml={() => {
            void import("@/lib/gallery-compare-export").then(({ downloadCompareExport }) =>
              downloadCompareExport(selectedEntries.slice(0, 4), "html"),
            );
          }}
          onFindSimilar={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            setFilter((previous) => ({
              ...previous,
              similarToEntryId: entry.id,
              query: undefined,
            }));
            setRequeueStatus(`Finding outputs similar to ${entry.model ?? "selection"}…`);
          }}
          onClearSimilar={() =>
            setFilter((previous) => ({ ...previous, similarToEntryId: undefined }))
          }
          canClearSimilar={Boolean(filter.similarToEntryId)}
          onSeedExperiment={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            setRequeueStatus("Queueing seed experiment…");
            void queueSeedExperiment({
              prompt: entry.prompt,
              model: entry.model ?? "qwen-image-2512",
              negativePrompt: entry.negativePrompt,
              hints: entry.prompt.slice(0, 200),
              count: 4,
            }).then(({ queued, held, seeds }) => {
              if (held > 0) {
                toastHeldMax({
                  text: "Max seed experiment held until ComfyUI is idle",
                  count: held,
                });
              }
              setRequeueStatus(
                [
                  `Seed experiment queued ${queued}`,
                  held > 0 ? `held ${held}` : null,
                  `seeds ${seeds.join(", ")}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
              );
            });
          }}
          onParamExperiment={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            setRequeueStatus(`Queueing ${paramAxis} experiment…`);
            void queueParamExperiment({
              prompt: entry.prompt,
              model: entry.model ?? "qwen-image-2512",
              negativePrompt: entry.negativePrompt,
              hints: entry.prompt.slice(0, 200),
              axis: paramAxis,
              baseParams: entry.queueParams,
              count: 4,
            }).then(({ queued, held, labels }) => {
              if (held > 0) {
                toastHeldMax({
                  text: "Max param experiment held until ComfyUI is idle",
                  count: held,
                });
              }
              setRequeueStatus(
                [
                  `Param experiment queued ${queued}`,
                  held > 0 ? `held ${held}` : null,
                  labels.join(", "),
                ]
                  .filter(Boolean)
                  .join(" · "),
              );
            });
          }}
          onParamGrid={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            setRequeueStatus("Queueing CFG × steps grid…");
            void import("@/lib/param-experiment-grid").then(({ queueParamExperimentGrid }) =>
              queueParamExperimentGrid({
                prompt: entry.prompt,
                model: entry.model ?? "qwen-image-2512",
                negativePrompt: entry.negativePrompt,
                hints: entry.prompt.slice(0, 200),
                baseParams: entry.queueParams,
              }),
            ).then(({ queued, held, cells }) => {
              if (held > 0) {
                toastHeldMax({
                  text: "Max param grid held until ComfyUI is idle",
                  count: held,
                });
              }
              setRequeueStatus(
                [
                  `Param grid queued ${queued}`,
                  held > 0 ? `held ${held}` : null,
                  `${cells.slice(0, 4).join("; ")}${cells.length > 4 ? "…" : ""}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
              );
            });
          }}
          onMutateWinner={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            setRequeueStatus("Mutating winner…");
            void queueMutatedGalleryJobs({
              entry,
              kinds: ["variation", "location", "wardrobe"],
              count: 3,
            }).then(({ queued, held }) => {
              if (held > 0) {
                toastHeldMax({
                  text: "Max mutations held until ComfyUI is idle",
                  count: held,
                });
              }
              setRequeueStatus(
                held > 0
                  ? `Queued ${queued} mutations · held ${held} Max`
                  : `Queued ${queued} mutations.`,
              );
            });
          }}
          onVariations={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            saveGalleryVariationsHandoff(buildGalleryVariationsHandoff(entry));
            router.push(galleryVariationsPath());
          }}
          onTopics={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            saveGalleryTopicsHandoff(entry);
            router.push(galleryTopicsPath());
          }}
          onNegativeAb={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            void queueNegativeAbTest({
              prompt: entry.prompt,
              model: entry.model ?? "qwen-image-2512",
              negativeA: entry.negativePrompt,
              hints: entry.prompt.slice(0, 200),
            }).then(({ queued, held, seed }) => {
              if (held > 0) {
                toastHeldMax({
                  text: "Max negative A/B held until ComfyUI is idle",
                  count: held,
                });
              }
              setRequeueStatus(
                [
                  `Negative A/B queued ${queued}`,
                  held > 0 ? `held ${held}` : null,
                  `seed ${seed}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
              );
            });
          }}
          onExportCsv={() => {
            downloadTextFile(
              exportGalleryCsv(selectedEntries),
              "gallery-export.csv",
              "text/csv;charset=utf-8",
            );
          }}
          onExportJsonl={() => {
            downloadTextFile(
              exportGalleryJsonl(selectedEntries),
              "gallery-export.jsonl",
              "application/jsonl;charset=utf-8",
            );
          }}
          onBulkRequeue={() => {
            setRequeueStatus("Bulk variation queue started…");
            void loadGalleryRequeue()
              .then(({ requeueComfyJobs }) =>
                requeueComfyJobs(
                  selectedEntries.map((entry) => {
                    const urls = resolveRequeueImageUrlsFromEntry(entry);
                    return {
                      prompt: entry.prompt,
                      negativePrompt: entry.negativePrompt,
                      tool: entry.tool,
                      model: entry.model,
                      queueParams: entry.queueParams,
                      sourceImageUrl: urls.sourceImageUrl,
                      maskImageUrl: urls.maskImageUrl,
                      newSeed: true,
                      parentGalleryEntryId: entry.id,
                      derivedKind: "variation" as const,
                    };
                  }),
                  setRequeueStatus,
                ),
              )
              .then(({ queued, failed }) => {
              setSelectedIds([]);
              toastBulkQueueSummary({
                label: "Bulk variation queue finished",
                queued,
                failed,
              });
            });
          }}
          onBulkUpscaleFinal={() => {
            setRequeueStatus("Bulk upscale (Final) started…");
            void loadGalleryRequeue()
              .then(({ bulkUpscaleGalleryEntries }) =>
                bulkUpscaleGalleryEntries(selectedEntries, "final", setRequeueStatus),
              )
              .then(
              ({ queued, failed, skipped }) => {
                setSelectedIds([]);
                toastBulkQueueSummary({
                  label: "Bulk upscale (Final) finished",
                  queued,
                  failed,
                  skipped,
                });
              },
            );
          }}
          onBulkUpscaleMax={() => {
            setRequeueStatus("Bulk upscale (Max) started…");
            void loadGalleryRequeue()
              .then(({ bulkUpscaleGalleryEntries }) =>
                bulkUpscaleGalleryEntries(selectedEntries, "max", setRequeueStatus),
              )
              .then(
              ({ queued, failed, skipped }) => {
                setSelectedIds([]);
                toastBulkQueueSummary({
                  label: "Bulk upscale (Max) finished",
                  queued,
                  failed,
                  skipped,
                });
              },
            );
          }}
          onBulkRefine={() => {
            setRequeueStatus("Bulk refine (Final) started…");
            void loadGalleryRequeue()
              .then(({ bulkRefineGalleryEntries }) =>
                bulkRefineGalleryEntries(selectedEntries, "final", setRequeueStatus),
              )
              .then(
              ({ queued, failed, skipped }) => {
                setSelectedIds([]);
                toastBulkQueueSummary({
                  label: "Bulk refine finished",
                  queued,
                  failed,
                  skipped,
                });
              },
            );
          }}
          onBulkMoireCleanFinal={() => {
            setRequeueStatus("Bulk moiré clean (Final) started…");
            void loadGalleryRequeue()
              .then(({ bulkMoireCleanGalleryEntries }) =>
                bulkMoireCleanGalleryEntries(
                  selectedEntries,
                  "final",
                  setRequeueStatus,
                ),
              )
              .then(({ queued, failed, skipped }) => {
              setSelectedIds([]);
              toastBulkQueueSummary({
                label: "Bulk moiré clean (Final) finished",
                queued,
                failed,
                skipped,
              });
            });
          }}
          onBulkMoireCleanMax={() => {
            setRequeueStatus("Bulk moiré clean (Max) started…");
            void loadGalleryRequeue()
              .then(({ bulkMoireCleanGalleryEntries }) =>
                bulkMoireCleanGalleryEntries(
                  selectedEntries,
                  "max",
                  setRequeueStatus,
                ),
              )
              .then(({ queued, failed, skipped }) => {
              setSelectedIds([]);
              toastBulkQueueSummary({
                label: "Bulk moiré clean (Max) finished",
                queued,
                failed,
                skipped,
              });
            });
          }}
        />
      ) : null}

      {downloadError && (
        <p className="text-xs text-rose-300">{downloadError}</p>
      )}
      {filter.derivativeOfEntryId || filter.focusEntryId || filter.derivedKind ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-200/90">
          <span>
            {filter.focusEntryId
              ? "Lineage filter: showing source entry"
              : filter.derivativeOfEntryId
                ? "Lineage filter: showing derived outputs"
                : `Lineage filter: ${filter.derivedKind} only`}
          </span>
          <button
            type="button"
            onClick={() =>
              setFilter((previous) => ({
                ...previous,
                derivativeOfEntryId: undefined,
                focusEntryId: undefined,
                derivedKind: undefined,
              }))
            }
            className="rounded-lg border border-violet-500/30 px-2 py-0.5 text-[11px] transition hover:border-violet-400/50 hover:text-violet-100"
          >
            Clear lineage filter
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(["upscale", "refine", "variation", "moire-clean"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() =>
                setFilter((previous) => ({
                  ...previous,
                  derivedKind: previous.derivedKind === kind ? undefined : kind,
                }))
              }
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                filter.derivedKind === kind
                  ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
                  : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {kind === "upscale"
                ? "Upscaled"
                : kind === "refine"
                  ? "Refined"
                  : kind === "variation"
                    ? "Variations"
                    : "Moiré clean"}
            </button>
          ))}
        </div>
      )}
      {requeueStatus ? (
        <StatusToastStrip
          notes={[
            {
              id: "gallery-requeue",
              text: requeueStatus,
              tone: toneForStatusText(requeueStatus),
            },
          ]}
        />
      ) : null}

      {compareOpen && selectedEntries.length >= 2 ? (
        <ModalPortal>
        <div
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-zinc-950/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Compare gallery outputs"
        >
          <div className="my-4 w-full max-w-7xl">
            <GalleryComparePanel
          entries={selectedEntries.slice(0, 4)}
          onClose={() => {
            setCompareOpen(false);
            setCompareStatus(null);
            setCompareWinnerId(null);
          }}
          status={compareStatus}
          compareWinnerId={compareWinnerId}
          onPickWinner={(entry) => {
            setCompareWinnerId(entry.id);
            const compareIds = selectedEntries.slice(0, 4).map((item) => item.id);
            setFavorites(compareIds.filter((id) => id !== entry.id), false);
            setFavorites([entry.id], true);
            setReviewRating(entry.id, 5);
            recordCatalogBiasFromPrompt(entry.prompt, 5);
            if (entry.historyId) {
              setLineageParent({
                parentHistoryId: entry.historyId,
                sourcePrompt: entry.prompt,
                sourceTool: entry.tool,
              });
            }
            setCompareStatus(`Winner: ${entry.model ?? "unknown"} · seed ${entry.queueParams?.seed ?? "?"}`);
            void import("@/lib/auto-improve-loop")
              .then(({ runAutoImproveOnRating }) => runAutoImproveOnRating(entry, 5))
              .then((message) => {
                if (message) {
                  setCompareStatus(message);
                }
              })
              .catch((error) => {
                setCompareStatus(
                  error instanceof Error ? error.message : "Auto-improve failed.",
                );
              });
          }}
          onSaveWinnerRecipe={(entry) => {
            const built = buildToolQualityRecipeFromGalleryEntry(entry);
            if (!built.ok) {
              setCompareStatus(built.error);
              return;
            }
            const shared = loadSettingsCache().shared;
            const nextRecipes = appendUserToolQualityRecipe(
              shared.toolQualityRecipes,
              built.recipe,
            );
            saveSharedSettings({
              ...shared,
              toolQualityRecipes: nextRecipes,
            });
            setCompareStatus(
              `Saved recipe “${built.recipe.label}” · ${built.recipe.queueQualityProfile}${
                built.recipe.model ? ` · ${built.recipe.model}` : ""
              }`,
            );
          }}
          onRate={(entryId, rating) => {
            setReviewRating(entryId, rating);
            const entry = selectedEntries.find((item) => item.id === entryId);
            if (entry && rating && rating <= 2) {
              recordAvoidedTokensFromGalleryEntry({
                prompt: entry.prompt,
                visionTags: entry.visionTags,
              });
            }
            if (entry) {
              recordCatalogBiasFromPrompt(entry.prompt, rating);
              if (rating) {
                void import("@/lib/auto-improve-loop")
                  .then(({ runAutoImproveOnRating }) =>
                    runAutoImproveOnRating(entry, rating),
                  )
                  .then((message) => {
                    if (message) {
                      setCompareStatus(message);
                    }
                  })
                  .catch((error) => {
                    setCompareStatus(
                      error instanceof Error ? error.message : "Auto-improve failed.",
                    );
                  });
              }
            }
          }}
          onFavorite={(entryId) => toggleFavorite(entryId)}
          onMutate={(entry) => {
            setCompareStatus("Queueing mutations…");
            void queueMutatedGalleryJobs({
              entry,
              kinds: ["variation", "location", "wardrobe"],
              count: 3,
            }).then(({ queued, held }) => {
              if (held > 0) {
                toastHeldMax({
                  text: "Max mutations held until ComfyUI is idle",
                  count: held,
                });
              }
              setCompareStatus(
                held > 0
                  ? `Queued ${queued} mutations · held ${held} Max`
                  : `Queued ${queued} mutations.`,
              );
            });
          }}
          onUpscale={(entry, qualityProfile) => {
            setCompareStatus(`Upscaling (${qualityProfile})…`);
            void loadGalleryRequeue()
              .then(({ requeueUpscaleFromGalleryEntry }) =>
                requeueUpscaleFromGalleryEntry(entry, {
                  qualityProfile,
                  onStatus: setCompareStatus,
                }),
              )
              .then((result) => {
              if (!result.ok) {
                setCompareStatus(result.error ?? "Upscale failed.");
                return;
              }
              if (result.held) {
                const message = "Max upscale held until ComfyUI queue is idle";
                setCompareStatus(message);
                toastHeldMax({ text: message });
              }
            });
          }}
          onMoireClean={(entry, qualityProfile) => {
            setCompareStatus(
              qualityProfile === "max"
                ? "Queueing moiré clean (Max)…"
                : "Queueing moiré clean (Final)…",
            );
            void loadGalleryRequeue()
              .then(({ requeueMoireCleanFromGalleryEntry }) =>
                requeueMoireCleanFromGalleryEntry(entry, {
                  qualityProfile,
                  onStatus: setCompareStatus,
                }),
              )
              .then((result) => {
              if (!result.ok) {
                setCompareStatus(result.error ?? "Moiré clean failed.");
                return;
              }
              if (result.held) {
                const message = "Max moiré clean held until ComfyUI queue is idle";
                setCompareStatus(message);
                toastHeldMax({ text: message });
              }
            });
          }}
          onRefine={(entry) => {
            setCompareStatus("Queueing low-denoise refine…");
            void loadGalleryRequeue()
              .then(({ requeueRefineFromGalleryEntry }) =>
                requeueRefineFromGalleryEntry(entry, {
                  onStatus: setCompareStatus,
                }),
              )
              .then((result) => {
              if (!result.ok) {
                setCompareStatus(result.error ?? "Refine failed.");
                return;
              }
              if (result.held) {
                const message = "Max refine held until ComfyUI queue is idle";
                setCompareStatus(message);
                toastHeldMax({ text: message });
              }
            });
          }}
          onUpscaleWinner={(entry) => {
            setCompareStatus("Upscaling compare winner at Max…");
            void loadGalleryRequeue()
              .then(({ requeueUpscaleFromGalleryEntry }) =>
                requeueUpscaleFromGalleryEntry(entry, {
                  qualityProfile: "max",
                  onStatus: setCompareStatus,
                }),
              )
              .then((result) => {
              if (!result.ok) {
                setCompareStatus(result.error ?? "Upscale failed.");
                return;
              }
              if (result.held) {
                const message = "Max upscale held until ComfyUI queue is idle";
                setCompareStatus(message);
                toastHeldMax({ text: message });
              }
            });
          }}
          onImprove={(entry) => startImproveFromGalleryEntry(entry)}
            />
          </div>
        </div>
        </ModalPortal>
      ) : null}

      {workflowEntry ? (
        <GalleryWorkflowModal
          entry={workflowEntry}
          onClose={() => setWorkflowEntry(null)}
        />
      ) : null}

      {visibleEntries.length === 0 ? (
        entries.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No gallery outputs yet"
            description="Queue prompts from any tool with Send to ComfyUI, or import sidecars and ComfyUI history below."
            action={resolveGenerateEmptyCta()}
          />
        ) : (
          <EmptyState
            icon="search"
            title="No entries match these filters"
            description="Try clearing search, status, or project filters — or turn off semantic search."
            action={{
              label: "Clear filters",
              onClick: () =>
                setFilter({
                  status: "all",
                }),
            }}
          />
        )
      ) : virtualizeGrid ? (
        <VirtualizedGalleryGrid
          items={virtualizedEntries}
          getKey={(entry) => entry.id}
          layout={layout}
          compact={compact}
          gridClassName={
            layout === "list" ? "flex flex-col gap-3" : galleryVirtualGridClass
          }
          estimateRowHeight={
            layout === "list" ? 180 : layout === "dense" || compact ? 280 : 360
          }
          renderItem={(entry) => (
            <GalleryCardItem
              entry={entry}
              actionsRef={galleryCardActionsRef}
              compact={compact || layout === "dense"}
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
                filter.reviewMode &&
                !pickFor &&
                reviewFocusEntry?.id === entry.id &&
                !entry.reviewRating
                  ? suggestRatingMutations(entry, 2).map((item) => item.detail)
                  : undefined
              }
              hasDerivatives={entryIdsWithDerivatives.has(entry.id)}
              pickMode={Boolean(pickFor)}
              pickable={
                Boolean(pickFor) &&
                entry.status === "completed" &&
                galleryEntryPrimaryMediaKind(entry) === "image"
              }
              pickLabel={pickFor ? galleryPickActionLabel(pickFor) : undefined}
            />
          )}
        />
      ) : (
        <div
          className={
            layout === "list"
              ? "flex flex-col gap-3 overflow-visible"
              : `${galleryCardGridClass} overflow-visible`
          }
        >
          {(lineageGroups ?? visibleEntries.map((entry) => ({ root: entry, derivatives: [] }))).flatMap(
            (group) => {
              const renderCard = (entry: ComfyGalleryEntry) => (
                <GalleryCardItem
                  key={entry.id}
                  entry={entry}
                  actionsRef={galleryCardActionsRef}
                  compact={compact || layout === "dense"}
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
                    filter.reviewMode &&
                    !pickFor &&
                    reviewFocusEntry?.id === entry.id &&
                    !entry.reviewRating
                      ? suggestRatingMutations(entry, 2).map((item) => item.detail)
                      : undefined
                  }
                  hasDerivatives={entryIdsWithDerivatives.has(entry.id)}
                  pickMode={Boolean(pickFor)}
                  pickable={
                    Boolean(pickFor) &&
                    entry.status === "completed" &&
                    galleryEntryPrimaryMediaKind(entry) === "image"
                  }
                  pickLabel={pickFor ? galleryPickActionLabel(pickFor) : undefined}
                />
              );

              if (group.derivatives.length === 0) {
                return [renderCard(group.root)];
              }

              const collapsed = collapsedLineageGroups.has(group.root.id);

              return [
                <div
                  key={`lineage-${group.root.id}`}
                  className={
                    layout === "list"
                      ? "space-y-3 rounded-2xl border border-violet-500/15 bg-violet-500/5 p-3"
                      : "col-span-full space-y-3 rounded-2xl border border-violet-500/15 bg-violet-500/5 p-3"
                  }
                >
                  <div className="flex items-center justify-between gap-2 px-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-violet-300/80">
                      Lineage · {group.derivatives.length + 1} outputs
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedLineageGroups((previous) => {
                          const next = new Set(previous);
                          if (next.has(group.root.id)) {
                            next.delete(group.root.id);
                          } else {
                            next.add(group.root.id);
                          }
                          return next;
                        })
                      }
                      className="rounded-lg border border-violet-500/25 px-2 py-0.5 text-[10px] text-violet-200/90 transition hover:border-violet-400/40"
                    >
                      {collapsed ? "Expand" : "Collapse"}
                    </button>
                  </div>
                  <div className={layout === "list" ? "space-y-3" : galleryCardGridClass}>
                    {renderCard(group.root)}
                    {!collapsed
                      ? group.derivatives.map((derivative) => (
                          <div
                            key={derivative.id}
                            className={
                              layout === "list"
                                ? "ml-3 border-l border-violet-500/20 pl-3"
                                : undefined
                            }
                          >
                            {renderCard(derivative)}
                          </div>
                        ))
                      : null}
                  </div>
                </div>,
              ];
            },
          )}
        </div>
      )}

      {hasMoreAll ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() =>
              setAllRenderLimit((previous) => previous + GALLERY_ALL_RENDER_CHUNK)
            }
            className="ui-btn-secondary ui-btn-sm"
          >
            Load more ({remainingAll} remaining)
          </button>
        </div>
      ) : null}

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
              onApplyRating={(rating) => {
                handleReviewRating(reviewFocusEntry, rating);
              }}
            />
          ) : null}
          <GalleryReviewTouchBar
            onRate={(rating) => {
              handleReviewRating(reviewFocusEntry, rating);
            }}
            onFavorite={() => toggleFavorite(reviewFocusEntry.id)}
            onNext={() => {
              const nextEntry = visibleEntries[Math.min(reviewFocusIndex + 1, visibleEntries.length - 1)];
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
        onConfirm={(options) => {
          setLoraExportOpen(false);
          setRequeueStatus("Building LoRA dataset export…");
          void import("@/lib/gallery-lora-dataset-export").then(
            ({ downloadLoraDatasetZip, selectLoraDatasetEntries }) => {
              const source =
                loraExportScope === "selected" ? selectedEntries : entries;
              return downloadLoraDatasetZip(
                selectLoraDatasetEntries(
                  source,
                  loraExportScope === "selected"
                    ? { selectedIds: selectedEntries.map((entry) => entry.id) }
                    : undefined,
                ),
                options,
              );
            },
          ).then(({ count }) => {
            setRequeueStatus(
              count > 0
                ? `LoRA dataset exported (${count} image/caption pairs, ${options.captionMode}).`
                : loraExportScope === "selected"
                  ? "No eligible images found for the LoRA dataset export."
                  : "No favorited or 4–5★ entries found for the LoRA dataset export.",
            );
          });
        }}
      />
    </section>
  );
}

function GalleryPaginator({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <p className="type-caption text-zinc-500">
        Showing {rangeStart}–{rangeEnd} of {totalItems}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="type-caption"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="type-caption px-1 text-zinc-400">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="type-caption"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

