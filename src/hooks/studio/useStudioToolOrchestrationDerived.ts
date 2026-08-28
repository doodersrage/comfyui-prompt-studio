'use client';

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { filterHistoryEntries, type HistoryFilter } from '@/lib/history-filter';
import { loadScenePresets, type ScenePreset } from '@/lib/scene-presets';
import { applyPromptTemplate, getAllPromptTemplates } from '@/lib/prompt-templates';
import { sortCatalogByRatingBias } from '@/lib/catalog-rating-bias';
import { buildPromptIterationForest } from '@/lib/prompt-iteration-tree';
import { loadActiveProjectId, loadPromptProjects, type PromptProject } from '@/lib/prompt-projects';
import {
  loadUserSceneStarterPresets,
  type UserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import type { RatedTokenStat } from '@/lib/rating-token-analytics';
import type { UserHistoryAnalytics } from '@/lib/user-analytics';
import { EMPTY_GALLERY_STATS, type GalleryStats } from '@/lib/gallery-stats';
import { USER_SCOPE_CHANGED_EVENT } from '@/lib/user-scope';
import { loadComfyGallery, COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery';
import { buildGalleryLineageGroups } from '@/lib/gallery-lineage-groups';
import type { BranchDiffResult } from '@/lib/iteration-branch-diff';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import { loadLocationBlocklist } from '@/hooks/usePromptHistory';
import { loadUserTemplates, type UserPromptTemplate } from '@/lib/user-templates';
import { isStudioTabId, type StudioTabId } from '@/lib/studio-nav';
import type { CatalogClothing, CatalogLocation } from '@/components/studio/tabs/StudioCatalogTab';

type StudioTab = StudioTabId;

export type StudioToolOrchestrationDerivedInput = {
  tab: StudioTab;
  setTab: (tab: StudioTab) => void;
  catalogClothing: CatalogClothing[];
  catalogLocations: CatalogLocation[];
  historyFilter: HistoryFilter;
  activeProjectId: string | undefined;
  entries: PromptHistoryEntry[];
  toolSettings: { templateId?: string; templateSlots?: Record<string, string> };
  userTemplates: UserPromptTemplate[];
  galleryRevision: number;
  scopeRevision: number;
  setGalleryRevision: Dispatch<SetStateAction<number>>;
  setBlocklist: (value: string[]) => void;
  setScenePresets: (value: ScenePreset[]) => void;
  setUserSceneStarters: (value: UserSceneStarterPreset[]) => void;
  setUserTemplates: (value: UserPromptTemplate[]) => void;
  setProjects: (value: PromptProject[]) => void;
  setActiveProjectIdState: (value: string | undefined) => void;
  setSharedProjects: (value: Array<{ id: string; name: string; notes?: string }>) => void;
  setHighlightHistoryId: (value: string | null) => void;
  iterationDiffLeftId: string;
  iterationDiffRightId: string;
  setIterationDiff: (value: BranchDiffResult | null) => void;
};

export function useStudioToolOrchestrationDerived(input: StudioToolOrchestrationDerivedInput) {
  const {
    tab,
    setTab,
    catalogClothing,
    catalogLocations,
    historyFilter,
    activeProjectId,
    entries,
    toolSettings,
    userTemplates,
    galleryRevision,
    scopeRevision,
    setGalleryRevision,
    setBlocklist,
    setScenePresets,
    setUserSceneStarters,
    setUserTemplates,
    setProjects,
    setActiveProjectIdState,
    setSharedProjects,
    setHighlightHistoryId,
    iterationDiffLeftId,
    iterationDiffRightId,
    setIterationDiff,
  } = input;

  const [embeddingRankIds, setEmbeddingRankIds] = useState<string[] | null>(null);
  const [ratingTokenStats, setRatingTokenStats] = useState<RatedTokenStat[]>([]);
  const [historyAnalytics, setHistoryAnalytics] = useState<UserHistoryAnalytics>({
    total: 0,
    rated: 0,
    favorites: 0,
    byTool: [],
    avgRating: null,
  });
  const [galleryAnalytics, setGalleryAnalytics] = useState<GalleryStats>(EMPTY_GALLERY_STATS);
  const [iterationEntries, setIterationEntries] = useState<PromptHistoryEntry[]>([]);

  useEffect(() => {
    if (tab !== 'analytics') {
      scheduleAfterCommit(() => {
        setRatingTokenStats([]);
        setGalleryAnalytics(EMPTY_GALLERY_STATS);
      });
      return;
    }
    let cancelled = false;
    void Promise.all([
      import('@/lib/rating-token-analytics'),
      import('@/lib/gallery-stats'),
      import('@/lib/user-analytics'),
    ]).then(([ratingMod, galleryMod, historyMod]) => {
      if (cancelled) return;
      setRatingTokenStats(ratingMod.analyzeGalleryRatingTokens(loadComfyGallery()));
      setGalleryAnalytics(galleryMod.computeGalleryStats(loadComfyGallery()));
      setHistoryAnalytics(historyMod.analyzePromptHistoryEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [tab, galleryRevision, scopeRevision, entries]);

  useEffect(() => {
    let cancelled = false;
    void import('@/lib/iteration-branch-diff').then(({ listIterationEntries }) => {
      if (cancelled) return;
      setIterationEntries(listIterationEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  useEffect(() => {
    const left = iterationEntries.find(entry => entry.id === iterationDiffLeftId);
    const right = iterationEntries.find(entry => entry.id === iterationDiffRightId);
    if (!left || !right) {
      scheduleAfterCommit(() => {
        setIterationDiff(null);
      });
      return;
    }
    let cancelled = false;
    void import('@/lib/iteration-branch-diff').then(({ diffHistoryEntries }) => {
      if (cancelled) return;
      setIterationDiff(diffHistoryEntries(left, right));
    });
    return () => {
      cancelled = true;
    };
  }, [iterationDiffLeftId, iterationDiffRightId, iterationEntries, setIterationDiff]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const query = historyFilter.query?.trim();
      if (!historyFilter.semanticSearch || !query) {
        setEmbeddingRankIds(null);
        return;
      }

      const candidates = filterHistoryEntries(entries, {
        ...historyFilter,
        semanticSearch: false,
      });

      void fetch('/api/search/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          items: candidates.map(entry => ({
            id: entry.id,
            text: [entry.prompt, entry.hints, entry.tool, entry.model, entry.tags?.join(' ')]
              .filter(Boolean)
              .join('\n'),
          })),
        }),
      })
        .then(response => response.json())
        .then((data: { results?: Array<{ id: string }> }) => {
          setEmbeddingRankIds(data.results?.map(entry => entry.id) ?? null);
        })
        .catch(() => setEmbeddingRankIds(null));
    });
  }, [
    entries,
    historyFilter.query,
    historyFilter.semanticSearch,
    historyFilter.tool,
    historyFilter.model,
    historyFilter.tag,
    historyFilter.favoritesOnly,
    historyFilter.minRating,
  ]);

  const filteredEntries = useMemo(() => {
    const query = historyFilter.query?.trim();
    let base = filterHistoryEntries(entries, {
      ...historyFilter,
      semanticSearch: false,
    });

    if (query && historyFilter.semanticSearch) {
      if (embeddingRankIds?.length) {
        const allowed = new Set(embeddingRankIds);
        base = base.filter(entry => allowed.has(entry.id));
        const order = new Map(embeddingRankIds.map((id, index) => [id, index]));
        base = [...base].sort(
          (left, right) => (order.get(left.id) ?? 9999) - (order.get(right.id) ?? 9999)
        );
      } else {
        base = filterHistoryEntries(entries, historyFilter);
      }
    } else if (!query) {
      base = filterHistoryEntries(entries, historyFilter);
    }
    if (!activeProjectId) {
      return base;
    }
    return base.filter(entry => entry.metadata?.projectId === activeProjectId);
  }, [entries, historyFilter, activeProjectId, embeddingRankIds]);

  const sortedCatalogClothing = useMemo(
    () => sortCatalogByRatingBias(catalogClothing, entry => `${entry.label} ${entry.category}`),
    [catalogClothing]
  );
  const sortedCatalogLocations = useMemo(
    () => sortCatalogByRatingBias(catalogLocations, entry => entry.label),
    [catalogLocations]
  );

  const iterationForest = useMemo(() => buildPromptIterationForest(entries), [entries]);
  const galleryLineageClusters = useMemo(() => {
    if (tab !== 'analytics') {
      return [];
    }
    return buildGalleryLineageGroups(loadComfyGallery())
      .filter(group => group.derivatives.length > 0)
      .sort((left, right) => right.derivatives.length - left.derivatives.length)
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, galleryRevision, scopeRevision]);

  const favoriteEntries = useMemo(() => entries.filter(entry => entry.favorite), [entries]);

  const template = useMemo(() => {
    return getAllPromptTemplates(userTemplates).find(
      entry => entry.id === (toolSettings.templateId ?? 'duo-sport-race')
    );
  }, [toolSettings.templateId, userTemplates]);

  const filledTemplate = useMemo(() => {
    if (!template) return '';
    return applyPromptTemplate(template.template, toolSettings.templateSlots ?? {});
  }, [template, toolSettings.templateSlots]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setBlocklist(loadLocationBlocklist());
      setScenePresets(loadScenePresets());
      setUserSceneStarters(loadUserSceneStarterPresets());
      setUserTemplates(loadUserTemplates());
      setProjects(loadPromptProjects());
      setActiveProjectIdState(loadActiveProjectId());
    });
  }, [
    setActiveProjectIdState,
    setBlocklist,
    setProjects,
    setScenePresets,
    setUserSceneStarters,
    setUserTemplates,
  ]);

  useEffect(() => {
    if (tab !== 'projects') {
      return;
    }
    void fetch('/api/shared-projects')
      .then(response => (response.ok ? response.json() : null))
      .then((data: { projects?: Array<{ id: string; name: string; notes?: string }> } | null) => {
        setSharedProjects(data?.projects ?? []);
      })
      .catch(() => setSharedProjects([]));
  }, [setSharedProjects, tab]);

  useEffect(() => {
    const refreshAnalytics = () => setGalleryRevision(previous => previous + 1);
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refreshAnalytics);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refreshAnalytics);
  }, [setGalleryRevision]);

  useEffect(() => {
    const onScopeChanged = () => setGalleryRevision(previous => previous + 1);
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
    return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
  }, [setGalleryRevision]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    scheduleAfterCommit(() => {
      const historyId = new URLSearchParams(window.location.search).get('history');
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (isStudioTabId(tabParam)) {
        setTab(tabParam);
      }
      if (historyId) {
        setTab('history');
        setHighlightHistoryId(historyId);
      }
    });
  }, [setHighlightHistoryId, setTab]);

  return {
    ratingTokenStats,
    historyAnalytics,
    galleryAnalytics,
    iterationEntries,
    filteredEntries,
    sortedCatalogClothing,
    sortedCatalogLocations,
    iterationForest,
    galleryLineageClusters,
    favoriteEntries,
    template,
    filledTemplate,
  };
}
