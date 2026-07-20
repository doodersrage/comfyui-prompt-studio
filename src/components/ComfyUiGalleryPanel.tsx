"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import ImageLightbox, { type ImageLightboxState } from "@/components/ui/ImageLightbox";
import { ComfyUiGalleryJobPlaceholder } from "@/components/ui/ComfyUiJobStatusPanel";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useComfyUiGallery } from "@/hooks/useComfyUiGallery";
import { startImproveFromGalleryEntry } from "@/lib/improve-output";
import { recordAvoidedTokensFromPrompt } from "@/lib/avoided-tokens";
import { recordCatalogBiasFromPrompt } from "@/lib/catalog-rating-bias";
import GalleryVisionReviewButton from "@/components/gallery/GalleryVisionReviewButton";
import GalleryComparePanel from "@/components/GalleryComparePanel";
import GalleryCard from "@/components/gallery/GalleryCard";
import GalleryFiltersBar from "@/components/gallery/GalleryFiltersBar";
import GallerySelectionBar from "@/components/gallery/GallerySelectionBar";
import GalleryStatsBar from "@/components/gallery/GalleryStatsBar";
import GalleryReviewTouchBar from "@/components/gallery/GalleryReviewTouchBar";
import { EmptyState } from "@/components/ui/ViewState";
import { computeGalleryStats } from "@/lib/gallery-stats";
import { queueMutatedGalleryJobs } from "@/lib/gallery-mutations";
import { queueNegativeAbTest } from "@/lib/negative-ab-queue";
import { queueSeedExperiment } from "@/lib/seed-experiment-queue";
import {
  queueParamExperiment,
  type ParamExperimentAxis,
} from "@/lib/param-experiment-queue";
import { downloadCompareExport } from "@/lib/gallery-compare-export";
import { runAutoImproveOnFavorite, runAutoImproveOnRating } from "@/lib/auto-improve-loop";
import { learnFromLowRatedPrompt } from "@/lib/negative-learner";
import { pushNotification } from "@/lib/notification-center";
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
  downloadGalleryImage,
  downloadGallerySidecar,
  downloadGalleryImagesSequential,
  downloadGallerySidecarBundle,
} from "@/lib/comfyui-gallery-export";
import { downloadGalleryZipBundle } from "@/lib/gallery-zip-export";
import { studioHistoryUrl } from "@/lib/prompt-lineage";
import { requeueComfyJob, requeueComfyJobs } from "@/lib/comfyui-requeue";
import { queueParamExperimentGrid } from "@/lib/param-experiment-grid";
import {
  buildGalleryLightboxPlaylist,
  galleryEntryViewUrls,
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
    mounted,
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
    primaryViewUrl,
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
    const query = new URLSearchParams(window.location.search).get("q");
    if (query?.trim()) {
      setFilter((previous) => ({
        ...previous,
        query: query.trim(),
        semanticSearch: true,
      }));
    }
  }, [setFilter]);

  const router = useRouter();
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
  const [compareStatus, setCompareStatus] = useState<string | null>(null);
  const [paramAxis, setParamAxis] = useState<ParamExperimentAxis>("cfg");
  const [projectFilterId, setProjectFilterId] = useState<string>("");
  const projects = useMemo(() => loadPromptProjects(), [entries]);
  const resolvedProjectFilterId = useMemo(() => {
    if (projectFilterId === "active") {
      return loadActiveProjectId();
    }
    return projectFilterId || undefined;
  }, [projectFilterId, entries]);

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
    if (!mounted) {
      return;
    }
    const preferences = loadGalleryViewPreferences();
    setSort(preferences.sort);
    setPageSize(preferences.pageSize);
    setSlideshowIntervalMs(preferences.slideshowIntervalMs);
    setSlideshowTransition(preferences.slideshowTransition);
    setLayout(preferences.layout);
    setViewPrefsLoaded(true);
  }, [mounted]);

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
    setPage(1);
  }, [filter.status, filter.tool, filter.favoritesOnly, filter.query, sort, pageSize]);

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

    const effectivePageSize = resolveGalleryPageSize(pageSize, sortedSource.length);
    return paginateGalleryEntries(sortedSource, page, effectivePageSize);
  }, [sortedSource, limit, page, pageSize, paginationEnabled]);

  const visibleEntries = pagination.items;
  const totalPages = pagination.totalPages;
  const currentPage = pagination.page;
  const totalFiltered = pagination.totalItems;
  const effectivePageSize = resolveGalleryPageSize(pageSize, totalFiltered);
  const showPagination = paginationEnabled && pageSize !== GALLERY_PAGE_SIZE_ALL && totalFiltered > effectivePageSize;

  const lightboxPlaylist = useMemo(
    () => buildGalleryLightboxPlaylist(visibleEntries),
    [visibleEntries],
  );

  const openEntryLightbox = (entry: ComfyGalleryEntry, imageIndex: number) => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }

    const index = resolveGalleryLightboxOpenIndex(
      visibleEntries,
      entry.id,
      imageIndex,
    );

    setLightbox({
      images: lightboxPlaylist.images,
      titles: lightboxPlaylist.titles,
      index,
      title: lightboxPlaylist.titles[index],
    });
    setSlideshowPlaying(false);
    setSlideshowFullscreen(false);
  };

  const startSlideshow = () => {
    if (lightboxPlaylist.images.length === 0) {
      return;
    }

    setLightbox({
      images: lightboxPlaylist.images,
      titles: lightboxPlaylist.titles,
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
      titles: lightboxPlaylist.titles,
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
    setPage(currentPage);
  }, [currentPage, page, paginationEnabled]);

  const selectedEntries = useMemo(
    () => visibleEntries.filter((entry) => selectedIds.includes(entry.id)),
    [selectedIds, visibleEntries],
  );

  const reviewFocusIndex = useMemo(() => {
    if (!filter.reviewMode || visibleEntries.length === 0) {
      return 0;
    }
    const selectedIndex = visibleEntries.findIndex((entry) => selectedIds.includes(entry.id));
    return selectedIndex >= 0 ? selectedIndex : 0;
  }, [filter.reviewMode, visibleEntries, selectedIds]);

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
      if (rating <= 2) {
        recordAvoidedTokensFromPrompt(entry.prompt);
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
      void runAutoImproveOnRating(entry, rating).then((message) => {
        if (message) {
          setRequeueStatus(message);
        }
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
        setSelectedIds([firstCompleted.id]);
      }
    }
  }, [filter.reviewMode, visibleEntries, selectedIds.length]);

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

  const toggleSelected = (id: string) => {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((entryId) => entryId !== id)
        : [...previous, id],
    );
  };

  if (!mounted) {
    return null;
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

      {showFilters && entries.length > 0 ? (
        <GalleryStatsBar
          stats={galleryStats}
          filter={filter}
          activeJobs={activeJobs}
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
          <span>Select cards to compare, export, queue experiments, or assign projects.</span>
          <button
            type="button"
            onClick={() => setSelectedIds(visibleEntries.map((entry) => entry.id))}
            className="ui-btn-ghost ui-btn-sm"
          >
            Select visible ({visibleEntries.length})
          </button>
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
            if (!window.confirm(`Delete ${selectedIds.length} selected entries?`)) {
              return;
            }
            removeEntries(selectedIds);
            setSelectedIds([]);
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
            void downloadGalleryZipBundle(selectedEntries).then((count) => {
              setRequeueStatus(`ZIP export prepared for ${count} entries.`);
            });
          }}
          onExportCompareJson={() =>
            downloadCompareExport(selectedEntries.slice(0, 4), "json")
          }
          onExportCompareHtml={() =>
            downloadCompareExport(selectedEntries.slice(0, 4), "html")
          }
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
            }).then(({ queued, seeds }) =>
              setRequeueStatus(
                `Seed experiment queued ${queued} jobs · seeds ${seeds.join(", ")}`,
              ),
            );
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
            }).then(({ queued, labels }) =>
              setRequeueStatus(
                `Param experiment queued ${queued} jobs · ${labels.join(", ")}`,
              ),
            );
          }}
          onParamGrid={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            setRequeueStatus("Queueing CFG × steps grid…");
            void queueParamExperimentGrid({
              prompt: entry.prompt,
              model: entry.model ?? "qwen-image-2512",
              negativePrompt: entry.negativePrompt,
              hints: entry.prompt.slice(0, 200),
              baseParams: entry.queueParams,
            }).then(({ queued, cells }) =>
              setRequeueStatus(
                `Param grid queued ${queued} jobs · ${cells.slice(0, 4).join("; ")}${cells.length > 4 ? "…" : ""}`,
              ),
            );
          }}
          onMutateWinner={() => {
            const entry = selectedEntries[0];
            if (!entry) return;
            setRequeueStatus("Mutating winner…");
            void queueMutatedGalleryJobs({
              entry,
              kinds: ["variation", "location", "wardrobe"],
              count: 3,
            }).then((queued) => setRequeueStatus(`Queued ${queued} mutations.`));
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
            }).then(({ queued, seed }) =>
              setRequeueStatus(`Negative A/B queued ${queued} jobs · seed ${seed}`),
            );
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
            setRequeueStatus("Bulk re-queue started…");
            void requeueComfyJobs(
              selectedEntries.map((entry) => ({
                prompt: entry.prompt,
                negativePrompt: entry.negativePrompt,
                tool: entry.tool,
                model: entry.model,
                newSeed: true,
              })),
              setRequeueStatus,
            ).then(() => setSelectedIds([]));
          }}
        />
      ) : null}

      {downloadError && (
        <p className="text-xs text-rose-300">{downloadError}</p>
      )}
      {requeueStatus && (
        <p className="text-xs text-violet-300/90">{requeueStatus}</p>
      )}

      {compareOpen && selectedEntries.length >= 2 ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-950/85 p-4 backdrop-blur-sm"
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
          }}
          status={compareStatus}
          onPickWinner={(entry) => {
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
            void runAutoImproveOnRating(entry, 5).then((message) => {
              if (message) {
                setCompareStatus(message);
              }
            });
          }}
          onRate={(entryId, rating) => {
            setReviewRating(entryId, rating);
            const entry = selectedEntries.find((item) => item.id === entryId);
            if (entry && rating && rating <= 2) {
              recordAvoidedTokensFromPrompt(entry.prompt);
            }
            if (entry) {
              recordCatalogBiasFromPrompt(entry.prompt, rating);
              if (rating) {
                void runAutoImproveOnRating(entry, rating).then((message) => {
                  if (message) {
                    setCompareStatus(message);
                  }
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
            }).then((queued) => setCompareStatus(`Queued ${queued} mutations.`));
          }}
          onImprove={(entry) => startImproveFromGalleryEntry(entry)}
            />
          </div>
        </div>
      ) : null}

      {visibleEntries.length === 0 ? (
        entries.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="No gallery outputs yet"
            description="Queue prompts from any tool with Send to ComfyUI, or import sidecars and ComfyUI history below."
            action={{ label: "Open Generate", href: "/" }}
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
      ) : (
        <div
          className={
            layout === "list"
              ? "flex flex-col gap-3 overflow-visible"
              : layout === "dense"
                ? compact
                  ? "grid grid-cols-2 gap-3 overflow-visible sm:grid-cols-3 lg:grid-cols-4"
                  : "grid grid-cols-2 gap-4 overflow-visible sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                : compact
                  ? "grid grid-cols-2 gap-4 overflow-visible sm:grid-cols-3"
                  : "grid grid-cols-1 gap-6 overflow-visible sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          }
        >
          {visibleEntries.map((entry) => (
            <GalleryCard
              key={entry.id}
              entry={entry}
              compact={compact || layout === "dense"}
              layout={layout}
              selectable={bulkEnabled}
              selected={selectedIds.includes(entry.id)}
              reviewFocus={filter.reviewMode && reviewFocusEntry?.id === entry.id}
              onToggleSelected={() => toggleSelected(entry.id)}
              previewUrl={primaryViewUrl(entry)}
              imageUrls={galleryEntryViewUrls(entry)}
              onRemove={() => removeEntry(entry.id)}
              onToggleFavorite={() => {
                const willFavorite = !entry.favorite;
                toggleFavorite(entry.id);
                if (willFavorite) {
                  void runAutoImproveOnFavorite(entry, true).then((message) => {
                    if (message) {
                      setRequeueStatus(message);
                    }
                  });
                }
              }}
              onDownloadError={setDownloadError}
              onRequeue={(newSeed) => {
                setRequeueStatus("Re-queueing…");
                void requeueComfyJob({
                  prompt: entry.prompt,
                  negativePrompt: entry.negativePrompt,
                  tool: entry.tool,
                  model: entry.model,
                  newSeed,
                  queueParams: entry.queueParams,
                  onStatus: setRequeueStatus,
                }).then((result) => {
                  if (!result.ok) {
                    setRequeueStatus(result.error ?? "Re-queue failed.");
                    return;
                  }
                  setRequeueStatus(
                    [
                      "queued",
                      result.promptId ? `prompt_id ${result.promptId}` : null,
                      result.comfyUrl,
                      newSeed ? "new seed" : "same params",
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  );
                });
              }}
              onOpenImage={(index) => openEntryLightbox(entry, index)}
              reviewMode={filter.reviewMode === true}
              reviewMutationHints={
                filter.reviewMode &&
                reviewFocusEntry?.id === entry.id &&
                !entry.reviewRating
                  ? suggestRatingMutations(entry, 2).map((item) => item.detail)
                  : undefined
              }
              onVisionTagClick={(tag) =>
                setFilter((previous) => ({ ...previous, query: tag }))
              }
              onReviewRating={(rating) => {
                if (rating) {
                  handleReviewRating(entry, rating);
                }
              }}
            />
          ))}
        </div>
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

