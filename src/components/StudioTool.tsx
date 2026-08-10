'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useAuth, type AuthContextValue } from '@/hooks/useAuth';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { loadLocationBlocklist, usePromptHistory } from '@/hooks/usePromptHistory';
import { DEFAULT_STUDIO_TOOL_CACHE } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { toastHeldMax } from '@/lib/app-toast';
import { filterHistoryEntries, type HistoryFilter } from '@/lib/history-filter';
import { loadScenePresets, type ScenePreset } from '@/lib/scene-presets';
import { applyPromptTemplate, getAllPromptTemplates } from '@/lib/prompt-templates';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { applyCharacterIdentityBundle } from '@/lib/character-identity-bundle';
import type { VisualCompareResult } from '@/lib/visual-model-compare';
import { diffPromptWords } from '@/lib/prompt-diff';
import {
  loadUserTemplates,
  templateFromPrompt,
  upsertUserTemplate,
  type UserPromptTemplate,
} from '@/lib/user-templates';
import { sortCatalogByRatingBias } from '@/lib/catalog-rating-bias';
import { buildPromptIterationForest } from '@/lib/prompt-iteration-tree';
import {
  loadActiveProjectId,
  loadPromptProjects,
  setActiveProjectId,
  type PromptProject,
} from '@/lib/prompt-projects';
import {
  loadUserSceneStarterPresets,
  type UserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import type { ModelPortfolioItem } from '@/lib/model-portfolio';
import type { RatedTokenStat } from '@/lib/rating-token-analytics';
import type { UserHistoryAnalytics } from '@/lib/user-analytics';
import type { GalleryStats } from '@/lib/gallery-stats';
import { USER_SCOPE_CHANGED_EVENT } from '@/lib/user-scope';
import { loadComfyGallery, COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery';
import { buildGalleryLineageGroups } from '@/lib/gallery-lineage-groups';
import type { CampaignStepResult } from '@/lib/campaign-runner';
import {
  deleteCampaignTemplate,
  loadCampaignTemplates,
  upsertCampaignTemplate,
  type CampaignTemplate,
} from '@/lib/campaign-templates';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import type { BranchDiffResult } from '@/lib/iteration-branch-diff';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import { ToolBadge, ToolLayout, ToolMetaPanel } from '@/components/ui/ToolPageShell';
import { ChipButton } from '@/components/ui/Field';
import { StudioTabSkeleton } from '@/components/ui/ViewState';
import { isStudioTabId, studioTabGroupsForWorkspaceMode, type StudioTabId } from '@/lib/studio-nav';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import type { CatalogClothing, CatalogLocation } from '@/components/studio/tabs/StudioCatalogTab';

const StudioDiffTab = dynamic(() => import('@/components/studio/tabs/StudioDiffTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioPortfolioTab = dynamic(() => import('@/components/studio/tabs/StudioPortfolioTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioHistoryTab = dynamic(() => import('@/components/studio/tabs/StudioHistoryTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioCompareTab = dynamic(() => import('@/components/studio/tabs/StudioCompareTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioExperimentsTab = dynamic(
  () => import('@/components/studio/tabs/StudioExperimentsTab'),
  {
    loading: () => <StudioTabSkeleton />,
  }
);
const StudioIterationTab = dynamic(() => import('@/components/studio/tabs/StudioIterationTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioCampaignTab = dynamic(() => import('@/components/studio/tabs/StudioCampaignTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioAnalyticsTab = dynamic(() => import('@/components/studio/tabs/StudioAnalyticsTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioProjectsTab = dynamic(() => import('@/components/studio/tabs/StudioProjectsTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioCatalogTab = dynamic(() => import('@/components/studio/tabs/StudioCatalogTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioTemplatesTab = dynamic(() => import('@/components/studio/tabs/StudioTemplatesTab'), {
  loading: () => <StudioTabSkeleton />,
});
const StudioPresetsTab = dynamic(() => import('@/components/studio/tabs/StudioPresetsTab'), {
  loading: () => <StudioTabSkeleton />,
});

const ACCENT = 'violet' as const;

type StudioTab = StudioTabId;

export default function StudioTool() {
  const workspaceMode = useWorkspaceMode();
  const description = useToolPageDescription(
    'History, model comparison, catalog browser, and template slots.',
    'Saved prompts, quick compare, and templates — essentials without the full lab.'
  );

  // Defer null-check to after all hooks so hook-call order stays stable.
  const auth = useAuth() ?? { _null: true };
  const isNullContext = (auth as { _null?: boolean })._null;
  const { authEnabled, user } = auth as AuthContextValue & { _null?: true };
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'studio',
    DEFAULT_STUDIO_TOOL_CACHE
  );
  const {
    entries,
    toggleFavorite,
    setRating,
    addTag,
    addTagToEntries,
    removeEntry,
    removeEntries,
    clearHistory,
  } = usePromptHistory();

  const [tab, setTab] = useState<StudioTab>('history');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogClothing, setCatalogClothing] = useState<CatalogClothing[]>([]);
  const [catalogLocations, setCatalogLocations] = useState<CatalogLocation[]>([]);
  const [compareHints, setCompareHints] = useState(
    'two female gravel cyclists in a fierce competition'
  );
  const [compareA, setCompareA] = useState<EnrichedToolGenerateResult | null>(null);
  const [compareB, setCompareB] = useState<EnrichedToolGenerateResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [visualCompareLoading, setVisualCompareLoading] = useState(false);
  const [visualCompareStatus, setVisualCompareStatus] = useState<string | null>(null);
  const [visualA, setVisualA] = useState<VisualCompareResult | null>(null);
  const [visualB, setVisualB] = useState<VisualCompareResult | null>(null);
  const [identityBundleName, setIdentityBundleName] = useState('');
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>({});
  const [embeddingRankIds, setEmbeddingRankIds] = useState<string[] | null>(null);
  const [scenePresets, setScenePresets] = useState<ScenePreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetHints, setPresetHints] = useState('');
  const [userTemplates, setUserTemplates] = useState<UserPromptTemplate[]>([]);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [diffLeftId, setDiffLeftId] = useState('');
  const [diffRightId, setDiffRightId] = useState('');
  const [copiedPresetShareId, setCopiedPresetShareId] = useState<string | null>(null);
  const [highlightHistoryId, setHighlightHistoryId] = useState<string | null>(null);
  const [projects, setProjects] = useState<PromptProject[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | undefined>();
  const [projectName, setProjectName] = useState('');
  const [projectNotes, setProjectNotes] = useState('');
  const [sharedProjects, setSharedProjects] = useState<
    Array<{ id: string; name: string; notes?: string }>
  >([]);
  const [presetPackName, setPresetPackName] = useState('');
  const [sceneStarterPackName, setSceneStarterPackName] = useState('');
  const [userSceneStarters, setUserSceneStarters] = useState<UserSceneStarterPreset[]>([]);
  const [portfolioDraft, setPortfolioDraft] = useState('');
  const [portfolioModels, setPortfolioModels] = useState(
    'qwen-image-2512, flux-2-klein, sdxl-base-1.0'
  );
  const [portfolioItems, setPortfolioItems] = useState<ModelPortfolioItem[]>([]);
  const [portfolioStatus, setPortfolioStatus] = useState<string | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const [scopeRevision, setScopeRevision] = useState(0);
  const [campaignTarget, setCampaignTarget] = useState<'random-scene' | 'topics'>('random-scene');
  const [campaignCount, setCampaignCount] = useState(4);
  const [campaignGenre, setCampaignGenre] = useState('');
  const [campaignTopics, setCampaignTopics] = useState('');
  const [campaignQueue, setCampaignQueue] = useState(true);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  const [campaignResults, setCampaignResults] = useState<CampaignStepResult[]>([]);
  const [campaignTemplates, setCampaignTemplates] = useState<CampaignTemplate[]>([]);
  const [campaignTemplateName, setCampaignTemplateName] = useState('');
  const [iterationDiffLeftId, setIterationDiffLeftId] = useState('');
  const [iterationDiffRightId, setIterationDiffRightId] = useState('');
  const [ratingTokenStats, setRatingTokenStats] = useState<RatedTokenStat[]>([]);
  const [historyAnalytics, setHistoryAnalytics] = useState<UserHistoryAnalytics>({
    total: 0,
    rated: 0,
    favorites: 0,
    byTool: [],
    avgRating: null,
  });
  const [galleryAnalytics, setGalleryAnalytics] = useState<GalleryStats>({
    total: 0,
    completed: 0,
    pending: 0,
    running: 0,
    error: 0,
    favorites: 0,
    unreviewed: 0,
    avgRating: null,
  });
  const [iterationEntries, setIterationEntries] = useState<PromptHistoryEntry[]>([]);
  const [iterationDiff, setIterationDiff] = useState<BranchDiffResult | null>(null);

  const actions = usePromptResultActions({
    tool: 'studio',
    model: shared.model,
    detail: shared.detail,
  });

  useEffect(() => {
    scheduleAfterCommit(() => {
      setCampaignTemplates(loadCampaignTemplates());
    });
  }, []);

  useEffect(() => {
    if (tab !== 'analytics') {
      scheduleAfterCommit(() => {
        setRatingTokenStats([]);
        setGalleryAnalytics({
          total: 0,
          completed: 0,
          pending: 0,
          running: 0,
          error: 0,
          favorites: 0,
          unreviewed: 0,
          avgRating: null,
        });
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
  }, [iterationDiffLeftId, iterationDiffRightId, iterationEntries]);

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
  }, []);

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
  }, [tab]);

  useEffect(() => {
    const refreshAnalytics = () => setGalleryRevision(previous => previous + 1);
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refreshAnalytics);
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refreshAnalytics);
  }, []);

  useEffect(() => {
    const onScopeChanged = () => setScopeRevision(previous => previous + 1);
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
    return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
  }, []);

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
  }, []);

  const applyIdentityBundle = useCallback(
    (bundle: import('@/lib/character-identity-bundle').CharacterIdentityBundle) => {
      const patch = applyCharacterIdentityBundle(bundle);
      updateShared({
        model: patch.model ?? shared.model,
        detail: patch.detail ?? shared.detail,
        lockedWardrobeId: patch.lockedWardrobeId,
        lockedLocation: patch.lockedLocation,
        lockedVariationSeed: patch.lockedVariationSeed,
        alwaysIncludeClothing: patch.alwaysIncludeClothing,
        activeCharacterDescriptor: patch.activeCharacterDescriptor,
        ipAdapterImageFilename: patch.ipAdapterImageFilename,
        ipAdapterStrength: patch.ipAdapterStrength,
        ipAdapterModelFilename: patch.ipAdapterModelFilename,
      });
      if (patch.hints) {
        setCompareHints(patch.hints);
        setPresetHints(patch.hints);
      }
      setIdentityBundleName(bundle.name);
    },
    [shared.detail, shared.model, updateShared]
  );

  const openCharacterWithIdentity = useCallback(
    (bundle: import('@/lib/character-identity-bundle').CharacterIdentityBundle) => {
      applyIdentityBundle(bundle);
      window.location.href = '/character';
    },
    [applyIdentityBundle]
  );

  const selectStudioTab = useCallback((next: StudioTab) => {
    setTab(next);
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (next === 'history') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', next);
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, []);

  const loadCatalog = useCallback(async (query: string) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '?limit=80';
      const response = await fetch(`/api/catalog${params}`);
      if (!response.ok) {
        throw new Error('Could not load catalog data.');
      }
      const data = (await response.json()) as {
        clothing?: CatalogClothing[];
        locations?: CatalogLocation[];
      };
      setCatalogClothing(data.clothing ?? []);
      setCatalogLocations(data.locations ?? []);
    } catch (err) {
      setCatalogClothing([]);
      setCatalogLocations([]);
      setCatalogError(err instanceof Error ? err.message : 'Could not load catalog data.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'catalog') {
      scheduleAfterCommit(() => {
        void loadCatalog(catalogQuery);
      });
    }
  }, [tab, catalogQuery, loadCatalog]);

  const runCompare = useCallback(async () => {
    setCompareLoading(true);
    setCompareError(null);
    try {
      const payload = {
        hints: compareHints,
        portraitStyle: 'action' as const,
        presetOptions: { headcount: 'duo' as const },
      };

      const [responseA, responseB] = await Promise.all([
        fetch('/api/duo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, model: shared.model, detail: shared.detail }),
        }),
        fetch('/api/duo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            model: toolSettings.compareModelB ?? 'flux-2-klein',
            detail: shared.detail,
          }),
        }),
      ]);

      if (!responseA.ok || !responseB.ok) {
        throw new Error('Model comparison failed. Check your settings and try again.');
      }

      setCompareA((await responseA.json()) as EnrichedToolGenerateResult);
      setCompareB((await responseB.json()) as EnrichedToolGenerateResult);
    } catch (err) {
      setCompareA(null);
      setCompareB(null);
      setCompareError(err instanceof Error ? err.message : 'Model comparison failed.');
    } finally {
      setCompareLoading(false);
    }
  }, [compareHints, shared, toolSettings.compareModelB]);

  const runVisualCompare = useCallback(async () => {
    if (!compareA?.prompt?.trim()) {
      setCompareError('Run text compare first to get a shared prompt.');
      return;
    }

    setVisualCompareLoading(true);
    setVisualCompareStatus('Queueing visual compare…');
    setVisualA(null);
    setVisualB(null);
    try {
      const { runVisualModelCompare } = await import('@/lib/visual-model-compare');
      const result = await runVisualModelCompare({
        prompt: compareA.prompt,
        modelA: shared.model,
        modelB: (toolSettings.compareModelB ?? 'flux-2-klein') as ComfyImageModel,
        hints: compareHints,
        onStatus: setVisualCompareStatus,
      });
      setVisualA(result.a);
      setVisualB(result.b);
      const heldCount = [result.a, result.b].filter(side => side.held).length;
      if (heldCount > 0) {
        toastHeldMax({
          text: 'Max visual compare held until ComfyUI is idle',
          count: heldCount,
        });
        setVisualCompareStatus(`Visual compare · held ${heldCount} Max until idle`);
      } else {
        setVisualCompareStatus('Visual compare finished.');
      }
    } catch (err) {
      setVisualCompareStatus(err instanceof Error ? err.message : 'Visual compare failed.');
    } finally {
      setVisualCompareLoading(false);
    }
  }, [compareA, compareHints, shared.model, toolSettings.compareModelB]);

  const copyText = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleImportBackup = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const { importStudioBackup, parseStudioBackupFile } = await import('@/lib/studio-backup');
      importStudioBackup(parseStudioBackupFile(raw));
      setBlocklist(loadLocationBlocklist());
      setScenePresets(loadScenePresets());
      setUserTemplates(loadUserTemplates());
      setBackupStatus('Backup imported. Reload tabs to see restored settings.');
    } catch (err) {
      setBackupStatus(err instanceof Error ? err.message : 'Import failed.');
    }
  }, []);

  const diffLeft = useMemo(
    () => entries.find(entry => entry.id === diffLeftId) ?? null,
    [entries, diffLeftId]
  );
  const diffRight = useMemo(
    () => entries.find(entry => entry.id === diffRightId) ?? null,
    [entries, diffRightId]
  );
  const promptDiff = useMemo(() => {
    if (!diffLeft || !diffRight) {
      return null;
    }
    return diffPromptWords(diffLeft.prompt, diffRight.prompt);
  }, [diffLeft, diffRight]);

  const tabGroups: { label: string; tabs: { id: StudioTab; label: string }[] }[] = useMemo(
    () =>
      studioTabGroupsForWorkspaceMode(workspaceMode).map(group => ({
        label: group.label,
        tabs: group.tabs.map(tabDef => ({
          id: tabDef.id,
          label: tabDef.label,
        })),
      })),
    [workspaceMode]
  );

  const visibleTabIds = useMemo(
    () => new Set(tabGroups.flatMap(group => group.tabs.map(entry => entry.id))),
    [tabGroups]
  );

  useEffect(() => {
    if (!visibleTabIds.has(tab)) {
      scheduleAfterCommit(() => {
        setTab('history');
      });
    }
  }, [tab, visibleTabIds]);

  if (!mounted) {
    return (
      <ToolLayout
        accent={ACCENT}
        width="wide"
        badge={<ToolBadge accent={ACCENT}>Studio</ToolBadge>}
        title="Prompt Studio"
        description={description}
      >
        <StudioTabSkeleton />
      </ToolLayout>
    );
  }

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Studio</ToolBadge>}
      title="Prompt Studio"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.studio} />
      {/* Null-context guard — provider not yet wired up during hydration/HMR. */}
      {isNullContext ? null : (
        <div className="flex h-full flex-col gap-4">
          <ToolMetaPanel title="Studio views" className="overflow-x-auto">
            <div className="flex min-w-max flex-wrap items-start gap-x-8 gap-y-4">
              {tabGroups.map(group => (
                <div key={group.label} className="space-y-2">
                  <p className="type-overline text-[var(--text-muted)]">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.tabs.map(entry => (
                      <ChipButton
                        key={entry.id}
                        active={tab === entry.id}
                        onClick={() => selectStudioTab(entry.id)}
                      >
                        {entry.label}
                      </ChipButton>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ToolMetaPanel>

          {tab === 'history' && (
            <StudioHistoryTab
              accent={ACCENT}
              entries={entries}
              filteredEntries={filteredEntries}
              favoriteEntries={favoriteEntries}
              historyFilter={historyFilter}
              onHistoryFilterChange={setHistoryFilter}
              projects={projects}
              activeProjectId={activeProjectId}
              onActiveProjectChange={projectId => {
                setActiveProjectIdState(projectId);
                setActiveProjectId(projectId);
              }}
              backupStatus={backupStatus}
              onBackupStatusChange={setBackupStatus}
              comfyUiStatus={actions.comfyUiStatus}
              highlightHistoryId={highlightHistoryId}
              onCopy={copyText}
              onToggleFavorite={toggleFavorite}
              onRate={setRating}
              onAddTag={addTag}
              onRemoveEntry={removeEntry}
              onRemoveEntries={removeEntries}
              onAddTagToEntries={addTagToEntries}
              onClearHistory={clearHistory}
              onImportBackup={handleImportBackup}
              onDiffLeft={id => {
                setDiffLeftId(id);
                selectStudioTab('diff');
              }}
              onDiffRight={id => {
                setDiffRightId(id);
                selectStudioTab('diff');
              }}
              onSaveTemplateFromEntry={entry => {
                const name = window.prompt('Template name', `${entry.tool} prompt`);
                if (!name?.trim()) {
                  return;
                }
                const created = templateFromPrompt(name.trim(), entry.prompt);
                upsertUserTemplate(created);
                setUserTemplates(loadUserTemplates());
                setBackupStatus(`Saved template “${created.label}”.`);
              }}
              onSendBatchFavorites={prompts => void actions.sendBatchComfyUi(prompts)}
            />
          )}

          {tab === 'iteration' && (
            <StudioIterationTab
              accent={ACCENT}
              entries={entries}
              iterationForest={iterationForest}
              iterationEntries={iterationEntries}
              iterationDiffLeftId={iterationDiffLeftId}
              iterationDiffRightId={iterationDiffRightId}
              iterationDiff={iterationDiff}
              highlightHistoryId={highlightHistoryId}
              onIterationDiffLeftIdChange={setIterationDiffLeftId}
              onIterationDiffRightIdChange={setIterationDiffRightId}
              onHighlightHistoryIdChange={setHighlightHistoryId}
              onBackupStatusChange={setBackupStatus}
              onDiffWithParent={(parentId, childId) => {
                setIterationDiffLeftId(parentId);
                setIterationDiffRightId(childId);
              }}
            />
          )}

          {tab === 'campaign' && (
            <StudioCampaignTab
              accent={ACCENT}
              shared={shared}
              campaignTarget={campaignTarget}
              campaignCount={campaignCount}
              campaignGenre={campaignGenre}
              campaignTopics={campaignTopics}
              campaignQueue={campaignQueue}
              campaignLoading={campaignLoading}
              campaignStatus={campaignStatus}
              campaignResults={campaignResults}
              campaignTemplates={campaignTemplates}
              campaignTemplateName={campaignTemplateName}
              onCampaignTargetChange={setCampaignTarget}
              onCampaignCountChange={setCampaignCount}
              onCampaignGenreChange={setCampaignGenre}
              onCampaignTopicsChange={setCampaignTopics}
              onCampaignQueueChange={setCampaignQueue}
              onCampaignLoadingChange={setCampaignLoading}
              onCampaignStatusChange={setCampaignStatus}
              onCampaignResultsChange={setCampaignResults}
              onCampaignTemplateNameChange={setCampaignTemplateName}
              onCampaignTemplatesChange={setCampaignTemplates}
              onBackupStatusChange={setBackupStatus}
              onGalleryRevision={() => setGalleryRevision(previous => previous + 1)}
              onSaveCampaignTemplate={() => {
                upsertCampaignTemplate({
                  name: campaignTemplateName.trim(),
                  target: campaignTarget,
                  count: campaignCount,
                  genre: campaignGenre.trim() || undefined,
                  topics: campaignTopics
                    .split('\n')
                    .map(line => line.trim())
                    .filter(Boolean),
                  queueToComfyUi: campaignQueue,
                });
                setCampaignTemplates(loadCampaignTemplates());
                setCampaignTemplateName('');
                setBackupStatus('Saved campaign template.');
              }}
              onLoadCampaignTemplate={template => {
                setCampaignTarget(template.target);
                setCampaignCount(template.count);
                setCampaignGenre(template.genre ?? '');
                setCampaignTopics((template.topics ?? []).join('\n'));
                setCampaignQueue(template.queueToComfyUi);
              }}
              onDeleteCampaignTemplate={id => {
                deleteCampaignTemplate(id);
                setCampaignTemplates(loadCampaignTemplates());
              }}
            />
          )}

          {tab === 'analytics' && (
            <StudioAnalyticsTab
              accent={ACCENT}
              authEnabled={authEnabled}
              username={user?.username}
              historyAnalytics={historyAnalytics}
              galleryAnalytics={galleryAnalytics}
              ratingTokenStats={ratingTokenStats}
              galleryLineageClusters={galleryLineageClusters}
              onBackupStatusChange={setBackupStatus}
              onUserSceneStartersChange={setUserSceneStarters}
            />
          )}

          {tab === 'projects' && (
            <StudioProjectsTab
              accent={ACCENT}
              entries={entries}
              projects={projects}
              activeProjectId={activeProjectId}
              sharedProjects={sharedProjects}
              projectName={projectName}
              projectNotes={projectNotes}
              onProjectNameChange={setProjectName}
              onProjectNotesChange={setProjectNotes}
              onProjectsChange={setProjects}
              onActiveProjectChange={projectId => {
                setActiveProjectIdState(projectId);
                setActiveProjectId(projectId);
              }}
              onBackupStatusChange={setBackupStatus}
              onGalleryRevision={() => setGalleryRevision(previous => previous + 1)}
              onSelectTab={selectStudioTab}
            />
          )}

          {tab === 'compare' && (
            <StudioCompareTab
              accent={ACCENT}
              shared={shared}
              toolSettings={toolSettings}
              compareHints={compareHints}
              compareA={compareA}
              compareB={compareB}
              compareLoading={compareLoading}
              compareError={compareError}
              visualCompareLoading={visualCompareLoading}
              visualCompareStatus={visualCompareStatus}
              visualA={visualA}
              visualB={visualB}
              onCompareHintsChange={setCompareHints}
              onUpdateShared={updateShared}
              onUpdateToolSettings={updateToolSettings}
              onRunCompare={runCompare}
              onRunVisualCompare={runVisualCompare}
            />
          )}

          {tab === 'portfolio' && (
            <StudioPortfolioTab
              accent={ACCENT}
              detail={shared.detail}
              portfolioDraft={portfolioDraft}
              portfolioModels={portfolioModels}
              portfolioItems={portfolioItems}
              portfolioStatus={portfolioStatus}
              portfolioLoading={portfolioLoading}
              onPortfolioDraftChange={setPortfolioDraft}
              onPortfolioModelsChange={setPortfolioModels}
              onPortfolioItemsChange={setPortfolioItems}
              onPortfolioStatusChange={setPortfolioStatus}
              onPortfolioLoadingChange={setPortfolioLoading}
            />
          )}

          {tab === 'catalog' && (
            <StudioCatalogTab
              accent={ACCENT}
              shared={shared}
              catalogQuery={catalogQuery}
              catalogLoading={catalogLoading}
              catalogError={catalogError}
              catalogClothing={catalogClothing}
              catalogLocations={catalogLocations}
              sortedCatalogClothing={sortedCatalogClothing}
              sortedCatalogLocations={sortedCatalogLocations}
              blocklist={blocklist}
              onCatalogQueryChange={setCatalogQuery}
              onBlocklistChange={setBlocklist}
              onPresetHintsAppend={(label, kind) => {
                setPresetHints(previous =>
                  kind === 'clothing'
                    ? previous.trim()
                      ? `${previous.trim()}, ${label}`
                      : label
                    : previous.trim()
                      ? `${previous.trim()}, location: ${label}`
                      : `location: ${label}`
                );
              }}
              onBackupStatusChange={setBackupStatus}
              onUpdateShared={updateShared}
              onLoadCatalog={loadCatalog}
            />
          )}

          {tab === 'templates' && (
            <StudioTemplatesTab
              accent={ACCENT}
              toolSettings={toolSettings}
              template={template}
              filledTemplate={filledTemplate}
              userTemplates={userTemplates}
              customTemplateName={customTemplateName}
              copied={copied}
              onCustomTemplateNameChange={setCustomTemplateName}
              onUserTemplatesChange={setUserTemplates}
              onUpdateToolSettings={updateToolSettings}
              onBackupStatusChange={setBackupStatus}
              onCopy={copyText}
            />
          )}

          {tab === 'presets' && (
            <StudioPresetsTab
              accent={ACCENT}
              shared={shared}
              toolSettings={toolSettings}
              compareHints={compareHints}
              filledTemplate={filledTemplate}
              presetName={presetName}
              presetHints={presetHints}
              presetPackName={presetPackName}
              sceneStarterPackName={sceneStarterPackName}
              identityBundleName={identityBundleName}
              scenePresets={scenePresets}
              userSceneStarters={userSceneStarters}
              copiedPresetShareId={copiedPresetShareId}
              onPresetNameChange={setPresetName}
              onPresetHintsChange={setPresetHints}
              onPresetPackNameChange={setPresetPackName}
              onSceneStarterPackNameChange={setSceneStarterPackName}
              onIdentityBundleNameChange={setIdentityBundleName}
              onScenePresetsChange={setScenePresets}
              onUserSceneStartersChange={setUserSceneStarters}
              onCompareHintsChange={setCompareHints}
              onCopiedPresetShareIdChange={setCopiedPresetShareId}
              onUpdateShared={updateShared}
              onUpdateToolSettings={updateToolSettings}
              onBackupStatusChange={setBackupStatus}
              onApplyIdentityBundle={applyIdentityBundle}
              onOpenCharacterWithIdentity={openCharacterWithIdentity}
            />
          )}

          {tab === 'experiments' && <StudioExperimentsTab />}

          {tab === 'diff' && (
            <StudioDiffTab
              entries={entries}
              diffLeftId={diffLeftId}
              diffRightId={diffRightId}
              onDiffLeftIdChange={setDiffLeftId}
              onDiffRightIdChange={setDiffRightId}
              diffLeft={diffLeft}
              diffRight={diffRight}
              promptDiff={promptDiff}
              onSelectTab={selectStudioTab}
            />
          )}
        </div>
      )}
    </ToolLayout>
  );
}
