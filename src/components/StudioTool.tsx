'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useAuth, type AuthContextValue } from '@/hooks/useAuth';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import {
  loadLocationBlocklist,
  saveLocationBlocklist,
  usePromptHistory,
  type PromptHistoryEntry,
} from '@/hooks/usePromptHistory';
import {
  DEFAULT_STUDIO_TOOL_CACHE,
  removeSavedIdentityBundle,
  upsertSavedIdentityBundle,
} from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import { filterHistoryEntries, type HistoryFilter } from '@/lib/history-filter';
import { buildShareableSceneParams, buildScenePresetShareUrl } from '@/lib/scene-preset-url';
import {
  requeueComfyJobFromHistory,
  requeueRefineFromGalleryEntry,
  requeueUpscaleFromGalleryEntry,
} from '@/lib/comfyui-requeue';
import { findGalleryEntryForHistory } from '@/lib/prompt-lineage';
import {
  applyScenePresetLocks,
  buildScenePresetFromCurrent,
  deleteScenePreset,
  loadScenePresets,
  upsertScenePreset,
  type ScenePreset,
} from '@/lib/scene-presets';
import {
  BUILTIN_PROMPT_TEMPLATES,
  applyPromptTemplate,
  getAllPromptTemplates,
} from '@/lib/prompt-templates';
import { buildRegenerateUrl } from '@/lib/regenerate-url';
import { buildUseAsHintsUrl } from '@/lib/use-as-hints-url';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import {
  applyCharacterIdentityBundle,
  buildCharacterIdentityBundle,
  downloadCharacterIdentityBundle,
  parseCharacterIdentityBundle,
} from '@/lib/character-identity-bundle';
import type { VisualCompareResult } from '@/lib/visual-model-compare';
import { diffPromptWords } from '@/lib/prompt-diff';
import {
  createUserTemplate,
  deleteUserTemplate,
  loadUserTemplates,
  templateFromPrompt,
  upsertUserTemplate,
  type UserPromptTemplate,
} from '@/lib/user-templates';
import { downloadTextFile } from '@/lib/history-export-formats';
import { sortCatalogByRatingBias } from '@/lib/catalog-rating-bias';
import { buildPromptIterationForest, type IterationTreeNode } from '@/lib/prompt-iteration-tree';
import {
  deletePromptProject,
  loadActiveProjectId,
  loadPromptProjects,
  setActiveProjectId,
  upsertPromptProject,
  type PromptProject,
} from '@/lib/prompt-projects';
import { buildPresetPack, downloadPresetPack, parsePresetPack } from '@/lib/preset-packs';
import {
  buildSceneStarterPack,
  downloadSceneStarterPack,
  parseSceneStarterPack,
} from '@/lib/scene-starter-packs';
import {
  buildUserSceneStarterFromHints,
  deleteUserSceneStarterPreset,
  loadUserSceneStarterPresets,
  toggleUserSceneStarterFavorite,
  upsertUserSceneStarterPreset,
  type UserSceneStarterPreset,
} from '@/lib/user-scene-starter-presets';
import type { ModelPortfolioItem } from '@/lib/model-portfolio';
import { studioHistoryUrl } from '@/lib/prompt-lineage';
import {
  startRefineFromHistoryEntry,
  startPromptEditorFromHistoryEntry,
} from '@/lib/improve-output';
import { formatPromptVersionLabel } from '@/lib/prompt-versioning';
import type { RatedTokenStat } from '@/lib/rating-token-analytics';
import type { UserHistoryAnalytics } from '@/lib/user-analytics';
import type { GalleryStats } from '@/lib/gallery-stats';
import { scopeLabel, USER_SCOPE_CHANGED_EVENT } from '@/lib/user-scope';
import {
  buildPromptBriefFromCurrent,
  downloadPromptBrief,
  parsePromptBriefFile,
  applyPromptBrief,
} from '@/lib/prompt-brief';
import { loadComfyGallery, COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/comfyui-gallery';
import { buildGalleryLineageGroups } from '@/lib/gallery-lineage-groups';
import { addAvoidedToken, addAvoidedTokens } from '@/lib/avoided-tokens';
import { DEFAULT_NEGATIVE_PROFILES } from '@/lib/negative-profiles';
import { downloadIterationForestJson } from '@/lib/iteration-tree-export';
import type { CampaignStepResult } from '@/lib/campaign-runner';
import {
  deleteCampaignTemplate,
  loadCampaignTemplates,
  upsertCampaignTemplate,
  type CampaignTemplate,
} from '@/lib/campaign-templates';
import { importProjectBundle } from '@/lib/project-bundle-import';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import type { BranchDiffResult } from '@/lib/iteration-branch-diff';
import {
  ToolBadge,
  ToolBlockGroup,
  ToolContentPanel,
  ToolLayout,
  ToolMetaPanel,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { ChipButton, FieldLabel, TextArea } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { DataList, DataListActions, DataListPrimary, DataListRow } from '@/components/ui/DataList';
import {
  DataListSkeleton,
  EmptyState,
  ErrorState,
  StudioTabSkeleton,
} from '@/components/ui/ViewState';
import { isStudioTabId, studioTabGroupsForWorkspaceMode, type StudioTabId } from '@/lib/studio-nav';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { resolveGenerateEmptyCta } from '@/lib/empty-cta';

const SharedToolControls = dynamic(() => import('@/components/SharedToolControls'), {
  ssr: false,
  loading: () => (
    <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-muted)]/50" aria-hidden />
  ),
});
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
const PromptTimelinePanel = dynamic(() => import('@/components/studio/PromptTimelinePanel'), {
  loading: () => <StudioTabSkeleton />,
});
const EnhancedPromptResult = dynamic(() => import('@/components/LazyEnhancedPromptResult'), {
  loading: () => <StudioTabSkeleton />,
});

const ACCENT = 'violet' as const;

type StudioTab = StudioTabId;

type CatalogClothing = {
  id: string;
  label: string;
  category: string;
};

type CatalogLocation = {
  id: string;
  label: string;
};

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
  const { entries, toggleFavorite, setRating, addTag, removeEntry, clearHistory } =
    usePromptHistory();

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

  const toggleBlockLocation = useCallback((label: string) => {
    setBlocklist(previous => {
      const next = previous.includes(label)
        ? previous.filter(entry => entry !== label)
        : [...previous, label];
      saveLocationBlocklist(next);
      return next;
    });
  }, []);

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
            <ToolSection title="Prompt iteration tree">
              <p className="text-sm text-[var(--text-secondary)]">
                Branches built from saved history entries linked by parent history ids.
              </p>
              {iterationForest.length > 0 ? (
                <div className="mb-4">
                  <p className="type-caption mb-2 text-[var(--text-muted)]">Timeline</p>
                  <PromptTimelinePanel
                    nodes={iterationForest}
                    selectedId={highlightHistoryId ?? undefined}
                    onSelect={historyId => setHighlightHistoryId(historyId)}
                  />
                </div>
              ) : null}
              {iterationEntries.length >= 2 ? (
                <ToolMetaPanel title="Branch diff" className="mb-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                      Left (older)
                      <select
                        value={iterationDiffLeftId}
                        onChange={event => setIterationDiffLeftId(event.target.value)}
                        className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
                      >
                        <option value="">Select entry…</option>
                        {iterationEntries.map(entry => (
                          <option key={entry.id} value={entry.id}>
                            {entry.tool} · {entry.prompt.slice(0, 48)}…
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                      Right (newer)
                      <select
                        value={iterationDiffRightId}
                        onChange={event => setIterationDiffRightId(event.target.value)}
                        className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
                      >
                        <option value="">Select entry…</option>
                        {iterationEntries.map(entry => (
                          <option key={entry.id} value={entry.id}>
                            {entry.tool} · {entry.prompt.slice(0, 48)}…
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {iterationDiff ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="type-caption text-[var(--text-muted)]">
                        {iterationDiff.diff.beforeChars} → {iterationDiff.diff.afterChars} chars
                        {iterationDiff.diff.changed ? '' : ' · identical'}
                      </p>
                      <p className="whitespace-pre-wrap">
                        {iterationDiff.diff.segments.map((segment, index) => (
                          <span
                            key={`${segment.type}-${index}`}
                            className={
                              segment.type === 'add'
                                ? 'text-emerald-300'
                                : segment.type === 'remove'
                                  ? 'text-rose-300 line-through'
                                  : 'text-[var(--text-secondary)]'
                            }
                          >
                            {segment.text}{' '}
                          </span>
                        ))}
                      </p>
                    </div>
                  ) : null}
                </ToolMetaPanel>
              ) : null}
              <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={iterationForest.length === 0}
                  onClick={() => {
                    downloadIterationForestJson(entries);
                    setBackupStatus('Exported iteration tree JSON.');
                  }}
                >
                  Export iteration tree JSON
                </Button>
              </div>
              {iterationForest.length === 0 ? (
                <EmptyState
                  icon="diff"
                  title="No iteration branches yet"
                  description="Save refined prompts to history with lineage to see parent/child trees here."
                />
              ) : (
                <ToolBlockGroup className="mt-[var(--block-gap)]">
                  {iterationForest.map(node => (
                    <IterationTreeNodeCard
                      key={node.entry.id}
                      node={node}
                      depth={0}
                      onRequeueStatus={setBackupStatus}
                      onDiffWithParent={parentId => {
                        setIterationDiffLeftId(parentId);
                        setIterationDiffRightId(node.entry.id);
                      }}
                    />
                  ))}
                </ToolBlockGroup>
              )}
            </ToolSection>
          )}

          {tab === 'campaign' && (
            <ToolSection title="Prompt campaign runner">
              <p className="text-sm text-[var(--text-secondary)]">
                Generate a series of prompts (random scenes or topic list) and optionally queue each
                to ComfyUI under the active project.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                  Source
                  <select
                    value={campaignTarget}
                    onChange={event =>
                      setCampaignTarget(event.target.value as 'random-scene' | 'topics')
                    }
                    className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
                  >
                    <option value="random-scene">Random scenes</option>
                    <option value="topics">Topics batch</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-[var(--text-secondary)]">
                  Count
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={campaignCount}
                    onChange={event => setCampaignCount(Number(event.target.value) || 4)}
                    className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
                  />
                </label>
              </div>
              {campaignTarget === 'random-scene' ? (
                <FieldLabel htmlFor="campaign-genre">Genre/theme hint (optional)</FieldLabel>
              ) : (
                <FieldLabel htmlFor="campaign-topics">Topics (one per line)</FieldLabel>
              )}
              {campaignTarget === 'random-scene' ? (
                <input
                  id="campaign-genre"
                  value={campaignGenre}
                  onChange={event => setCampaignGenre(event.target.value)}
                  className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                />
              ) : (
                <TextArea
                  id="campaign-topics"
                  rows={4}
                  value={campaignTopics}
                  onChange={event => setCampaignTopics(event.target.value)}
                  placeholder="sunset gravel race&#10;rainy alley portrait"
                  className={accentFocusClass(ACCENT)}
                />
              )}
              <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={campaignQueue}
                  onChange={event => setCampaignQueue(event.target.checked)}
                  className={`h-4 w-4 rounded ${accentFocusClass()}`}
                />
                Queue each prompt to ComfyUI
              </label>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  accentClassName={accentButtonClass(ACCENT)}
                  loading={campaignLoading}
                  loadingLabel="Running campaign"
                  disabled={
                    campaignTarget === 'topics' &&
                    campaignTopics
                      .split('\n')
                      .map(line => line.trim())
                      .filter(Boolean).length === 0
                  }
                  onClick={() => {
                    void (async () => {
                      setCampaignLoading(true);
                      setCampaignStatus('Running campaign…');
                      try {
                        const topics =
                          campaignTarget === 'topics'
                            ? campaignTopics
                                .split('\n')
                                .map(line => line.trim())
                                .filter(Boolean)
                            : undefined;
                        const { runPromptCampaign } = await import('@/lib/campaign-runner');
                        const results = await runPromptCampaign({
                          model: shared.model,
                          target: campaignTarget,
                          count: campaignCount,
                          genre: campaignGenre.trim() || undefined,
                          topics,
                          queueToComfyUi: campaignQueue,
                          hints: campaignGenre.trim() || campaignTopics.slice(0, 200),
                        });
                        setCampaignResults(results);
                        const queued = results.filter(step => step.queued).length;
                        const held = results.filter(step => step.held).length;
                        const errors = results.filter(step => step.error).length;
                        setCampaignStatus(
                          [
                            `Campaign finished · ${queued}/${results.length} queued`,
                            held > 0 ? `${held} held Max` : null,
                            errors > 0 ? `${errors} errors` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        );
                        if (held > 0) {
                          toastHeldMax({
                            text: 'Max campaign jobs held until ComfyUI is idle',
                            count: held,
                          });
                        }
                        setGalleryRevision(previous => previous + 1);
                      } catch (err) {
                        setCampaignStatus(err instanceof Error ? err.message : 'Campaign failed.');
                      } finally {
                        setCampaignLoading(false);
                      }
                    })();
                  }}
                >
                  Run campaign
                </PrimaryButton>
              </div>
              {campaignStatus ? (
                <p className="type-caption text-[var(--accent-text)]">{campaignStatus}</p>
              ) : null}
              {campaignResults.length > 0 ? (
                <ToolBlockGroup className="mt-[var(--block-gap)]">
                  {campaignResults.map(step => (
                    <ToolContentPanel key={step.index} className="ui-block-group">
                      <p className="type-caption text-[var(--text-muted)]">
                        Step {step.index + 1}
                        {step.queued ? ' · queued' : ''}
                        {step.held ? ' · held Max until idle' : ''}
                        {step.promptId ? ` · ${step.promptId}` : ''}
                        {step.error ? ` · ${step.error}` : ''}
                      </p>
                      {step.prompt ? (
                        <pre className="type-code max-h-32 overflow-auto whitespace-pre-wrap text-[var(--text-secondary)]">
                          {step.prompt}
                        </pre>
                      ) : null}
                    </ToolContentPanel>
                  ))}
                </ToolBlockGroup>
              ) : null}

              <div className="ui-surface-inset mt-6 space-y-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">Campaign templates</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Save the current campaign settings as a reusable recipe.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="studio-campaign-template-name"
                    value={campaignTemplateName}
                    onChange={event => setCampaignTemplateName(event.target.value)}
                    placeholder="Template name"
                    className="ui-input min-w-[180px] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                  />
                  <Button
                    variant="secondary"
                    disabled={!campaignTemplateName.trim()}
                    onClick={() => {
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
                  >
                    Save template
                  </Button>
                </div>
                {campaignTemplates.length > 0 ? (
                  <ul className="space-y-2">
                    {campaignTemplates.map(template => (
                      <li
                        key={template.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="text-[var(--text-primary)]">{template.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {template.target} · {template.count} prompts
                            {template.queueToComfyUi ? ' · auto-queue' : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="type-caption"
                            onClick={() => {
                              setCampaignTarget(template.target);
                              setCampaignCount(template.count);
                              setCampaignGenre(template.genre ?? '');
                              setCampaignTopics((template.topics ?? []).join('\n'));
                              setCampaignQueue(template.queueToComfyUi);
                              setBackupStatus(`Loaded template “${template.name}”.`);
                            }}
                          >
                            Load
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="type-caption"
                            onClick={() => {
                              deleteCampaignTemplate(template.id);
                              setCampaignTemplates(loadCampaignTemplates());
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    icon="template"
                    title="No campaign templates yet"
                    description="Name the current campaign settings above and save them as a reusable recipe for later batches."
                    action={{
                      label: 'Name a template',
                      onClick: () => {
                        document.getElementById('studio-campaign-template-name')?.focus();
                      },
                    }}
                  />
                )}
              </div>
            </ToolSection>
          )}

          {tab === 'analytics' && (
            <>
              <ToolSection title="Your activity">
                <p className="text-sm text-[var(--text-secondary)]">
                  {authEnabled
                    ? `Scoped to ${user?.username ?? scopeLabel()}. History and gallery stats reflect only this account’s browser data.`
                    : 'Shared browser session — enable login to scope history and analytics per user.'}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { label: 'History', value: historyAnalytics.total },
                    {
                      label: 'History rated',
                      value: historyAnalytics.rated,
                    },
                    {
                      label: 'History favorites',
                      value: historyAnalytics.favorites,
                    },
                    {
                      label: 'Avg history rating',
                      value:
                        historyAnalytics.avgRating != null ? `${historyAnalytics.avgRating}★` : '—',
                    },
                    { label: 'Gallery', value: galleryAnalytics.total },
                    {
                      label: 'Gallery rated',
                      value: Math.max(0, galleryAnalytics.completed - galleryAnalytics.unreviewed),
                    },
                  ].map(stat => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/50 px-3 py-2"
                    >
                      <p className="type-caption text-[var(--text-muted)]">{stat.label}</p>
                      <p className="type-heading tabular-nums text-[var(--text-primary)]">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
                {historyAnalytics.byTool.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {historyAnalytics.byTool.map(entry => (
                      <span
                        key={entry.tool}
                        className="rounded-full border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                      >
                        {entry.tool} · {entry.count}
                      </span>
                    ))}
                  </div>
                ) : null}
              </ToolSection>

              <ToolSection title="Gallery rating analytics">
                <p className="text-sm text-[var(--text-secondary)]">
                  Tokens that correlate with high (4–5★) or low (1–2★) gallery ratings. Rate outputs
                  in Gallery review mode to grow this list.
                </p>
                {ratingTokenStats.length > 0 ? (
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void import('@/lib/rating-token-analytics').then(
                          ({ negativeScoringTokens }) => {
                            const added = addAvoidedTokens(negativeScoringTokens(ratingTokenStats));
                            setBackupStatus(
                              added > 0
                                ? `Added ${added} negative-scoring token(s) to avoided list.`
                                : 'No new negative-scoring tokens to add.'
                            );
                          }
                        );
                      }}
                    >
                      Add negative tokens to avoidance
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void (async () => {
                          const [
                            { negativeScoringTokens },
                            { appendTokensToNegativeProfileExtra },
                            settingsMod,
                          ] = await Promise.all([
                            import('@/lib/rating-token-analytics'),
                            import('@/lib/negative-profiles'),
                            import('@/lib/comfyui-settings'),
                          ]);
                          const tokens = negativeScoringTokens(ratingTokenStats);
                          if (tokens.length === 0) {
                            setBackupStatus('No negative-scoring tokens to append yet.');
                            return;
                          }
                          const settings = settingsMod.loadComfyUiSettings();
                          const profiles =
                            (settings.negativeProfiles?.length ?? 0) > 0
                              ? [...settings.negativeProfiles!]
                              : [...DEFAULT_NEGATIVE_PROFILES];
                          const profileId =
                            settings.selectedNegativeProfileId ?? profiles[0]?.id ?? 'general-sd';
                          const profileLabel =
                            profiles.find(entry => entry.id === profileId)?.label ?? profileId;
                          const { profiles: nextProfiles, added } =
                            appendTokensToNegativeProfileExtra(profiles, profileId, tokens);
                          settingsMod.saveComfyUiSettings({
                            ...settings,
                            negativeProfiles: nextProfiles,
                          });
                          setBackupStatus(
                            added > 0
                              ? `Appended ${added} token(s) to negative profile “${profileLabel}”.`
                              : `Negative profile “${profileLabel}” already includes those tokens.`
                          );
                        })();
                      }}
                    >
                      Apply negatives to profile
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void import('@/lib/rating-token-analytics').then(
                          ({ positiveScoringTokens, buildSceneHintsFromPositiveTokens }) => {
                            const tokens = positiveScoringTokens(ratingTokenStats);
                            if (tokens.length === 0) {
                              setBackupStatus('No positive-scoring tokens to promote yet.');
                              return;
                            }
                            const hints = buildSceneHintsFromPositiveTokens(tokens);
                            const preset = buildUserSceneStarterFromHints({
                              label: `Gallery tokens (${tokens.slice(0, 3).join(', ')})`,
                              hints,
                              category: 'lifestyle',
                              source: 'promoted',
                            });
                            upsertUserSceneStarterPreset(preset);
                            setUserSceneStarters(loadUserSceneStarterPresets());
                            setBackupStatus(
                              `Saved scene starter preset from ${tokens.length} high-scoring token(s).`
                            );
                          }
                        );
                      }}
                    >
                      Promote top tokens to scene preset
                    </Button>
                  </div>
                ) : null}
                {ratingTokenStats.length === 0 ? (
                  <EmptyState
                    icon="diff"
                    title="Not enough rated gallery entries"
                    description="Complete ComfyUI jobs, rate them in Gallery review mode, then return here."
                  />
                ) : (
                  <ToolBlockGroup className="mt-[var(--block-gap)]">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {ratingTokenStats.map(stat => (
                        <ToolContentPanel key={stat.token} className="ui-block-group">
                          <p className="type-title">{stat.token}</p>
                          <p className="type-caption text-[var(--text-muted)]">
                            score {stat.score > 0 ? '+' : ''}
                            {stat.score} · {stat.highCount} high · {stat.lowCount} low
                          </p>
                          {stat.score < 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                addAvoidedToken(stat.token);
                                setBackupStatus(`Added “${stat.token}” to avoided tokens.`);
                              }}
                              className="type-caption text-rose-300 hover:text-rose-200"
                            >
                              Add to avoided
                            </button>
                          ) : null}
                          {stat.score > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                const preset = buildUserSceneStarterFromHints({
                                  label: `Motif: ${stat.token}`,
                                  hints: stat.token,
                                  category: 'lifestyle',
                                  source: 'promoted',
                                });
                                upsertUserSceneStarterPreset(preset);
                                setUserSceneStarters(loadUserSceneStarterPresets());
                                setBackupStatus(`Saved scene starter preset for “${stat.token}”.`);
                              }}
                              className="type-caption text-emerald-300 hover:text-emerald-200"
                            >
                              Save as scene preset
                            </button>
                          ) : null}
                        </ToolContentPanel>
                      ))}
                    </div>
                  </ToolBlockGroup>
                )}
              </ToolSection>

              <ToolSection title="Gallery lineage clusters">
                <p className="text-sm text-[var(--text-secondary)]">
                  Parent outputs with upscale, refine, or variation derivatives. Open Gallery to act
                  on a cluster.
                </p>
                {galleryLineageClusters.length === 0 ? (
                  <EmptyState
                    icon="diff"
                    title="No lineage clusters yet"
                    description="Upscale, refine, or re-queue variations from Gallery to build derivative trees."
                  />
                ) : (
                  <ul className="mt-3 space-y-2">
                    {galleryLineageClusters.map(group => (
                      <li
                        key={group.root.id}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/35 px-3 py-2"
                      >
                        <p className="type-caption text-[var(--text-muted)]">
                          {group.root.model ?? group.root.tool} · {group.derivatives.length}{' '}
                          derivative
                          {group.derivatives.length === 1 ? '' : 's'}
                          {group.root.reviewRating ? ` · ${group.root.reviewRating}★ root` : ''}
                        </p>
                        <p className="type-body ui-truncate-2 text-[var(--text-primary)]">
                          {group.root.prompt}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {group.derivatives.slice(0, 4).map(derivative => (
                            <span
                              key={derivative.id}
                              className="rounded-full border border-violet-500/20 bg-violet-500/5 px-2 py-0.5 text-[10px] text-violet-200/90"
                            >
                              {derivative.derivedKind ?? 'derived'}
                              {derivative.reviewRating ? ` · ${derivative.reviewRating}★` : ''}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ToolSection>
            </>
          )}

          {tab === 'projects' && (
            <ToolSection title="Prompt projects">
              <p className="text-sm text-[var(--text-secondary)]">
                Group history and gallery jobs under named campaigns. Set an active project to
                filter Studio history.
              </p>
              {sharedProjects.length > 0 ? (
                <div className="mb-4 space-y-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <p className="type-caption text-violet-200/80">Shared team projects</p>
                  <ul className="space-y-2">
                    {sharedProjects.map(project => (
                      <li
                        key={project.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)]/60 bg-[var(--bg-muted)]/30 px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-[var(--text-primary)]">{project.name}</p>
                          {project.notes ? (
                            <p className="text-xs text-[var(--text-muted)]">{project.notes}</p>
                          ) : null}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const local = upsertPromptProject({
                              id: `shared-${project.id}`,
                              name: project.name,
                              notes: project.notes,
                            });
                            setProjects(loadPromptProjects());
                            setActiveProjectIdState(local.id);
                            setActiveProjectId(local.id);
                            setBackupStatus(`Adopted shared project “${project.name}”.`);
                          }}
                        >
                          Adopt as local
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={projectName}
                  onChange={event => setProjectName(event.target.value)}
                  placeholder="Project name"
                  className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                />
                <input
                  value={projectNotes}
                  onChange={event => setProjectNotes(event.target.value)}
                  placeholder="Notes (optional)"
                  className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                />
              </div>
              <PrimaryButton
                accentClassName={accentButtonClass(ACCENT)}
                disabled={!projectName.trim()}
                onClick={() => {
                  const project = upsertPromptProject({
                    id: `project-${Date.now().toString(36)}`,
                    name: projectName,
                    notes: projectNotes,
                  });
                  setProjects(loadPromptProjects());
                  setActiveProjectIdState(project.id);
                  setActiveProjectId(project.id);
                  setProjectName('');
                  setProjectNotes('');
                  setBackupStatus(`Created project “${project.name}”.`);
                }}
              >
                Create project
              </PrimaryButton>
              <ToolBlockGroup className="mt-[var(--block-gap)]">
                {projects.map(project => (
                  <ToolContentPanel key={project.id} className="ui-block-group">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="type-heading">{project.name}</p>
                        {project.notes ? (
                          <p className="type-caption text-[var(--text-muted)]">{project.notes}</p>
                        ) : null}
                      </div>
                      <div className="ui-list-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="type-caption"
                          onClick={() => {
                            setActiveProjectIdState(project.id);
                            setActiveProjectId(project.id);
                            selectStudioTab('history');
                          }}
                        >
                          {activeProjectId === project.id ? 'Active' : 'Set active'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="type-caption"
                          onClick={() => {
                            deletePromptProject(project.id);
                            setProjects(loadPromptProjects());
                            if (activeProjectId === project.id) {
                              setActiveProjectIdState(undefined);
                            }
                          }}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="type-caption"
                          onClick={() => {
                            void (async () => {
                              const { buildProjectBundle, exportProjectBundleJson } =
                                await import('@/lib/project-bundle');
                              const bundle = buildProjectBundle({
                                project,
                                history: entries,
                                gallery: loadComfyGallery(),
                                scenePresets: loadScenePresets(),
                              });
                              downloadTextFile(
                                exportProjectBundleJson(bundle),
                                `${project.name.replace(/\s+/g, '-').toLowerCase()}-bundle.json`,
                                'application/json'
                              );
                              setBackupStatus(`Exported bundle for “${project.name}”.`);
                            })();
                          }}
                        >
                          Export bundle
                        </Button>
                      </div>
                    </div>
                  </ToolContentPanel>
                ))}
              </ToolBlockGroup>
              <div className="mt-4">
                <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
                  Import project bundle
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void file.text().then(async raw => {
                        try {
                          const { parseProjectBundle } = await import('@/lib/project-bundle');
                          const bundle = parseProjectBundle(raw);
                          const result = importProjectBundle(bundle);
                          setProjects(loadPromptProjects());
                          setActiveProjectIdState(bundle.project.id);
                          setActiveProjectId(bundle.project.id);
                          setGalleryRevision(previous => previous + 1);
                          setBackupStatus(
                            `Imported “${bundle.project.name}” · +${result.historyAdded} history · +${result.galleryAdded} gallery`
                          );
                        } catch (err) {
                          setBackupStatus(err instanceof Error ? err.message : 'Import failed.');
                        }
                        event.target.value = '';
                      });
                    }}
                  />
                </label>
              </div>
            </ToolSection>
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
            <ToolSection title="Catalog browser">
              <input
                value={catalogQuery}
                onChange={event => setCatalogQuery(event.target.value)}
                placeholder="Search clothing or locations…"
                className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              />

              <div className="mt-[var(--block-gap)] grid gap-[var(--block-gap)] lg:grid-cols-2">
                {catalogError ? (
                  <div className="lg:col-span-2">
                    <ErrorState
                      title="Catalog unavailable"
                      description={catalogError}
                      action={{
                        label: 'Retry',
                        onClick: () => void loadCatalog(catalogQuery),
                      }}
                    />
                  </div>
                ) : catalogLoading ? (
                  <>
                    <ToolBlockGroup title="Clothing">
                      <DataListSkeleton rows={6} />
                    </ToolBlockGroup>
                    <ToolBlockGroup title="Locations">
                      <DataListSkeleton rows={6} />
                    </ToolBlockGroup>
                  </>
                ) : (
                  <>
                    <ToolBlockGroup title="Clothing">
                      {catalogClothing.length === 0 ? (
                        <EmptyState
                          compact
                          icon="catalog"
                          title="No clothing found"
                          description={
                            catalogQuery.trim()
                              ? 'Nothing matched your search. Try a shorter query or clear the filter.'
                              : 'The catalog returned no wardrobe entries.'
                          }
                          action={
                            catalogQuery.trim()
                              ? {
                                  label: 'Clear search',
                                  onClick: () => setCatalogQuery(''),
                                }
                              : {
                                  label: 'Reload catalog',
                                  onClick: () => void loadCatalog(''),
                                }
                          }
                        />
                      ) : (
                        <DataList>
                          {sortedCatalogClothing.map(entry => (
                            <DataListRow key={entry.id}>
                              <DataListPrimary title={entry.label} subtitle={entry.category} />
                              <DataListActions>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="type-caption"
                                  onClick={() => {
                                    setPresetHints(previous =>
                                      previous.trim()
                                        ? `${previous.trim()}, ${entry.label}`
                                        : entry.label
                                    );
                                    setBackupStatus(`Added “${entry.label}” to preset hints.`);
                                  }}
                                >
                                  Insert
                                </Button>
                                <Button
                                  variant={shared.lockedWardrobeId === entry.id ? 'info' : 'ghost'}
                                  size="sm"
                                  className="type-caption"
                                  onClick={() => updateShared({ lockedWardrobeId: entry.id })}
                                >
                                  {shared.lockedWardrobeId === entry.id ? 'Locked' : 'Lock kit'}
                                </Button>
                              </DataListActions>
                            </DataListRow>
                          ))}
                        </DataList>
                      )}
                    </ToolBlockGroup>
                    <ToolBlockGroup title={`Locations · blocklist (${blocklist.length})`}>
                      {catalogLocations.length === 0 ? (
                        <EmptyState
                          compact
                          icon="catalog"
                          title="No locations found"
                          description={
                            catalogQuery.trim()
                              ? 'Nothing matched your search. Try a different keyword or clear the filter.'
                              : 'The catalog returned no location entries.'
                          }
                          action={
                            catalogQuery.trim()
                              ? {
                                  label: 'Clear search',
                                  onClick: () => setCatalogQuery(''),
                                }
                              : {
                                  label: 'Reload catalog',
                                  onClick: () => void loadCatalog(''),
                                }
                          }
                        />
                      ) : (
                        <DataList>
                          {sortedCatalogLocations.map(entry => {
                            const blocked = blocklist.includes(entry.label);
                            const locked = shared.lockedLocation === entry.label;
                            return (
                              <DataListRow key={entry.id}>
                                <button
                                  type="button"
                                  onClick={() => toggleBlockLocation(entry.label)}
                                  className="ui-list-primary text-left transition hover:text-[var(--text-primary)]"
                                >
                                  <p
                                    className={`type-heading ui-truncate ${
                                      blocked
                                        ? 'text-[var(--tint-danger-text)]'
                                        : 'text-[var(--text-primary)]'
                                    }`}
                                  >
                                    {entry.label}
                                    {blocked ? ' · blocked' : ''}
                                  </p>
                                </button>
                                <DataListActions>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="type-caption"
                                    onClick={() => {
                                      setPresetHints(previous =>
                                        previous.trim()
                                          ? `${previous.trim()}, location: ${entry.label}`
                                          : `location: ${entry.label}`
                                      );
                                      setBackupStatus(`Added location “${entry.label}”.`);
                                    }}
                                  >
                                    Insert
                                  </Button>
                                  <Button
                                    variant={locked ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className="type-caption"
                                    onClick={() =>
                                      updateShared({
                                        lockedLocation: locked ? undefined : entry.label,
                                      })
                                    }
                                  >
                                    {locked ? 'Locked' : 'Lock location'}
                                  </Button>
                                </DataListActions>
                              </DataListRow>
                            );
                          })}
                        </DataList>
                      )}
                    </ToolBlockGroup>
                  </>
                )}
              </div>
            </ToolSection>
          )}

          {tab === 'templates' && (
            <ToolSection>
              <div className="space-y-2">
                <FieldLabel htmlFor="studio-template-select">Template</FieldLabel>
                <select
                  id="studio-template-select"
                  value={toolSettings.templateId ?? 'duo-sport-race'}
                  onChange={event => updateToolSettings({ templateId: event.target.value })}
                  className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                >
                  <optgroup label="Built-in">
                    {BUILTIN_PROMPT_TEMPLATES.map(entry => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </optgroup>
                  {userTemplates.length > 0 && (
                    <optgroup label="Custom">
                      {userTemplates.map(entry => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {!template ? (
                <EmptyState
                  icon="template"
                  title="Template not found"
                  description="The selected template may have been deleted. Choose a built-in template from the list above to continue editing slots and preview."
                  action={{
                    label: 'Use default template',
                    onClick: () => updateToolSettings({ templateId: 'duo-sport-race' }),
                  }}
                />
              ) : (
                <>
                  <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
                    <input
                      id="studio-custom-template-name"
                      value={customTemplateName}
                      onChange={event => setCustomTemplateName(event.target.value)}
                      placeholder="Custom template name"
                      className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                    />
                    <PrimaryButton
                      accentClassName={accentButtonClass(ACCENT)}
                      disabled={!customTemplateName.trim() || !filledTemplate.trim()}
                      onClick={() => {
                        const created = createUserTemplate({
                          name: customTemplateName,
                          template: filledTemplate,
                          defaultPortraitStyle: template.defaultPortraitStyle,
                        });
                        upsertUserTemplate(created);
                        setUserTemplates(loadUserTemplates());
                        updateToolSettings({ templateId: created.id });
                        setCustomTemplateName('');
                        setBackupStatus(`Saved custom template “${created.label}”.`);
                      }}
                    >
                      Save preview as custom template
                    </PrimaryButton>
                  </div>

                  {userTemplates.some(entry => entry.id === template.id) && (
                    <Button
                      variant="danger"
                      size="sm"
                      className="type-caption"
                      onClick={() => {
                        deleteUserTemplate(template.id);
                        setUserTemplates(loadUserTemplates());
                        updateToolSettings({ templateId: 'duo-sport-race' });
                        setBackupStatus(`Deleted template “${template.label}”.`);
                      }}
                    >
                      Delete custom template
                    </Button>
                  )}

                  <ToolContentPanel>
                    <p className="type-code whitespace-pre-wrap !bg-transparent !p-0 text-[var(--text-secondary)]">
                      {template.template}
                    </p>
                  </ToolContentPanel>

                  {Array.from(template.template.matchAll(/\{\{(\w+)\}\}/g), match => match[1]!)
                    .length === 0 ? (
                    <EmptyState
                      compact
                      icon="template"
                      title="No template slots"
                      description="This template has no {{slot}} placeholders. Edit the template text or pick another template to fill variables."
                      action={{
                        label: 'Browse built-ins',
                        onClick: () => document.getElementById('studio-template-select')?.focus(),
                      }}
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Array.from(
                        template.template.matchAll(/\{\{(\w+)\}\}/g),
                        match => match[1]!
                      ).map(slot => (
                        <div key={slot} className="space-y-2">
                          <FieldLabel htmlFor={`studio-template-slot-${slot}`}>{slot}</FieldLabel>
                          <input
                            id={`studio-template-slot-${slot}`}
                            value={toolSettings.templateSlots?.[slot] ?? ''}
                            onChange={event =>
                              updateToolSettings({
                                templateSlots: {
                                  ...toolSettings.templateSlots,
                                  [slot]: event.target.value,
                                },
                              })
                            }
                            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <EnhancedPromptResult
                    output={filledTemplate}
                    provider={null}
                    copied={copied}
                    onCopy={() => copyText(filledTemplate)}
                    extraMeta="template preview"
                  />

                  <Link
                    href={`/character?mode=duo&hints=${encodeURIComponent(filledTemplate)}`}
                    className="ui-btn-primary inline-flex w-fit"
                  >
                    Open in Character (duo)
                  </Link>
                </>
              )}
            </ToolSection>
          )}

          {tab === 'presets' && (
            <ToolSection>
              <p className="text-sm text-[var(--text-secondary)]">
                Save named bundles of hints and shared locks (kit, location, seed) for quick reuse
                across Generate, Character, and Background.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const brief = buildPromptBriefFromCurrent({
                      label: presetName.trim() || 'Studio brief',
                      hints: presetHints.trim() || filledTemplate || 'scene hints',
                      model: shared.model,
                      detailLevel: shared.detail,
                      tool: 'studio',
                    });
                    downloadPromptBrief(brief);
                    setBackupStatus('Prompt brief downloaded.');
                  }}
                >
                  Export prompt brief
                </Button>
                <label className="ui-btn-secondary cursor-pointer px-4 py-2 text-sm">
                  Import prompt brief
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      void file
                        .text()
                        .then(raw => {
                          const brief = parsePromptBriefFile(raw);
                          applyPromptBrief(brief);
                          setPresetName(brief.label);
                          setPresetHints(brief.hints);
                          setBackupStatus(`Loaded prompt brief “${brief.label}”.`);
                        })
                        .catch(error => {
                          setBackupStatus(
                            error instanceof Error ? error.message : 'Import failed.'
                          );
                        });
                    }}
                  />
                </label>
              </div>

              <SharedToolControls
                shared={shared}
                onModelChange={model => updateShared({ model })}
                onDetailChange={detail => updateShared({ detail })}
                onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
                lockedWardrobeId={shared.lockedWardrobeId}
                lockedLocation={shared.lockedLocation}
                lockedVariationSeed={shared.lockedVariationSeed}
                onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
                onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
                onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
              />

              <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <FieldLabel htmlFor="studio-preset-name">Preset name</FieldLabel>
                  <input
                    id="studio-preset-name"
                    value={presetName}
                    onChange={event => setPresetName(event.target.value)}
                    placeholder="Gravel duo night race"
                    className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel htmlFor="studio-preset-hints">Hints (optional)</FieldLabel>
                  <input
                    id="studio-preset-hints"
                    value={presetHints}
                    onChange={event => setPresetHints(event.target.value)}
                    placeholder={compareHints}
                    className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                  />
                </div>
              </div>

              <PrimaryButton
                accentClassName={accentButtonClass(ACCENT)}
                disabled={!presetName.trim()}
                onClick={() => {
                  const preset = buildScenePresetFromCurrent({
                    name: presetName,
                    hints: presetHints || compareHints,
                    tool: 'studio',
                    shared,
                  });
                  upsertScenePreset(preset);
                  setScenePresets(loadScenePresets());
                  setPresetName('');
                  setBackupStatus(`Saved preset “${preset.name}”.`);
                }}
              >
                Save current locks as preset
              </PrimaryButton>

              <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-sm font-medium text-[var(--text-primary)]">Preset packs</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Export or import bundles of scene presets for sharing across machines.
                </p>
                <input
                  value={presetPackName}
                  onChange={event => setPresetPackName(event.target.value)}
                  placeholder="Pack name"
                  className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={!presetPackName.trim() || scenePresets.length === 0}
                    onClick={() =>
                      downloadPresetPack(
                        buildPresetPack({
                          name: presetPackName.trim(),
                          presets: scenePresets,
                        })
                      )
                    }
                  >
                    Export pack
                  </Button>
                  <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
                    Import pack
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        void file
                          .text()
                          .then(raw => {
                            const pack = parsePresetPack(raw);
                            for (const preset of pack.presets) {
                              upsertScenePreset(preset);
                            }
                            setScenePresets(loadScenePresets());
                            setBackupStatus(`Imported preset pack “${pack.name}”.`);
                          })
                          .catch(err => {
                            setBackupStatus(err instanceof Error ? err.message : 'Import failed.');
                          });
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Scene starter presets
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Saved from Generate/Character preset panels or promoted from Gallery analytics.
                  These appear in the preset catalog on Generate and Character.
                </p>
                <input
                  value={sceneStarterPackName}
                  onChange={event => setSceneStarterPackName(event.target.value)}
                  placeholder="Starter pack name"
                  className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={!sceneStarterPackName.trim() || userSceneStarters.length === 0}
                    onClick={() =>
                      downloadSceneStarterPack(
                        buildSceneStarterPack({
                          name: sceneStarterPackName.trim(),
                          presets: userSceneStarters,
                        })
                      )
                    }
                  >
                    Export starter pack
                  </Button>
                  <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
                    Import starter pack
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        void file
                          .text()
                          .then(raw => {
                            const pack = parseSceneStarterPack(raw);
                            for (const preset of pack.presets) {
                              upsertUserSceneStarterPreset(preset);
                            }
                            setUserSceneStarters(loadUserSceneStarterPresets());
                            setBackupStatus(`Imported scene starter pack “${pack.name}”.`);
                          })
                          .catch(err => {
                            setBackupStatus(err instanceof Error ? err.message : 'Import failed.');
                          });
                      }}
                    />
                  </label>
                </div>
                {userSceneStarters.length === 0 ? (
                  <EmptyState
                    compact
                    icon="preset"
                    title="No scene starters yet"
                    description="Save a starter from Generate or Character, or promote high-scoring tokens from Analytics. They appear in those tools’ preset catalogs."
                    action={resolveGenerateEmptyCta({
                      label: 'Open Generate',
                      href: '/',
                    })}
                  />
                ) : (
                  <DataList scrollable={false}>
                    {userSceneStarters.map(preset => (
                      <DataListRow key={preset.id} className="!items-start !py-4">
                        <DataListPrimary
                          title={
                            <>
                              {preset.favorite ? '★ ' : null}
                              {preset.label}
                            </>
                          }
                          subtitle={preset.hints}
                        />
                        <div className="ui-list-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="type-caption"
                            onClick={() => {
                              toggleUserSceneStarterFavorite(preset.id);
                              setUserSceneStarters(loadUserSceneStarterPresets());
                            }}
                          >
                            {preset.favorite ? 'Unfavorite' : 'Favorite'}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            className="type-caption"
                            onClick={() => {
                              deleteUserSceneStarterPreset(preset.id);
                              setUserSceneStarters(loadUserSceneStarterPresets());
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </DataListRow>
                    ))}
                  </DataList>
                )}
              </div>

              <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Character identity bundles
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Export/import — or save to a browser-local list — reusable character sheets:
                  locks, hints, pinned descriptor, and a portable IP-Adapter reference
                  (image/strength/model — see Settings → ComfyUI). Enable LoRAs from the LoRA stack
                  on each tool.
                </p>
                <input
                  value={identityBundleName}
                  onChange={event => setIdentityBundleName(event.target.value)}
                  placeholder="Character name"
                  className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={!identityBundleName.trim()}
                    onClick={() =>
                      downloadCharacterIdentityBundle(
                        buildCharacterIdentityBundle({
                          name: identityBundleName,
                          shared,
                          hints: presetHints || compareHints,
                        })
                      )
                    }
                  >
                    Export bundle
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!identityBundleName.trim()}
                    onClick={() => {
                      const bundle = buildCharacterIdentityBundle({
                        name: identityBundleName,
                        shared,
                        hints: presetHints || compareHints,
                      });
                      updateToolSettings({
                        savedIdentityBundles: upsertSavedIdentityBundle(
                          toolSettings.savedIdentityBundles,
                          bundle
                        ),
                      });
                      setBackupStatus(`Saved identity bundle “${bundle.name}” to your list.`);
                    }}
                  >
                    Save to list
                  </Button>
                  <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]">
                    Import bundle
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        void file
                          .text()
                          .then(raw => {
                            const bundle = parseCharacterIdentityBundle(raw);
                            applyIdentityBundle(bundle);
                            setBackupStatus(`Imported identity bundle “${bundle.name}”.`);
                          })
                          .catch(err => {
                            setBackupStatus(err instanceof Error ? err.message : 'Import failed.');
                          });
                      }}
                    />
                  </label>
                </div>
                {(toolSettings.savedIdentityBundles ?? []).length > 0 ? (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                      Saved bundles ({(toolSettings.savedIdentityBundles ?? []).length})
                    </p>
                    <DataList scrollable={false}>
                      {(toolSettings.savedIdentityBundles ?? []).map(bundle => (
                        <DataListRow key={bundle.name} className="!items-start !py-3">
                          <DataListPrimary
                            title={bundle.name}
                            subtitle={
                              [
                                bundle.model,
                                bundle.ipAdapterImageFilename ? 'IP-Adapter ref' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || undefined
                            }
                          />
                          <div className="ui-list-actions">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="type-caption"
                              onClick={() => {
                                applyIdentityBundle(bundle);
                                setBackupStatus(`Applied identity bundle “${bundle.name}”.`);
                              }}
                            >
                              Apply
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="type-caption"
                              onClick={() => openCharacterWithIdentity(bundle)}
                            >
                              Open Character
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className="type-caption"
                              onClick={() =>
                                updateToolSettings({
                                  savedIdentityBundles: removeSavedIdentityBundle(
                                    toolSettings.savedIdentityBundles,
                                    bundle.name
                                  ),
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </DataListRow>
                      ))}
                    </DataList>
                  </div>
                ) : null}
              </div>

              {scenePresets.length === 0 ? (
                <EmptyState
                  icon="preset"
                  title="No scene presets saved"
                  description="Enter a name and optional hints above, then save your current locks as a reusable preset you can apply or share with Duo."
                  action={{
                    label: 'Name a preset',
                    onClick: () => {
                      document.getElementById('studio-preset-name')?.focus();
                    },
                  }}
                />
              ) : (
                <DataList scrollable={false} className="mt-[var(--block-gap)]">
                  {scenePresets.map(preset => (
                    <DataListRow key={preset.id} className="!items-start !py-4">
                      <DataListPrimary
                        title={preset.name}
                        subtitle={
                          <>
                            {preset.hints ? preset.hints : 'No hints'}
                            {preset.sharedLocks?.lockedLocation
                              ? ` · location: ${preset.sharedLocks.lockedLocation}`
                              : ''}
                          </>
                        }
                      />
                      <DataListActions>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="type-caption"
                          onClick={() => {
                            updateShared(applyScenePresetLocks(preset));
                            if (preset.hints) {
                              setCompareHints(preset.hints);
                            }
                            setBackupStatus(`Applied preset “${preset.name}”.`);
                          }}
                        >
                          Apply locks
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="type-caption"
                          onClick={() => {
                            const url = buildScenePresetShareUrl(
                              '/character',
                              buildShareableSceneParams({
                                hints: preset.hints,
                                sportPresetId: preset.sportPresetId,
                                shared: {
                                  lockedWardrobeId: preset.sharedLocks?.lockedWardrobeId,
                                  lockedLocation: preset.sharedLocks?.lockedLocation,
                                  lockedVariationSeed: preset.sharedLocks?.lockedVariationSeed,
                                },
                              }),
                              { mode: 'duo' }
                            );
                            const absolute =
                              typeof window !== 'undefined'
                                ? `${window.location.origin}${url}`
                                : url;
                            void navigator.clipboard.writeText(absolute);
                            setCopiedPresetShareId(preset.id);
                            window.setTimeout(() => setCopiedPresetShareId(null), 2000);
                          }}
                        >
                          {copiedPresetShareId === preset.id ? 'Copied link!' : 'Copy share link'}
                        </Button>
                        <a
                          href={buildScenePresetShareUrl(
                            '/character',
                            buildShareableSceneParams({
                              hints: preset.hints,
                              sportPresetId: preset.sportPresetId,
                              shared: {
                                lockedWardrobeId: preset.sharedLocks?.lockedWardrobeId,
                                lockedLocation: preset.sharedLocks?.lockedLocation,
                                lockedVariationSeed: preset.sharedLocks?.lockedVariationSeed,
                              },
                            }),
                            { mode: 'duo' }
                          )}
                          className="ui-btn-ghost ui-btn-sm type-caption"
                        >
                          Open Character (duo)
                        </a>
                        <Button
                          variant="danger"
                          size="sm"
                          className="type-caption"
                          onClick={() => {
                            deleteScenePreset(preset.id);
                            setScenePresets(loadScenePresets());
                          }}
                        >
                          Delete
                        </Button>
                      </DataListActions>
                    </DataListRow>
                  ))}
                </DataList>
              )}
            </ToolSection>
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

function IterationTreeNodeCard({
  node,
  depth,
  onRequeueStatus,
  onDiffWithParent,
}: {
  node: IterationTreeNode;
  depth: number;
  onRequeueStatus: (message: string) => void;
  onDiffWithParent?: (parentId: string) => void;
}) {
  const regenerateUrl = buildRegenerateUrl(node.entry);
  const useAsHintsUrl = buildUseAsHintsUrl(node.entry);
  const linkedGalleryEntry = findGalleryEntryForHistory(node.entry);
  const parentHistoryId =
    typeof node.entry.metadata?.parentHistoryId === 'string'
      ? node.entry.metadata.parentHistoryId
      : undefined;

  function queueUpscale(qualityProfile: 'final' | 'max') {
    if (!linkedGalleryEntry) {
      onRequeueStatus(
        'No linked gallery output — queue from Gallery first, then upscale from the iteration tree.'
      );
      return;
    }
    onRequeueStatus(`Upscaling linked gallery output (${qualityProfile})…`);
    void requeueUpscaleFromGalleryEntry(linkedGalleryEntry, {
      qualityProfile,
      onStatus: onRequeueStatus,
    }).then(result => {
      if (!result.ok) {
        onRequeueStatus(result.error ?? 'Upscale failed.');
        toastQueueOutcome({ ok: false, text: result.error ?? 'Upscale failed.' });
        return;
      }
      if (result.held) {
        const message = 'Max upscale held until ComfyUI queue is idle';
        onRequeueStatus(message);
        toastHeldMax({ text: message });
        return;
      }
      const message = result.promptId ? `Upscale queued · ${result.promptId}` : 'Upscale queued';
      onRequeueStatus(message);
      toastQueueOutcome({ ok: true, text: message });
    });
  }

  function queueRefine() {
    if (!linkedGalleryEntry) {
      onRequeueStatus(
        'No linked gallery output — open Gallery and use Refine on the completed output.'
      );
      return;
    }
    onRequeueStatus('Queueing low-denoise refine from linked gallery output…');
    void requeueRefineFromGalleryEntry(linkedGalleryEntry, {
      onStatus: onRequeueStatus,
    }).then(result => {
      if (!result.ok) {
        onRequeueStatus(result.error ?? 'Refine failed.');
        toastQueueOutcome({ ok: false, text: result.error ?? 'Refine failed.' });
        return;
      }
      if (result.held) {
        const message = 'Max refine held until ComfyUI queue is idle';
        onRequeueStatus(message);
        toastHeldMax({ text: message });
        return;
      }
      const message = result.promptId ? `Refine queued · ${result.promptId}` : 'Refine queued';
      onRequeueStatus(message);
      toastQueueOutcome({ ok: true, text: message });
    });
  }

  return (
    <div className="space-y-3" style={{ marginLeft: depth * 16 }}>
      <ToolContentPanel className="ui-block-group">
        <p className="type-caption text-[var(--text-muted)]">
          {formatPromptVersionLabel(node.entry.promptVersion) ? (
            <span className="mr-1.5 inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">
              {formatPromptVersionLabel(node.entry.promptVersion)}
            </span>
          ) : null}
          {node.entry.tool} · {node.entry.model} · {new Date(node.entry.timestamp).toLocaleString()}
        </p>
        <pre className="type-code max-h-32 overflow-auto whitespace-pre-wrap text-[var(--text-secondary)]">
          {node.entry.prompt}
        </pre>
        <div className="flex flex-wrap gap-2">
          <a href={regenerateUrl} className="type-caption text-sky-300 hover:text-sky-200">
            Regenerate
          </a>
          <a href={useAsHintsUrl} className="type-caption text-sky-300 hover:text-sky-200">
            Use as hints
          </a>
          <button
            type="button"
            onClick={() => startRefineFromHistoryEntry(node.entry)}
            className="type-caption text-violet-300 hover:text-violet-200"
          >
            Edit & refine prompt
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(node.entry.prompt).then(
                () => {
                  startPromptEditorFromHistoryEntry(node.entry);
                },
                () => {
                  startPromptEditorFromHistoryEntry(node.entry);
                }
              );
            }}
            className="type-caption text-emerald-300 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
          >
            Restore as current
          </button>
          {linkedGalleryEntry ? (
            <>
              <button
                type="button"
                onClick={() => queueUpscale('final')}
                className="type-caption text-emerald-300 hover:text-emerald-200"
              >
                Upscale (Final)
              </button>
              <button
                type="button"
                onClick={() => queueUpscale('max')}
                className="type-caption text-emerald-300 hover:text-emerald-200"
              >
                Upscale (Max)
              </button>
              <button
                type="button"
                onClick={queueRefine}
                className="type-caption text-violet-300 hover:text-violet-200"
              >
                Refine (low denoise)
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onRequeueStatus('Re-queueing from iteration tree…');
              void requeueComfyJobFromHistory(node.entry, {
                newSeed: true,
                onStatus: onRequeueStatus,
              }).then(result => {
                if (!result.ok) {
                  onRequeueStatus(result.error ?? 'Re-queue failed.');
                  toastQueueOutcome({ ok: false, text: result.error ?? 'Re-queue failed.' });
                  return;
                }
                if (result.held) {
                  const message = 'Max re-queue held until ComfyUI queue is idle';
                  onRequeueStatus(message);
                  toastHeldMax({ text: message });
                  return;
                }
                onRequeueStatus(
                  [
                    'queued from iteration tree',
                    result.promptId ? `prompt_id ${result.promptId}` : null,
                    'new variation · new seed',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                );
              });
            }}
            className="type-caption text-emerald-300 hover:text-emerald-200"
          >
            New variation (new seed)
          </button>
          {parentHistoryId && onDiffWithParent ? (
            <button
              type="button"
              onClick={() => onDiffWithParent(parentHistoryId)}
              className="type-caption text-amber-300 hover:text-amber-200"
            >
              Diff vs parent
            </button>
          ) : null}
          <a
            href={studioHistoryUrl(node.entry.id)}
            className="type-caption text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Open in history
          </a>
        </div>
      </ToolContentPanel>
      {node.children.map(child => (
        <IterationTreeNodeCard
          key={child.entry.id}
          node={child}
          depth={depth + 1}
          onRequeueStatus={onRequeueStatus}
          onDiffWithParent={onDiffWithParent}
        />
      ))}
    </div>
  );
}
