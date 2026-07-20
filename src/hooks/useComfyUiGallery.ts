"use client";

import { useCallback, useEffect, useMemo, useState, startTransition } from "react";
import {
  clearComfyGallery,
  COMFYUI_GALLERY_UPDATED_EVENT,
  filterComfyGalleryEntries,
  galleryEntryPrimaryViewUrl,
  initGalleryStore,
  isGalleryStoreReady,
  loadComfyGallery,
  removeComfyGalleryEntries,
  removeComfyGalleryEntry,
  setComfyGalleryFavorites,
  setComfyGalleryProjectIds,
  setGalleryReviewRating,
  toggleComfyGalleryFavorite,
  type ComfyGalleryEntry,
  type ComfyGalleryFilter,
  uniqueGalleryTools,
} from "@/lib/comfyui-gallery";
import { primeGalleryCacheSync } from "@/lib/gallery-db-store";
import { scheduleComfyGalleryPoll } from "@/lib/comfyui-gallery-poller";
import {
  fetchEmbeddingRankIds,
  galleryEntryCorpus,
  sortByRankIds,
} from "@/lib/embedding-rank";

function readGalleryEntriesSync(): ComfyGalleryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  primeGalleryCacheSync();
  return loadComfyGallery();
}

export function useComfyUiGallery(initialFilter?: ComfyGalleryFilter) {
  const [mounted, setMounted] = useState(false);
  const initialEntries = readGalleryEntriesSync();
  const [storeReady, setStoreReady] = useState(
    () => initialEntries.length > 0 && isGalleryStoreReady(),
  );
  const [entries, setEntries] = useState<ComfyGalleryEntry[]>(() => initialEntries);
  const [filter, setFilter] = useState<ComfyGalleryFilter>(
    initialFilter ?? { status: "all" },
  );
  const [embeddingRankIds, setEmbeddingRankIds] = useState<string[] | null>(null);
  const [similarRankIds, setSimilarRankIds] = useState<string[] | null>(null);
  const [embeddingSearchLoading, setEmbeddingSearchLoading] = useState(false);
  const [embeddingSearchUnavailable, setEmbeddingSearchUnavailable] = useState(false);
  const [similarSearchLoading, setSimilarSearchLoading] = useState(false);

  const refresh = useCallback(() => {
    startTransition(() => {
      setEntries(loadComfyGallery());
    });
  }, []);

  useEffect(() => {
    refresh();
    setMounted(true);

    void initGalleryStore()
      .then(() => {
        refresh();
        setStoreReady(true);
      })
      .catch(() => {
        setStoreReady(true);
      });

    let frameId = 0;
    const handler = () => {
      if (frameId !== 0) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        refresh();
      });
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, handler);
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [refresh]);

  useEffect(() => {
    const query = filter.query?.trim();
    if (!filter.semanticSearch || !query) {
      setEmbeddingRankIds(null);
      setEmbeddingSearchLoading(false);
      setEmbeddingSearchUnavailable(false);
      return;
    }

    const candidates = filterComfyGalleryEntries(entries, {
      ...filter,
      semanticSearch: false,
      similarToEntryId: undefined,
    });

    setEmbeddingSearchLoading(true);
    void fetchEmbeddingRankIds(
      query,
      candidates.map((entry) => ({ id: entry.id, text: galleryEntryCorpus(entry) })),
    )
      .then((ids) => {
        setEmbeddingRankIds(ids);
        setEmbeddingSearchUnavailable(ids === null && candidates.length > 0);
      })
      .finally(() => setEmbeddingSearchLoading(false));
  }, [
    entries,
    filter.query,
    filter.semanticSearch,
    filter.status,
    filter.tool,
    filter.favoritesOnly,
    filter.projectId,
    filter.unreviewedOnly,
  ]);

  useEffect(() => {
    const referenceId = filter.similarToEntryId;
    if (!referenceId) {
      setSimilarRankIds(null);
      setSimilarSearchLoading(false);
      return;
    }

    const reference = entries.find((entry) => entry.id === referenceId);
    if (!reference) {
      setSimilarRankIds(null);
      setSimilarSearchLoading(false);
      return;
    }

    const candidates = entries.filter((entry) => entry.id !== referenceId);
    setSimilarSearchLoading(true);
    void fetchEmbeddingRankIds(
      reference.prompt,
      candidates.map((entry) => ({ id: entry.id, text: galleryEntryCorpus(entry) })),
    )
      .then(setSimilarRankIds)
      .finally(() => setSimilarSearchLoading(false));
  }, [entries, filter.similarToEntryId]);

  const filteredEntries = useMemo(() => {
    const query = filter.query?.trim();

    if (query && filter.semanticSearch) {
      let base = filterComfyGalleryEntries(entries, {
        ...filter,
        semanticSearch: false,
        similarToEntryId: undefined,
      });
      if (embeddingRankIds?.length) {
        base = sortByRankIds(base, embeddingRankIds);
      } else {
        base = filterComfyGalleryEntries(entries, filter);
      }
      if (filter.similarToEntryId) {
        const reference = entries.find((entry) => entry.id === filter.similarToEntryId);
        if (reference && similarRankIds?.length) {
          return sortByRankIds(
            base.filter((entry) => entry.id !== reference.id),
            similarRankIds,
          );
        }
      }
      return base;
    }

    let base = filterComfyGalleryEntries(entries, { ...filter, similarToEntryId: undefined });
    if (filter.similarToEntryId) {
      const reference = entries.find((entry) => entry.id === filter.similarToEntryId);
      if (reference) {
        if (similarRankIds?.length) {
          base = sortByRankIds(
            base.filter((entry) => entry.id !== reference.id),
            similarRankIds,
          );
        } else {
          base = filterComfyGalleryEntries(entries, filter);
        }
      }
    }
    return base;
  }, [entries, filter, embeddingRankIds, similarRankIds]);

  const tools = useMemo(() => uniqueGalleryTools(entries), [entries]);

  const removeEntry = useCallback(
    (id: string) => {
      removeComfyGalleryEntry(id);
      refresh();
    },
    [refresh],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      toggleComfyGalleryFavorite(id);
      refresh();
    },
    [refresh],
  );

  const removeEntries = useCallback(
    (ids: string[]) => {
      removeComfyGalleryEntries(ids);
      refresh();
    },
    [refresh],
  );

  const setFavorites = useCallback(
    (ids: string[], favorite: boolean) => {
      setComfyGalleryFavorites(ids, favorite);
      refresh();
    },
    [refresh],
  );

  const clearAll = useCallback(() => {
    clearComfyGallery();
    refresh();
  }, [refresh]);

  const refreshPending = useCallback(async () => {
    const pending = loadComfyGallery().filter(
      (entry) => entry.status === "pending" || entry.status === "running",
    );

    await Promise.all(
      pending.map((entry) =>
        scheduleComfyGalleryPoll(entry.promptId, { comfyUrl: entry.comfyUrl }),
      ),
    );

    refresh();
  }, [refresh]);

  const setReviewRating = useCallback(
    (id: string, rating: ComfyGalleryEntry["reviewRating"]) => {
      setGalleryReviewRating(id, rating);
      refresh();
    },
    [refresh],
  );

  const setProjectIds = useCallback(
    (ids: string[], projectId: string | undefined) => {
      setComfyGalleryProjectIds(ids, projectId);
      refresh();
    },
    [refresh],
  );

  return {
    mounted,
    storeReady,
    entries,
    filteredEntries,
    filter,
    setFilter,
    tools,
    refresh,
    removeEntry,
    removeEntries,
    toggleFavorite,
    setFavorites,
    setProjectIds,
    clearAll,
    refreshPending,
    primaryViewUrl: galleryEntryPrimaryViewUrl,
    setReviewRating,
    embeddingSearchActive: Boolean(filter.semanticSearch && filter.query?.trim() && embeddingRankIds?.length),
    similarSearchActive: Boolean(filter.similarToEntryId && similarRankIds?.length),
    embeddingSearchLoading,
    similarSearchLoading,
    embeddingSearchUnavailable,
  };
}
