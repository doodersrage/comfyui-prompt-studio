"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import PromptMergePanel from "@/components/PromptMergePanel";
import SharedToolControls from "@/components/SharedToolControls";
import EnhancedPromptResult from "@/components/EnhancedPromptResult";
import PromptDiagnosticsPanel from "@/components/PromptDiagnosticsPanel";
import { useCachedSettings } from "@/hooks/useCachedSettings";
import { useAuth } from "@/hooks/useAuth";
import { usePromptResultActions } from "@/hooks/usePromptResultActions";
import {
  loadLocationBlocklist,
  saveLocationBlocklist,
  usePromptHistory,
  type PromptHistoryEntry,
} from "@/hooks/usePromptHistory";
import { DEFAULT_STUDIO_TOOL_CACHE } from "@/lib/settings-cache";
import {
  filterHistoryEntries,
  uniqueHistoryModels,
  uniqueHistoryTags,
  uniqueHistoryTools,
  type HistoryFilter,
} from "@/lib/history-filter";
import {
  buildShareableSceneParams,
  buildScenePresetShareUrl,
} from "@/lib/scene-preset-url";
import {
  buildPromptSidecar,
  downloadPromptSidecar,
} from "@/lib/prompt-sidecar";
import { requeueComfyJob, requeueComfyJobs } from "@/lib/comfyui-requeue";
import {
  applyScenePresetLocks,
  buildScenePresetFromCurrent,
  deleteScenePreset,
  loadScenePresets,
  upsertScenePreset,
  type ScenePreset,
} from "@/lib/scene-presets";
import {
  BUILTIN_PROMPT_TEMPLATES,
  applyPromptTemplate,
  getAllPromptTemplates,
} from "@/lib/prompt-templates";
import { buildRegenerateUrl } from "@/lib/regenerate-url";
import { buildUseAsHintsUrl } from "@/lib/use-as-hints-url";
import type { ComfyImageModel } from "@/lib/comfy-models";
import {
  applyCharacterIdentityBundle,
  buildCharacterIdentityBundle,
  downloadCharacterIdentityBundle,
  parseCharacterIdentityBundle,
} from "@/lib/character-identity-bundle";
import {
  runVisualModelCompare,
  type VisualCompareResult,
} from "@/lib/visual-model-compare";
import { diffPromptWords } from "@/lib/prompt-diff";
import {
  createUserTemplate,
  deleteUserTemplate,
  loadUserTemplates,
  templateFromPrompt,
  upsertUserTemplate,
  type UserPromptTemplate,
} from "@/lib/user-templates";
import {
  downloadHistoryExport,
  downloadStudioBackup,
  importStudioBackup,
  parseStudioBackupFile,
} from "@/lib/studio-backup";
import {
  downloadTextFile,
  exportHistoryCsv,
  exportHistoryJsonl,
} from "@/lib/history-export-formats";
import { sortCatalogByRatingBias } from "@/lib/catalog-rating-bias";
import {
  buildPromptIterationForest,
  type IterationTreeNode,
} from "@/lib/prompt-iteration-tree";
import {
  deletePromptProject,
  loadActiveProjectId,
  loadPromptProjects,
  setActiveProjectId,
  upsertPromptProject,
  type PromptProject,
} from "@/lib/prompt-projects";
import {
  buildPresetPack,
  downloadPresetPack,
  parsePresetPack,
} from "@/lib/preset-packs";
import {
  buildSceneStarterPack,
  downloadSceneStarterPack,
  parseSceneStarterPack,
} from "@/lib/scene-starter-packs";
import {
  buildUserSceneStarterFromHints,
  deleteUserSceneStarterPreset,
  loadUserSceneStarterPresets,
  toggleUserSceneStarterFavorite,
  upsertUserSceneStarterPreset,
  type UserSceneStarterPreset,
} from "@/lib/user-scene-starter-presets";
import {
  generateModelPortfolio,
  queueModelPortfolio,
  type ModelPortfolioItem,
} from "@/lib/model-portfolio";
import { studioHistoryUrl } from "@/lib/prompt-lineage";
import { startRefineFromHistoryEntry } from "@/lib/improve-output";
import { analyzeGalleryRatingTokens, negativeScoringTokens, positiveScoringTokens, buildSceneHintsFromPositiveTokens } from "@/lib/rating-token-analytics";
import { analyzePromptHistoryEntries } from "@/lib/user-analytics";
import { computeGalleryStats } from "@/lib/gallery-stats";
import { scopeLabel, USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";
import { loadComfyGallery, COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery";
import { addAvoidedToken, addAvoidedTokens } from "@/lib/avoided-tokens";
import { downloadIterationForestJson } from "@/lib/iteration-tree-export";
import {
  diffHistoryEntries,
  listIterationEntries,
} from "@/lib/iteration-branch-diff";
import { runPromptCampaign, type CampaignStepResult } from "@/lib/campaign-runner";
import {
  deleteCampaignTemplate,
  loadCampaignTemplates,
  upsertCampaignTemplate,
  type CampaignTemplate,
} from "@/lib/campaign-templates";
import { downloadPortfolioDiffReport } from "@/lib/portfolio-diff-report";
import {
  buildProjectBundle,
  exportProjectBundleJson,
  parseProjectBundle,
} from "@/lib/project-bundle";
import { importProjectBundle } from "@/lib/project-bundle-import";
import type { EnrichedToolGenerateResult } from "@/lib/specialized/types";
import {
  ToolBadge,
  ToolBlockGroup,
  ToolContentPanel,
  ToolLayout,
  ToolMetaPanel,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { ChipButton, FieldLabel, TextArea, TextInput } from "@/components/ui/Field";
import { Button, PrimaryButton } from "@/components/ui/Button";
import {
  DataList,
  DataListActions,
  DataListPrimary,
  DataListRow,
} from "@/components/ui/DataList";
import {
  CompareCardsSkeleton,
  DataListSkeleton,
  EmptyState,
  ErrorState,
  isLikelyErrorStatus,
  StudioTabSkeleton,
  SuccessBanner,
} from "@/components/ui/ViewState";

const ExperimentDashboardPanel = dynamic(
  () => import("@/components/ExperimentDashboardPanel"),
  { loading: () => <StudioTabSkeleton /> },
);

const ACCENT = "violet" as const;

type StudioTab =
  | "history"
  | "compare"
  | "catalog"
  | "templates"
  | "presets"
  | "diff"
  | "iteration"
  | "projects"
  | "portfolio"
  | "campaign"
  | "analytics"
  | "experiments";

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
  const { authEnabled, user } = useAuth();
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } =
    useCachedSettings("studio", DEFAULT_STUDIO_TOOL_CACHE);
  const {
    entries,
    toggleFavorite,
    setRating,
    addTag,
    removeEntry,
    clearHistory,
  } = usePromptHistory();

  const [tab, setTab] = useState<StudioTab>("history");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogClothing, setCatalogClothing] = useState<CatalogClothing[]>([]);
  const [catalogLocations, setCatalogLocations] = useState<CatalogLocation[]>([]);
  const [compareHints, setCompareHints] = useState(
    "two female gravel cyclists in a fierce competition",
  );
  const [compareA, setCompareA] = useState<EnrichedToolGenerateResult | null>(null);
  const [compareB, setCompareB] = useState<EnrichedToolGenerateResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [visualCompareLoading, setVisualCompareLoading] = useState(false);
  const [visualCompareStatus, setVisualCompareStatus] = useState<string | null>(null);
  const [visualA, setVisualA] = useState<VisualCompareResult | null>(null);
  const [visualB, setVisualB] = useState<VisualCompareResult | null>(null);
  const [identityBundleName, setIdentityBundleName] = useState("");
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>({});
  const [embeddingRankIds, setEmbeddingRankIds] = useState<string[] | null>(null);
  const [scenePresets, setScenePresets] = useState<ScenePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetHints, setPresetHints] = useState("");
  const [userTemplates, setUserTemplates] = useState<UserPromptTemplate[]>([]);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [diffLeftId, setDiffLeftId] = useState("");
  const [diffRightId, setDiffRightId] = useState("");
  const [copiedPresetShareId, setCopiedPresetShareId] = useState<string | null>(
    null,
  );
  const [highlightHistoryId, setHighlightHistoryId] = useState<string | null>(null);
  const [projects, setProjects] = useState<PromptProject[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | undefined>();
  const [projectName, setProjectName] = useState("");
  const [projectNotes, setProjectNotes] = useState("");
  const [presetPackName, setPresetPackName] = useState("");
  const [sceneStarterPackName, setSceneStarterPackName] = useState("");
  const [userSceneStarters, setUserSceneStarters] = useState<UserSceneStarterPreset[]>(
    [],
  );
  const [portfolioDraft, setPortfolioDraft] = useState("");
  const [portfolioModels, setPortfolioModels] = useState(
    "qwen-image-2512, flux-2-klein, sdxl-base-1.0",
  );
  const [portfolioItems, setPortfolioItems] = useState<ModelPortfolioItem[]>([]);
  const [portfolioStatus, setPortfolioStatus] = useState<string | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const [scopeRevision, setScopeRevision] = useState(0);
  const [campaignTarget, setCampaignTarget] = useState<"random-scene" | "topics">(
    "random-scene",
  );
  const [campaignCount, setCampaignCount] = useState(4);
  const [campaignGenre, setCampaignGenre] = useState("");
  const [campaignTopics, setCampaignTopics] = useState("");
  const [campaignQueue, setCampaignQueue] = useState(true);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  const [campaignResults, setCampaignResults] = useState<CampaignStepResult[]>([]);
  const [campaignTemplates, setCampaignTemplates] = useState<CampaignTemplate[]>([]);
  const [campaignTemplateName, setCampaignTemplateName] = useState("");
  const [iterationDiffLeftId, setIterationDiffLeftId] = useState("");
  const [iterationDiffRightId, setIterationDiffRightId] = useState("");

  const actions = usePromptResultActions({
    tool: "studio",
    model: shared.model,
    detail: shared.detail,
  });

  useEffect(() => {
    setCampaignTemplates(loadCampaignTemplates());
  }, []);

  useEffect(() => {
    const query = historyFilter.query?.trim();
    if (!historyFilter.semanticSearch || !query) {
      setEmbeddingRankIds(null);
      return;
    }

    const candidates = filterHistoryEntries(entries, {
      ...historyFilter,
      semanticSearch: false,
    });

    void fetch("/api/search/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        items: candidates.map((entry) => ({
          id: entry.id,
          text: [entry.prompt, entry.hints, entry.tool, entry.model, entry.tags?.join(" ")]
            .filter(Boolean)
            .join("\n"),
        })),
      }),
    })
      .then((response) => response.json())
      .then((data: { results?: Array<{ id: string }> }) => {
        setEmbeddingRankIds(data.results?.map((entry) => entry.id) ?? null);
      })
      .catch(() => setEmbeddingRankIds(null));
  }, [entries, historyFilter.query, historyFilter.semanticSearch, historyFilter.tool, historyFilter.model, historyFilter.tag, historyFilter.favoritesOnly, historyFilter.minRating]);

  const filteredEntries = useMemo(() => {
    const query = historyFilter.query?.trim();
    let base = filterHistoryEntries(entries, {
      ...historyFilter,
      semanticSearch: false,
    });

    if (query && historyFilter.semanticSearch) {
      if (embeddingRankIds?.length) {
        const allowed = new Set(embeddingRankIds);
        base = base.filter((entry) => allowed.has(entry.id));
        const order = new Map(embeddingRankIds.map((id, index) => [id, index]));
        base = [...base].sort(
          (left, right) => (order.get(left.id) ?? 9999) - (order.get(right.id) ?? 9999),
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
    return base.filter((entry) => entry.metadata?.projectId === activeProjectId);
  }, [entries, historyFilter, activeProjectId, embeddingRankIds]);

  const sortedCatalogClothing = useMemo(
    () => sortCatalogByRatingBias(catalogClothing, (entry) => `${entry.label} ${entry.category}`),
    [catalogClothing],
  );
  const sortedCatalogLocations = useMemo(
    () => sortCatalogByRatingBias(catalogLocations, (entry) => entry.label),
    [catalogLocations],
  );

  const iterationForest = useMemo(
    () => buildPromptIterationForest(entries),
    [entries],
  );
  const ratingTokenStats = useMemo(
    () => analyzeGalleryRatingTokens(loadComfyGallery()),
    [tab, galleryRevision, scopeRevision],
  );
  const historyAnalytics = useMemo(
    () => analyzePromptHistoryEntries(entries),
    [entries, scopeRevision],
  );
  const galleryAnalytics = useMemo(
    () => computeGalleryStats(loadComfyGallery()),
    [tab, galleryRevision, scopeRevision],
  );
  const iterationEntries = useMemo(() => listIterationEntries(entries), [entries]);
  const iterationDiff = useMemo(() => {
    const left = iterationEntries.find((entry) => entry.id === iterationDiffLeftId);
    const right = iterationEntries.find((entry) => entry.id === iterationDiffRightId);
    if (!left || !right) {
      return null;
    }
    return diffHistoryEntries(left, right);
  }, [iterationDiffLeftId, iterationDiffRightId, iterationEntries]);

  const favoriteEntries = useMemo(
    () => entries.filter((entry) => entry.favorite),
    [entries],
  );

  const template = useMemo(() => {
    return getAllPromptTemplates(userTemplates).find(
      (entry) => entry.id === (toolSettings.templateId ?? "duo-sport-race"),
    );
  }, [toolSettings.templateId, userTemplates]);

  const filledTemplate = useMemo(() => {
    if (!template) return "";
    return applyPromptTemplate(template.template, toolSettings.templateSlots ?? {});
  }, [template, toolSettings.templateSlots]);

  useEffect(() => {
    setBlocklist(loadLocationBlocklist());
    setScenePresets(loadScenePresets());
    setUserSceneStarters(loadUserSceneStarterPresets());
    setUserTemplates(loadUserTemplates());
    setProjects(loadPromptProjects());
    setActiveProjectIdState(loadActiveProjectId());
  }, []);

  useEffect(() => {
    const refreshAnalytics = () => setGalleryRevision((previous) => previous + 1);
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refreshAnalytics);
    return () =>
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, refreshAnalytics);
  }, []);

  useEffect(() => {
    const onScopeChanged = () => setScopeRevision((previous) => previous + 1);
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
    return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const historyId = new URLSearchParams(window.location.search).get("history");
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (
      tabParam === "experiments" ||
      tabParam === "analytics" ||
      tabParam === "diff" ||
      tabParam === "history" ||
      tabParam === "compare" ||
      tabParam === "catalog" ||
      tabParam === "templates" ||
      tabParam === "presets" ||
      tabParam === "iteration" ||
      tabParam === "projects" ||
      tabParam === "portfolio" ||
      tabParam === "campaign"
    ) {
      setTab(tabParam);
    }
    if (historyId) {
      setTab("history");
      setHighlightHistoryId(historyId);
    }
  }, []);

  const loadCatalog = useCallback(async (query: string) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const params = query.trim()
        ? `?q=${encodeURIComponent(query.trim())}`
        : "?limit=80";
      const response = await fetch(`/api/catalog${params}`);
      if (!response.ok) {
        throw new Error("Could not load catalog data.");
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
      setCatalogError(
        err instanceof Error ? err.message : "Could not load catalog data.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "catalog") {
      void loadCatalog(catalogQuery);
    }
  }, [tab, catalogQuery, loadCatalog]);

  const runCompare = useCallback(async () => {
    setCompareLoading(true);
    setCompareError(null);
    try {
      const payload = {
        hints: compareHints,
        portraitStyle: "action" as const,
        presetOptions: { headcount: "duo" as const },
      };

      const [responseA, responseB] = await Promise.all([
        fetch("/api/duo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, model: shared.model, detail: shared.detail }),
        }),
        fetch("/api/duo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            model: toolSettings.compareModelB ?? "flux-2-klein",
            detail: shared.detail,
          }),
        }),
      ]);

      if (!responseA.ok || !responseB.ok) {
        throw new Error("Model comparison failed. Check your settings and try again.");
      }

      setCompareA((await responseA.json()) as EnrichedToolGenerateResult);
      setCompareB((await responseB.json()) as EnrichedToolGenerateResult);
    } catch (err) {
      setCompareA(null);
      setCompareB(null);
      setCompareError(
        err instanceof Error ? err.message : "Model comparison failed.",
      );
    } finally {
      setCompareLoading(false);
    }
  }, [compareHints, shared, toolSettings.compareModelB]);

  const runVisualCompare = useCallback(async () => {
    if (!compareA?.prompt?.trim()) {
      setCompareError("Run text compare first to get a shared prompt.");
      return;
    }

    setVisualCompareLoading(true);
    setVisualCompareStatus("Queueing visual compare…");
    setVisualA(null);
    setVisualB(null);
    try {
      const result = await runVisualModelCompare({
        prompt: compareA.prompt,
        modelA: shared.model,
        modelB: (toolSettings.compareModelB ?? "flux-2-klein") as ComfyImageModel,
        hints: compareHints,
        onStatus: setVisualCompareStatus,
      });
      setVisualA(result.a);
      setVisualB(result.b);
      setVisualCompareStatus("Visual compare finished.");
    } catch (err) {
      setVisualCompareStatus(
        err instanceof Error ? err.message : "Visual compare failed.",
      );
    } finally {
      setVisualCompareLoading(false);
    }
  }, [compareA, compareHints, shared.model, toolSettings.compareModelB]);

  const toggleBlockLocation = useCallback((label: string) => {
    setBlocklist((previous) => {
      const next = previous.includes(label)
        ? previous.filter((entry) => entry !== label)
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
      importStudioBackup(parseStudioBackupFile(raw));
      setBlocklist(loadLocationBlocklist());
      setScenePresets(loadScenePresets());
      setUserTemplates(loadUserTemplates());
      setBackupStatus("Backup imported. Reload tabs to see restored settings.");
    } catch (err) {
      setBackupStatus(err instanceof Error ? err.message : "Import failed.");
    }
  }, []);

  const diffLeft = useMemo(
    () => entries.find((entry) => entry.id === diffLeftId) ?? null,
    [entries, diffLeftId],
  );
  const diffRight = useMemo(
    () => entries.find((entry) => entry.id === diffRightId) ?? null,
    [entries, diffRightId],
  );
  const promptDiff = useMemo(() => {
    if (!diffLeft || !diffRight) {
      return null;
    }
    return diffPromptWords(diffLeft.prompt, diffRight.prompt);
  }, [diffLeft, diffRight]);

  if (!mounted) {
    return (
      <ToolLayout
        accent={ACCENT}
        width="wide"
        badge={<ToolBadge accent={ACCENT}>Studio</ToolBadge>}
        title="Prompt Studio"
        description="History, model comparison, catalog browser, and template slots."
      >
        <StudioTabSkeleton />
      </ToolLayout>
    );
  }

  const tabs: { id: StudioTab; label: string }[] = [
    { id: "history", label: "History" },
    { id: "iteration", label: "Iteration tree" },
    { id: "projects", label: "Projects" },
    { id: "compare", label: "Compare" },
    { id: "portfolio", label: "Portfolio" },
    { id: "campaign", label: "Campaign" },
    { id: "analytics", label: "Analytics" },
    { id: "catalog", label: "Catalog" },
    { id: "templates", label: "Templates" },
    { id: "presets", label: "Presets" },
    { id: "experiments", label: "Experiments" },
    { id: "diff", label: "Diff" },
  ];

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Studio</ToolBadge>}
      title="Prompt Studio"
      description="History, model comparison, catalog browser, and template slots."
    >
      <ToolMetaPanel title="Studio views">
        <div className="flex flex-wrap gap-2">
          {tabs.map((entry) => (
            <ChipButton
              key={entry.id}
              active={tab === entry.id}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </ChipButton>
          ))}
        </div>
      </ToolMetaPanel>

      {tab === "history" && (
        <ToolSection title="Saved prompts">
          <ToolMetaPanel>
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <p className="type-heading shrink-0">
                {filteredEntries.length}
                {filteredEntries.length !== entries.length
                  ? ` of ${entries.length}`
                  : ""}{" "}
                entries
              </p>
              <div className="ui-list-actions w-full justify-start lg:w-auto lg:justify-end">
                {favoriteEntries.length > 0 && (
                  <Button
                    variant="accent-outline"
                    size="sm"
                    onClick={() =>
                      void actions.sendBatchComfyUi(
                        favoriteEntries.map((entry) => entry.prompt),
                      )
                    }
                  >
                    Queue favorites ({favoriteEntries.length})
                  </Button>
                )}
                {entries.length > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        downloadTextFile(
                          exportHistoryCsv(filteredEntries),
                          "history-filtered.csv",
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      Export CSV
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        downloadTextFile(
                          exportHistoryJsonl(filteredEntries),
                          "history-filtered.jsonl",
                          "application/jsonl;charset=utf-8",
                        )
                      }
                    >
                      Export JSONL
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadHistoryExport(filteredEntries)}
                    >
                      Export filtered
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadHistoryExport(entries)}
                    >
                      Export all
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearHistory}>
                      Clear all
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    downloadStudioBackup();
                    setBackupStatus("Studio backup downloaded.");
                  }}
                >
                  Export backup
                </Button>
                <label className="ui-btn-ghost ui-btn-sm ui-file-input-label cursor-pointer px-4">
                  Import backup
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleImportBackup(file);
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            {entries.length > 0 && (
              <div className="grid gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <FieldLabel htmlFor="history-search">Search</FieldLabel>
                  <input
                    id="history-search"
                    value={historyFilter.query ?? ""}
                    onChange={(event) =>
                      setHistoryFilter((previous) => ({
                        ...previous,
                        query: event.target.value || undefined,
                      }))
                    }
                    placeholder="prompt, hints, tool…"
                    className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="history-tool">Tool</FieldLabel>
                  <select
                    id="history-tool"
                    value={historyFilter.tool ?? "all"}
                    onChange={(event) =>
                      setHistoryFilter((previous) => ({
                        ...previous,
                        tool:
                          event.target.value === "all"
                            ? undefined
                            : event.target.value,
                      }))
                    }
                    className="ui-input px-3 py-[var(--input-padding-y)] type-body"
                  >
                    <option value="all">All tools</option>
                    {uniqueHistoryTools(entries).map((tool) => (
                      <option key={tool} value={tool}>
                        {tool}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="history-model">Model</FieldLabel>
                  <select
                    id="history-model"
                    value={historyFilter.model ?? "all"}
                    onChange={(event) =>
                      setHistoryFilter((previous) => ({
                        ...previous,
                        model:
                          event.target.value === "all"
                            ? undefined
                            : event.target.value,
                      }))
                    }
                    className="ui-input px-3 py-[var(--input-padding-y)] type-body"
                  >
                    <option value="all">All models</option>
                    {uniqueHistoryModels(entries).map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="history-tag">Tag</FieldLabel>
                  <select
                    id="history-tag"
                    value={historyFilter.tag ?? "all"}
                    onChange={(event) =>
                      setHistoryFilter((previous) => ({
                        ...previous,
                        tag:
                          event.target.value === "all"
                            ? undefined
                            : event.target.value,
                      }))
                    }
                    className="ui-input px-3 py-[var(--input-padding-y)] type-body"
                  >
                    <option value="all">All tags</option>
                    {uniqueHistoryTags(entries).map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-3 self-end pb-1 type-body">
                  <input
                    type="checkbox"
                    checked={historyFilter.semanticSearch === true}
                    onChange={(event) =>
                      setHistoryFilter((previous) => ({
                        ...previous,
                        semanticSearch: event.target.checked || undefined,
                      }))
                    }
                    className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass()}`}
                  />
                  Semantic search
                </label>
                {projects.length > 0 && (
                  <div className="space-y-2">
                    <FieldLabel htmlFor="history-project">Project</FieldLabel>
                    <select
                      id="history-project"
                      value={activeProjectId ?? "all"}
                      onChange={(event) => {
                        const value =
                          event.target.value === "all" ? undefined : event.target.value;
                        setActiveProjectIdState(value);
                        setActiveProjectId(value);
                      }}
                      className="ui-input px-3 py-[var(--input-padding-y)] type-body"
                    >
                      <option value="all">All projects</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-3 self-end pb-1 type-body">
                  <input
                    type="checkbox"
                    checked={historyFilter.favoritesOnly === true}
                    onChange={(event) =>
                      setHistoryFilter((previous) => ({
                        ...previous,
                        favoritesOnly: event.target.checked || undefined,
                      }))
                    }
                    className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass()}`}
                  />
                  Favorites only
                </label>
                <div className="space-y-2">
                  <FieldLabel htmlFor="history-rating">Min rating</FieldLabel>
                  <select
                    id="history-rating"
                    value={historyFilter.minRating ?? 0}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setHistoryFilter((previous) => ({
                        ...previous,
                        minRating: value > 0 ? value : undefined,
                      }));
                    }}
                    className="ui-input px-3 py-[var(--input-padding-y)] type-body"
                  >
                    <option value={0}>Any</option>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}+ stars
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </ToolMetaPanel>

          {backupStatus &&
            (isLikelyErrorStatus(backupStatus) ? (
              <ErrorState
                compact
                title="Action failed"
                description={backupStatus}
                action={{
                  label: "Dismiss",
                  onClick: () => setBackupStatus(null),
                }}
              />
            ) : (
              <SuccessBanner message={backupStatus} />
            ))}
          {actions.comfyUiStatus && (
            <p className="type-caption text-[var(--accent-text)]">
              {actions.comfyUiStatus}
            </p>
          )}

          {entries.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="No saved prompts yet"
              description="Generate a scene in Character or another tool, then use Save to history on the result panel. Your prompts will appear here for re-queue, export, and diff."
              action={{ label: "Open Character", href: "/character" }}
            />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matches for these filters"
              description="Try a broader search term or remove tool, model, tag, or rating filters to see more history entries."
              action={{
                label: "Clear filters",
                onClick: () => setHistoryFilter({}),
              }}
            />
          ) : (
            <ToolBlockGroup className="mt-[var(--block-gap)]">
              {filteredEntries.map((entry) => (
                <HistoryCard
                  key={entry.id}
                  entry={entry}
                  highlighted={highlightHistoryId === entry.id}
                  onCopy={() => copyText(entry.prompt)}
                  onToggleFavorite={() => toggleFavorite(entry.id)}
                  onRate={(rating) => setRating(entry.id, rating)}
                  onAddTag={(tag) => addTag(entry.id, tag)}
                  onExportSidecar={() => {
                    downloadPromptSidecar(
                      buildPromptSidecar({
                        positive: entry.prompt,
                        model: entry.model,
                        hints: entry.hints,
                        tool: entry.tool,
                        diagnostics: entry.diagnostics,
                        metadata: entry.metadata,
                      }),
                      `${entry.tool}-history`,
                    );
                  }}
                  onRemove={() => removeEntry(entry.id)}
                  onDiffLeft={() => {
                    setDiffLeftId(entry.id);
                    setTab("diff");
                  }}
                  onDiffRight={() => {
                    setDiffRightId(entry.id);
                    setTab("diff");
                  }}
                  onSaveTemplate={() => {
                    const name = window.prompt("Template name", `${entry.tool} prompt`);
                    if (!name?.trim()) {
                      return;
                    }
                    const created = templateFromPrompt(name.trim(), entry.prompt);
                    upsertUserTemplate(created);
                    setUserTemplates(loadUserTemplates());
                    setBackupStatus(`Saved template “${created.label}”.`);
                  }}
                  onRequeue={(newSeed) => {
                    setBackupStatus("Re-queueing from history…");
                    void requeueComfyJob({
                      prompt: entry.prompt,
                      tool: entry.tool,
                      model: entry.model,
                      hints: entry.hints,
                      newSeed,
                      onStatus: setBackupStatus,
                    }).then((result) => {
                      if (!result.ok) {
                        setBackupStatus(result.error ?? "Re-queue failed.");
                        return;
                      }
                      setBackupStatus(
                        [
                          "queued from history",
                          result.promptId ? `prompt_id ${result.promptId}` : null,
                          newSeed ? "new seed" : "same params",
                        ]
                          .filter(Boolean)
                          .join(" · "),
                      );
                    });
                  }}
                  onRequeueBatch={() => {
                    const batchPrompts = readHistoryBatchPrompts(entry);
                    if (batchPrompts.length === 0) {
                      return;
                    }
                    setBackupStatus(`Re-queueing batch (${batchPrompts.length})…`);
                    void requeueComfyJobs(
                      batchPrompts.map((prompt) => ({
                        prompt,
                        tool: entry.tool,
                        model: entry.model,
                        hints: entry.hints,
                        newSeed: true,
                      })),
                      setBackupStatus,
                    ).then(({ queued, failed }) => {
                      setBackupStatus(
                        `Batch re-queue finished · ${queued} queued · ${failed} failed`,
                      );
                    });
                  }}
                  batchPromptCount={readHistoryBatchPrompts(entry).length}
                />
              ))}
            </ToolBlockGroup>
          )}
        </ToolSection>
      )}

      {tab === "iteration" && (
        <ToolSection title="Prompt iteration tree">
          <p className="text-sm text-zinc-400">
            Branches built from saved history entries linked by parent history ids.
          </p>
          {iterationEntries.length >= 2 ? (
            <ToolMetaPanel title="Branch diff" className="mb-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-zinc-400">
                  Left (older)
                  <select
                    value={iterationDiffLeftId}
                    onChange={(event) => setIterationDiffLeftId(event.target.value)}
                    className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
                  >
                    <option value="">Select entry…</option>
                    {iterationEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.tool} · {entry.prompt.slice(0, 48)}…
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-zinc-400">
                  Right (newer)
                  <select
                    value={iterationDiffRightId}
                    onChange={(event) => setIterationDiffRightId(event.target.value)}
                    className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
                  >
                    <option value="">Select entry…</option>
                    {iterationEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.tool} · {entry.prompt.slice(0, 48)}…
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {iterationDiff ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="type-caption text-zinc-500">
                    {iterationDiff.diff.beforeChars} → {iterationDiff.diff.afterChars} chars
                    {iterationDiff.diff.changed ? "" : " · identical"}
                  </p>
                  <p className="whitespace-pre-wrap">
                    {iterationDiff.diff.segments.map((segment, index) => (
                      <span
                        key={`${segment.type}-${index}`}
                        className={
                          segment.type === "add"
                            ? "text-emerald-300"
                            : segment.type === "remove"
                              ? "text-rose-300 line-through"
                              : "text-zinc-300"
                        }
                      >
                        {segment.text}{" "}
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
                setBackupStatus("Exported iteration tree JSON.");
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
              {iterationForest.map((node) => (
                <IterationTreeNodeCard
                  key={node.entry.id}
                  node={node}
                  depth={0}
                  onRequeueStatus={setBackupStatus}
                  onDiffWithParent={(parentId) => {
                    setIterationDiffLeftId(parentId);
                    setIterationDiffRightId(node.entry.id);
                  }}
                />
              ))}
            </ToolBlockGroup>
          )}
        </ToolSection>
      )}

      {tab === "campaign" && (
        <ToolSection title="Prompt campaign runner">
          <p className="text-sm text-zinc-400">
            Generate a series of prompts (random scenes or topic list) and optionally queue
            each to ComfyUI under the active project.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-zinc-400">
              Source
              <select
                value={campaignTarget}
                onChange={(event) =>
                  setCampaignTarget(event.target.value as "random-scene" | "topics")
                }
                className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="random-scene">Random scenes</option>
                <option value="topics">Topics batch</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-zinc-400">
              Count
              <input
                type="number"
                min={1}
                max={12}
                value={campaignCount}
                onChange={(event) =>
                  setCampaignCount(Number(event.target.value) || 4)
                }
                className="ui-input block w-full px-3 py-[var(--input-padding-y)] type-body"
              />
            </label>
          </div>
          {campaignTarget === "random-scene" ? (
            <FieldLabel htmlFor="campaign-genre">Genre/theme hint (optional)</FieldLabel>
          ) : (
            <FieldLabel htmlFor="campaign-topics">Topics (one per line)</FieldLabel>
          )}
          {campaignTarget === "random-scene" ? (
            <input
              id="campaign-genre"
              value={campaignGenre}
              onChange={(event) => setCampaignGenre(event.target.value)}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          ) : (
            <TextArea
              id="campaign-topics"
              rows={4}
              value={campaignTopics}
              onChange={(event) => setCampaignTopics(event.target.value)}
              placeholder="sunset gravel race&#10;rainy alley portrait"
              className={accentFocusClass(ACCENT)}
            />
          )}
          <label className="flex items-center gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={campaignQueue}
              onChange={(event) => setCampaignQueue(event.target.checked)}
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
                campaignTarget === "topics" &&
                campaignTopics
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean).length === 0
              }
              onClick={() => {
                void (async () => {
                  setCampaignLoading(true);
                  setCampaignStatus("Running campaign…");
                  try {
                    const topics =
                      campaignTarget === "topics"
                        ? campaignTopics
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean)
                        : undefined;
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
                    const queued = results.filter((step) => step.queued).length;
                    setCampaignStatus(
                      `Campaign finished · ${queued}/${results.length} queued · ${results.filter((step) => step.error).length} errors`,
                    );
                    setGalleryRevision((previous) => previous + 1);
                  } catch (err) {
                    setCampaignStatus(
                      err instanceof Error ? err.message : "Campaign failed.",
                    );
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
              {campaignResults.map((step) => (
                <ToolContentPanel key={step.index} className="ui-block-group">
                  <p className="type-caption text-zinc-500">
                    Step {step.index + 1}
                    {step.queued ? " · queued" : ""}
                    {step.promptId ? ` · ${step.promptId}` : ""}
                    {step.error ? ` · ${step.error}` : ""}
                  </p>
                  {step.prompt ? (
                    <pre className="type-code max-h-32 overflow-auto whitespace-pre-wrap text-zinc-300">
                      {step.prompt}
                    </pre>
                  ) : null}
                </ToolContentPanel>
              ))}
            </ToolBlockGroup>
          ) : null}

          <div className="ui-surface-inset mt-6 space-y-3">
            <p className="text-sm font-medium text-zinc-200">Campaign templates</p>
            <p className="text-xs text-zinc-500">
              Save the current campaign settings as a reusable recipe.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={campaignTemplateName}
                onChange={(event) => setCampaignTemplateName(event.target.value)}
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
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                    queueToComfyUi: campaignQueue,
                  });
                  setCampaignTemplates(loadCampaignTemplates());
                  setCampaignTemplateName("");
                  setBackupStatus("Saved campaign template.");
                }}
              >
                Save template
              </Button>
            </div>
            {campaignTemplates.length > 0 ? (
              <ul className="space-y-2">
                {campaignTemplates.map((template) => (
                  <li
                    key={template.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="text-zinc-200">{template.name}</p>
                      <p className="text-xs text-zinc-500">
                        {template.target} · {template.count} prompts
                        {template.queueToComfyUi ? " · auto-queue" : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm" className="type-caption"
                        onClick={() => {
                          setCampaignTarget(template.target);
                          setCampaignCount(template.count);
                          setCampaignGenre(template.genre ?? "");
                          setCampaignTopics((template.topics ?? []).join("\n"));
                          setCampaignQueue(template.queueToComfyUi);
                          setBackupStatus(`Loaded template “${template.name}”.`);
                        }}
                      >
                        Load
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm" className="type-caption"
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
              <p className="text-xs text-zinc-500">No saved templates yet.</p>
            )}
          </div>
        </ToolSection>
      )}

      {tab === "analytics" && (
        <>
          <ToolSection title="Your activity">
            <p className="text-sm text-zinc-400">
              {authEnabled
                ? `Scoped to ${user?.username ?? scopeLabel()}. History and gallery stats reflect only this account’s browser data.`
                : "Shared browser session — enable login to scope history and analytics per user."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "History", value: historyAnalytics.total },
                {
                  label: "History rated",
                  value: historyAnalytics.rated,
                },
                {
                  label: "History favorites",
                  value: historyAnalytics.favorites,
                },
                {
                  label: "Avg history rating",
                  value:
                    historyAnalytics.avgRating != null
                      ? `${historyAnalytics.avgRating}★`
                      : "—",
                },
                { label: "Gallery", value: galleryAnalytics.total },
                {
                  label: "Gallery rated",
                  value: Math.max(0, galleryAnalytics.completed - galleryAnalytics.unreviewed),
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-zinc-700/80 bg-zinc-900/50 px-3 py-2"
                >
                  <p className="type-caption text-zinc-500">{stat.label}</p>
                  <p className="type-heading tabular-nums text-zinc-200">{stat.value}</p>
                </div>
              ))}
            </div>
            {historyAnalytics.byTool.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {historyAnalytics.byTool.map((entry) => (
                  <span
                    key={entry.tool}
                    className="rounded-full border border-zinc-700/80 bg-zinc-950/40 px-3 py-1 text-xs text-zinc-300"
                  >
                    {entry.tool} · {entry.count}
                  </span>
                ))}
              </div>
            ) : null}
          </ToolSection>

          <ToolSection title="Gallery rating analytics">
          <p className="text-sm text-zinc-400">
            Tokens that correlate with high (4–5★) or low (1–2★) gallery ratings. Rate
            outputs in Gallery review mode to grow this list.
          </p>
          {ratingTokenStats.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const added = addAvoidedTokens(negativeScoringTokens(ratingTokenStats));
                  setBackupStatus(
                    added > 0
                      ? `Added ${added} negative-scoring token(s) to avoided list.`
                      : "No new negative-scoring tokens to add.",
                  );
                }}
              >
                Add negative tokens to avoidance
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const tokens = positiveScoringTokens(ratingTokenStats);
                  if (tokens.length === 0) {
                    setBackupStatus("No positive-scoring tokens to promote yet.");
                    return;
                  }
                  const hints = buildSceneHintsFromPositiveTokens(tokens);
                  const preset = buildUserSceneStarterFromHints({
                    label: `Gallery tokens (${tokens.slice(0, 3).join(", ")})`,
                    hints,
                    category: "lifestyle",
                    source: "promoted",
                  });
                  upsertUserSceneStarterPreset(preset);
                  setUserSceneStarters(loadUserSceneStarterPresets());
                  setBackupStatus(
                    `Saved scene starter preset from ${tokens.length} high-scoring token(s).`,
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
                {ratingTokenStats.map((stat) => (
                  <ToolContentPanel key={stat.token} className="ui-block-group">
                    <p className="type-title">{stat.token}</p>
                    <p className="type-caption text-zinc-500">
                      score {stat.score > 0 ? "+" : ""}
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
                            category: "lifestyle",
                            source: "promoted",
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
        </>
      )}

      {tab === "projects" && (
        <ToolSection title="Prompt projects">
          <p className="text-sm text-zinc-400">
            Group history and gallery jobs under named campaigns. Set an active project to
            filter Studio history.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Project name"
              className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
            <input
              value={projectNotes}
              onChange={(event) => setProjectNotes(event.target.value)}
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
              setProjectName("");
              setProjectNotes("");
              setBackupStatus(`Created project “${project.name}”.`);
            }}
          >
            Create project
          </PrimaryButton>
          <ToolBlockGroup className="mt-[var(--block-gap)]">
            {projects.map((project) => (
              <ToolContentPanel key={project.id} className="ui-block-group">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="type-heading">{project.name}</p>
                    {project.notes ? (
                      <p className="type-caption text-zinc-500">{project.notes}</p>
                    ) : null}
                  </div>
                  <div className="ui-list-actions">
                    <Button
                      variant="ghost"
                      size="sm" className="type-caption"
                      onClick={() => {
                        setActiveProjectIdState(project.id);
                        setActiveProjectId(project.id);
                        setTab("history");
                      }}
                    >
                      {activeProjectId === project.id ? "Active" : "Set active"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm" className="type-caption"
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
                      size="sm" className="type-caption"
                      onClick={() => {
                        const bundle = buildProjectBundle({
                          project,
                          history: entries,
                          gallery: loadComfyGallery(),
                          scenePresets: loadScenePresets(),
                        });
                        downloadTextFile(
                          exportProjectBundleJson(bundle),
                          `${project.name.replace(/\s+/g, "-").toLowerCase()}-bundle.json`,
                          "application/json",
                        );
                        setBackupStatus(`Exported bundle for “${project.name}”.`);
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
            <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">
              Import project bundle
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void file.text().then((raw) => {
                    try {
                      const bundle = parseProjectBundle(raw);
                      const result = importProjectBundle(bundle);
                      setProjects(loadPromptProjects());
                      setActiveProjectIdState(bundle.project.id);
                      setActiveProjectId(bundle.project.id);
                      setGalleryRevision((previous) => previous + 1);
                      setBackupStatus(
                        `Imported “${bundle.project.name}” · +${result.historyAdded} history · +${result.galleryAdded} gallery`,
                      );
                    } catch (err) {
                      setBackupStatus(
                        err instanceof Error ? err.message : "Import failed.",
                      );
                    }
                    event.target.value = "";
                  });
                }}
              />
            </label>
          </div>
        </ToolSection>
      )}

      {tab === "compare" && (
        <ToolSection>
          <SharedToolControls
            shared={shared}
            onModelChange={(model) => updateShared({ model })}
            onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
          <FieldLabel>Model A</FieldLabel>
              <p className="text-xs text-zinc-500">{shared.model}</p>
            </div>
            <div className="space-y-2">
              <FieldLabel>Model B</FieldLabel>
              <TextInput
                value={toolSettings.compareModelB ?? "flux-2-klein"}
                onChange={(event) =>
                  updateToolSettings({ compareModelB: event.target.value })
                }
              />
            </div>
          </div>

          <TextArea
            rows={3}
            value={compareHints}
            onChange={(event) => setCompareHints(event.target.value)}
            className={accentFocusClass(ACCENT)}
          />

          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            onClick={runCompare}
            loading={compareLoading}
            loadingLabel="Comparing models"
          >
            Compare models
          </PrimaryButton>

          <Button
            variant="secondary"
            loading={visualCompareLoading}
            loadingLabel="Rendering compare"
            disabled={!compareA?.prompt}
            onClick={() => void runVisualCompare()}
          >
            Visual compare (ComfyUI)
          </Button>
          {visualCompareStatus ? (
            <p className="text-xs text-violet-300/90">{visualCompareStatus}</p>
          ) : null}

          {compareError && (
            <ErrorState
              compact
              title="Comparison failed"
              description={compareError}
              action={{
                label: "Try again",
                onClick: () => void runCompare(),
              }}
            />
          )}

          {compareLoading ? (
            <CompareCardsSkeleton />
          ) : compareA || compareB ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {compareA && (
              <CompareCard title={`Model A · ${shared.model}`} result={compareA} />
            )}
            {compareB && (
              <CompareCard
                title={`Model B · ${toolSettings.compareModelB}`}
                result={compareB}
              />
            )}
          </div>
          ) : (
            <EmptyState
              icon="compare"
              title="Run a side-by-side comparison"
              description="Enter shared hints above, choose Model B, then compare how each architecture writes the same duo scene."
              action={{
                label: "Compare models",
                onClick: () => void runCompare(),
              }}
            />
          )}

          {(visualA?.previewUrl || visualB?.previewUrl) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {visualA?.previewUrl ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Visual · {visualA.model}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={visualA.previewUrl}
                    alt={`Visual compare ${visualA.model}`}
                    className="w-full rounded-xl border border-zinc-800"
                  />
                </div>
              ) : null}
              {visualB?.previewUrl ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Visual · {visualB.model}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={visualB.previewUrl}
                    alt={`Visual compare ${visualB.model}`}
                    className="w-full rounded-xl border border-zinc-800"
                  />
                </div>
              ) : null}
            </div>
          )}
        </ToolSection>
      )}

      {tab === "portfolio" && (
        <ToolSection title="Multi-model portfolio">
          <p className="text-sm text-zinc-400">
            Format one draft for several models, then queue each variant to ComfyUI.
          </p>
          <TextArea
            rows={4}
            value={portfolioDraft}
            onChange={(event) => setPortfolioDraft(event.target.value)}
            placeholder="Shared scene draft to adapt per model…"
            className={accentFocusClass(ACCENT)}
          />
          <FieldLabel hint="Comma-separated model ids">Models</FieldLabel>
          <input
            value={portfolioModels}
            onChange={(event) => setPortfolioModels(event.target.value)}
            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              accentClassName={accentButtonClass(ACCENT)}
              loading={portfolioLoading}
              loadingLabel="Formatting portfolio"
              disabled={!portfolioDraft.trim()}
              onClick={() => {
                void (async () => {
                  setPortfolioLoading(true);
                  setPortfolioStatus("Formatting…");
                  try {
                    const models = portfolioModels
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean) as ComfyImageModel[];
                    const items = await generateModelPortfolio({
                      draft: portfolioDraft,
                      models,
                      detail: shared.detail,
                    });
                    setPortfolioItems(items);
                    setPortfolioStatus(`Formatted ${items.filter((item) => item.prompt).length}/${models.length} prompts.`);
                  } catch (err) {
                    setPortfolioStatus(err instanceof Error ? err.message : "Portfolio failed.");
                  } finally {
                    setPortfolioLoading(false);
                  }
                })();
              }}
            >
              Generate portfolio
            </PrimaryButton>
            <Button
              variant="secondary"
              disabled={portfolioItems.every((item) => !item.prompt.trim())}
              onClick={() => {
                void queueModelPortfolio({
                  items: portfolioItems,
                  hints: portfolioDraft,
                  tool: "portfolio",
                }).then((queued) => setPortfolioStatus(`Queued ${queued} jobs.`));
              }}
            >
              Queue all to ComfyUI
            </Button>
            <Button
              variant="ghost"
              disabled={portfolioItems.length === 0}
              onClick={() => {
                downloadPortfolioDiffReport(portfolioItems, portfolioDraft, "markdown");
                setPortfolioStatus("Downloaded portfolio diff (Markdown).");
              }}
            >
              Export diff (MD)
            </Button>
            <Button
              variant="ghost"
              disabled={portfolioItems.length === 0}
              onClick={() => {
                downloadPortfolioDiffReport(portfolioItems, portfolioDraft, "html");
                setPortfolioStatus("Downloaded portfolio diff (HTML).");
              }}
            >
              Export diff (HTML)
            </Button>
          </div>
          {portfolioStatus ? (
            <p className="type-caption text-[var(--accent-text)]">{portfolioStatus}</p>
          ) : null}
          {portfolioItems.length > 0 ? (
            <ToolBlockGroup className="mt-[var(--block-gap)]">
              {portfolioItems.map((item) => (
                <ToolContentPanel key={item.model} className="ui-block-group">
                  <p className="type-caption text-zinc-500">{item.model}</p>
                  {item.error ? (
                    <p className="text-sm text-rose-300">{item.error}</p>
                  ) : (
                    <pre className="type-code max-h-40 overflow-auto whitespace-pre-wrap text-zinc-300">
                      {item.prompt}
                    </pre>
                  )}
                </ToolContentPanel>
              ))}
            </ToolBlockGroup>
          ) : null}
        </ToolSection>
      )}

      {tab === "catalog" && (
        <ToolSection title="Catalog browser">
          <input
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
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
                    label: "Retry",
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
                      ? "Nothing matched your search. Try a shorter query or clear the filter."
                      : "The catalog returned no wardrobe entries."
                  }
                  action={
                    catalogQuery.trim()
                      ? {
                          label: "Clear search",
                          onClick: () => setCatalogQuery(""),
                        }
                      : {
                          label: "Reload catalog",
                          onClick: () => void loadCatalog(""),
                        }
                  }
                />
              ) : (
              <DataList>
                {sortedCatalogClothing.map((entry) => (
                  <DataListRow key={entry.id}>
                    <DataListPrimary
                      title={entry.label}
                      subtitle={entry.category}
                    />
                    <DataListActions>
                      <Button
                        variant="ghost"
                        size="sm" className="type-caption"
                        onClick={() => {
                          setPresetHints((previous) =>
                            previous.trim()
                              ? `${previous.trim()}, ${entry.label}`
                              : entry.label,
                          );
                          setBackupStatus(`Added “${entry.label}” to preset hints.`);
                        }}
                      >
                        Insert
                      </Button>
                      <Button
                        variant={
                          shared.lockedWardrobeId === entry.id
                            ? "info"
                            : "ghost"
                        }
                        size="sm" className="type-caption"
                        onClick={() => updateShared({ lockedWardrobeId: entry.id })}
                      >
                        {shared.lockedWardrobeId === entry.id ? "Locked" : "Lock kit"}
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
                      ? "Nothing matched your search. Try a different keyword or clear the filter."
                      : "The catalog returned no location entries."
                  }
                  action={
                    catalogQuery.trim()
                      ? {
                          label: "Clear search",
                          onClick: () => setCatalogQuery(""),
                        }
                      : {
                          label: "Reload catalog",
                          onClick: () => void loadCatalog(""),
                        }
                  }
                />
              ) : (
              <DataList>
                {sortedCatalogLocations.map((entry) => {
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
                              ? "text-[var(--tint-danger-text)]"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {entry.label}
                          {blocked ? " · blocked" : ""}
                        </p>
                      </button>
                      <DataListActions>
                        <Button
                          variant="ghost"
                          size="sm" className="type-caption"
                          onClick={() => {
                            setPresetHints((previous) =>
                              previous.trim()
                                ? `${previous.trim()}, location: ${entry.label}`
                                : `location: ${entry.label}`,
                            );
                            setBackupStatus(`Added location “${entry.label}”.`);
                          }}
                        >
                          Insert
                        </Button>
                        <Button
                          variant={locked ? "secondary" : "ghost"}
                          size="sm" className="type-caption"
                          onClick={() =>
                            updateShared({
                              lockedLocation: locked ? undefined : entry.label,
                            })
                          }
                        >
                          {locked ? "Locked" : "Lock location"}
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

      {tab === "templates" && (
        <ToolSection>
          <div className="space-y-2">
            <FieldLabel htmlFor="studio-template-select">Template</FieldLabel>
            <select
              id="studio-template-select"
              value={toolSettings.templateId ?? "duo-sport-race"}
              onChange={(event) =>
                updateToolSettings({ templateId: event.target.value })
              }
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            >
              <optgroup label="Built-in">
                {BUILTIN_PROMPT_TEMPLATES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
              {userTemplates.length > 0 && (
                <optgroup label="Custom">
                  {userTemplates.map((entry) => (
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
                label: "Use default template",
                onClick: () => updateToolSettings({ templateId: "duo-sport-race" }),
              }}
            />
          ) : (
            <>
          <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
            <input
              id="studio-custom-template-name"
              value={customTemplateName}
              onChange={(event) => setCustomTemplateName(event.target.value)}
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
                setCustomTemplateName("");
                setBackupStatus(`Saved custom template “${created.label}”.`);
              }}
            >
              Save preview as custom template
            </PrimaryButton>
          </div>

          {userTemplates.some((entry) => entry.id === template.id) && (
            <Button
              variant="danger"
              size="sm" className="type-caption"
              onClick={() => {
                deleteUserTemplate(template.id);
                setUserTemplates(loadUserTemplates());
                updateToolSettings({ templateId: "duo-sport-race" });
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

          {Array.from(
            template.template.matchAll(/\{\{(\w+)\}\}/g),
            (match) => match[1]!,
          ).length === 0 ? (
            <EmptyState
              compact
              icon="template"
              title="No template slots"
              description="This template has no {{slot}} placeholders. Edit the template text or pick another template to fill variables."
              action={{
                label: "Browse built-ins",
                onClick: () =>
                  document.getElementById("studio-template-select")?.focus(),
              }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from(
                template.template.matchAll(/\{\{(\w+)\}\}/g),
                (match) => match[1]!,
              ).map((slot) => (
                <div key={slot} className="space-y-2">
                  <FieldLabel htmlFor={`studio-template-slot-${slot}`}>
                    {slot}
                  </FieldLabel>
                  <input
                    id={`studio-template-slot-${slot}`}
                    value={toolSettings.templateSlots?.[slot] ?? ""}
                    onChange={(event) =>
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

      {tab === "presets" && (
        <ToolSection>
          <p className="text-sm text-zinc-400">
            Save named bundles of hints and shared locks (kit, location, seed) for
            quick reuse across Generate, Character, and Background.
          </p>

          <SharedToolControls
            shared={shared}
            onModelChange={(model) => updateShared({ model })}
            onDetailChange={(detail) => updateShared({ detail })}
          onWorkflowPresetChange={(id) => updateShared({ selectedWorkflowFileId: id })}
            lockedWardrobeId={shared.lockedWardrobeId}
            lockedLocation={shared.lockedLocation}
            lockedVariationSeed={shared.lockedVariationSeed}
            onClearLockedWardrobe={() =>
              updateShared({ lockedWardrobeId: undefined })
            }
            onClearLockedLocation={() =>
              updateShared({ lockedLocation: undefined })
            }
            onClearLockedVariationSeed={() =>
              updateShared({ lockedVariationSeed: undefined })
            }
          />

          <div className="grid gap-3 border-t border-zinc-800 pt-4 sm:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel htmlFor="studio-preset-name">Preset name</FieldLabel>
              <input
                id="studio-preset-name"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Gravel duo night race"
                className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              />
            </div>
            <div className="space-y-1">
              <FieldLabel htmlFor="studio-preset-hints">Hints (optional)</FieldLabel>
              <input
                id="studio-preset-hints"
                value={presetHints}
                onChange={(event) => setPresetHints(event.target.value)}
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
                tool: "studio",
                shared,
              });
              upsertScenePreset(preset);
              setScenePresets(loadScenePresets());
              setPresetName("");
              setBackupStatus(`Saved preset “${preset.name}”.`);
            }}
          >
            Save current locks as preset
          </PrimaryButton>

          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <p className="text-sm font-medium text-zinc-200">Preset packs</p>
            <p className="text-xs text-zinc-500">
              Export or import bundles of scene presets for sharing across machines.
            </p>
            <input
              value={presetPackName}
              onChange={(event) => setPresetPackName(event.target.value)}
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
                    }),
                  )
                }
              >
                Export pack
              </Button>
              <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">
                Import pack
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    void file
                      .text()
                      .then((raw) => {
                        const pack = parsePresetPack(raw);
                        for (const preset of pack.presets) {
                          upsertScenePreset(preset);
                        }
                        setScenePresets(loadScenePresets());
                        setBackupStatus(`Imported preset pack “${pack.name}”.`);
                      })
                      .catch((err) => {
                        setBackupStatus(
                          err instanceof Error ? err.message : "Import failed.",
                        );
                      });
                  }}
                />
              </label>
            </div>
          </div>

          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <p className="text-sm font-medium text-zinc-200">Scene starter presets</p>
            <p className="text-xs text-zinc-500">
              Saved from Generate/Character preset panels or promoted from Gallery analytics.
              These appear in the preset catalog on Generate and Character.
            </p>
            <input
              value={sceneStarterPackName}
              onChange={(event) => setSceneStarterPackName(event.target.value)}
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
                    }),
                  )
                }
              >
                Export starter pack
              </Button>
              <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">
                Import starter pack
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    void file
                      .text()
                      .then((raw) => {
                        const pack = parseSceneStarterPack(raw);
                        for (const preset of pack.presets) {
                          upsertUserSceneStarterPreset(preset);
                        }
                        setUserSceneStarters(loadUserSceneStarterPresets());
                        setBackupStatus(`Imported scene starter pack “${pack.name}”.`);
                      })
                      .catch((err) => {
                        setBackupStatus(
                          err instanceof Error ? err.message : "Import failed.",
                        );
                      });
                  }}
                />
              </label>
            </div>
            {userSceneStarters.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No saved scene starters yet — save from Generate/Character or promote tokens in
                Analytics.
              </p>
            ) : (
              <DataList scrollable={false}>
                {userSceneStarters.map((preset) => (
                  <DataListRow key={preset.id} className="!items-start !py-4">
                    <DataListPrimary
                      title={
                        <>
                          {preset.favorite ? "★ " : null}
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
                        {preset.favorite ? "Unfavorite" : "Favorite"}
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

          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <p className="text-sm font-medium text-zinc-200">Character identity bundles</p>
            <p className="text-xs text-zinc-500">
              Export/import reusable character sheets with locks, hints, and negative profile ids.
            </p>
            <input
              value={identityBundleName}
              onChange={(event) => setIdentityBundleName(event.target.value)}
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
                    }),
                  )
                }
              >
                Export bundle
              </Button>
              <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">
                Import bundle
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    void file.text().then((raw) => {
                      const bundle = parseCharacterIdentityBundle(raw);
                      const patch = applyCharacterIdentityBundle(bundle);
                      updateShared({
                        model: patch.model ?? shared.model,
                        detail: patch.detail ?? shared.detail,
                        lockedWardrobeId: patch.lockedWardrobeId,
                        lockedLocation: patch.lockedLocation,
                        lockedVariationSeed: patch.lockedVariationSeed,
                        alwaysIncludeClothing: patch.alwaysIncludeClothing,
                      });
                      if (patch.hints) {
                        setCompareHints(patch.hints);
                        setPresetHints(patch.hints);
                      }
                      setIdentityBundleName(bundle.name);
                      setBackupStatus(`Imported identity bundle “${bundle.name}”.`);
                    }).catch((err) => {
                      setBackupStatus(
                        err instanceof Error ? err.message : "Import failed.",
                      );
                    });
                  }}
                />
              </label>
            </div>
          </div>

          {scenePresets.length === 0 ? (
            <EmptyState
              icon="preset"
              title="No scene presets saved"
              description="Enter a name and optional hints above, then save your current locks as a reusable preset you can apply or share with Duo."
              action={{
                label: "Name a preset",
                onClick: () => {
                  document.getElementById("studio-preset-name")?.focus();
                },
              }}
            />
          ) : (
            <DataList scrollable={false} className="mt-[var(--block-gap)]">
              {scenePresets.map((preset) => (
                <DataListRow key={preset.id} className="!items-start !py-4">
                  <DataListPrimary
                    title={preset.name}
                    subtitle={
                      <>
                        {preset.hints ? preset.hints : "No hints"}
                        {preset.sharedLocks?.lockedLocation
                          ? ` · location: ${preset.sharedLocks.lockedLocation}`
                          : ""}
                      </>
                    }
                  />
                  <DataListActions>
                    <Button
                      variant="ghost"
                      size="sm" className="type-caption"
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
                      size="sm" className="type-caption"
                      onClick={() => {
                        const url = buildScenePresetShareUrl(
                          "/character",
                          buildShareableSceneParams({
                            hints: preset.hints,
                            sportPresetId: preset.sportPresetId,
                            shared: {
                              lockedWardrobeId:
                                preset.sharedLocks?.lockedWardrobeId,
                              lockedLocation: preset.sharedLocks?.lockedLocation,
                              lockedVariationSeed:
                                preset.sharedLocks?.lockedVariationSeed,
                            },
                          }),
                          { mode: "duo" },
                        );
                        const absolute =
                          typeof window !== "undefined"
                            ? `${window.location.origin}${url}`
                            : url;
                        void navigator.clipboard.writeText(absolute);
                        setCopiedPresetShareId(preset.id);
                        window.setTimeout(() => setCopiedPresetShareId(null), 2000);
                      }}
                    >
                      {copiedPresetShareId === preset.id
                        ? "Copied link!"
                        : "Copy share link"}
                    </Button>
                    <a
                      href={buildScenePresetShareUrl(
                        "/character",
                        buildShareableSceneParams({
                          hints: preset.hints,
                          sportPresetId: preset.sportPresetId,
                          shared: {
                            lockedWardrobeId: preset.sharedLocks?.lockedWardrobeId,
                            lockedLocation: preset.sharedLocks?.lockedLocation,
                            lockedVariationSeed:
                              preset.sharedLocks?.lockedVariationSeed,
                          },
                        }),
                        { mode: "duo" },
                      )}
                      className="ui-btn-ghost ui-btn-sm type-caption"
                    >
                      Open Character (duo)
                    </a>
                    <Button
                      variant="danger"
                      size="sm" className="type-caption"
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

      {tab === "experiments" && <ExperimentDashboardPanel />}

      {tab === "diff" && (
        <ToolSection title="Prompt diff">
          {entries.length === 0 ? (
            <EmptyState
              icon="diff"
              title="Save prompts before diffing"
              description="Diff compares two history entries word-by-word. Generate prompts elsewhere, save them to history, then pick left and right entries here."
              action={{ label: "Open Character", href: "/character?mode=duo" }}
            />
          ) : (
            <>
          <ToolMetaPanel>
            <p className="type-body">
              Compare two saved prompts word-by-word. Pick entries from history or use
              the Diff A / Diff B buttons on history cards.
            </p>
          </ToolMetaPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="diff-left">Left (before)</FieldLabel>
              <select
                id="diff-left"
                value={diffLeftId}
                onChange={(event) => setDiffLeftId(event.target.value)}
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="">Select entry…</option>
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.tool} · {entry.prompt.slice(0, 48)}…
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="diff-right">Right (after)</FieldLabel>
              <select
                id="diff-right"
                value={diffRightId}
                onChange={(event) => setDiffRightId(event.target.value)}
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="">Select entry…</option>
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.tool} · {entry.prompt.slice(0, 48)}…
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!promptDiff ? (
            <EmptyState
              compact
              icon="diff"
              title="Select two history entries"
              description="Choose a left and right prompt above to preview additions, removals, and unchanged text."
              action={{
                label: "Browse history",
                onClick: () => setTab("history"),
              }}
            />
          ) : (
            <>
              <p className="type-caption">
                {promptDiff.beforeChars} → {promptDiff.afterChars} chars
                {promptDiff.changed ? "" : " · identical"}
              </p>
              <ToolContentPanel className="type-body-lg leading-relaxed">
                {promptDiff.segments.map((segment, index) => (
                  <span
                    key={`${index}-${segment.type}-${segment.text.slice(0, 12)}`}
                    className={
                      segment.type === "remove"
                        ? "bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)] line-through"
                        : segment.type === "add"
                          ? "bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]"
                          : "text-[var(--text-secondary)]"
                    }
                  >
                    {segment.text}{" "}
                  </span>
                ))}
              </ToolContentPanel>
              <div className="grid gap-[var(--group-gap)] sm:grid-cols-2">
                <ToolContentPanel>
                  <pre className="type-code max-h-72 overflow-auto whitespace-pre-wrap !bg-transparent !p-0 !text-[var(--text-secondary)]">
                    {diffLeft?.prompt}
                  </pre>
                </ToolContentPanel>
                <ToolContentPanel>
                  <pre className="type-code max-h-72 overflow-auto whitespace-pre-wrap !bg-transparent !p-0 !text-[var(--tint-success-text)]">
                    {diffRight?.prompt}
                  </pre>
                </ToolContentPanel>
              </div>
              <PromptMergePanel
                leftDefault={diffLeft?.prompt}
                rightDefault={diffRight?.prompt}
              />
            </>
          )}
            </>
          )}
        </ToolSection>
      )}
    </ToolLayout>
  );
}

function readHistoryBatchPrompts(entry: PromptHistoryEntry): string[] {
  const raw = entry.metadata?.batchPrompts;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

function HistoryCard({
  entry,
  highlighted,
  onCopy,
  onToggleFavorite,
  onRate,
  onAddTag,
  onExportSidecar,
  onRemove,
  onDiffLeft,
  onDiffRight,
  onSaveTemplate,
  onRequeue,
  onRequeueBatch,
  batchPromptCount = 0,
}: {
  entry: PromptHistoryEntry;
  highlighted?: boolean;
  onCopy: () => void;
  onToggleFavorite: () => void;
  onRate: (rating: PromptHistoryEntry["rating"]) => void;
  onAddTag: (tag: string) => void;
  onExportSidecar: () => void;
  onRemove: () => void;
  onDiffLeft: () => void;
  onDiffRight: () => void;
  onSaveTemplate: () => void;
  onRequeue: (newSeed: boolean) => void;
  onRequeueBatch?: () => void;
  batchPromptCount?: number;
}) {
  const regenerateUrl = buildRegenerateUrl(entry);
  const useAsHintsUrl = buildUseAsHintsUrl(entry);
  const showHintDiff =
    entry.hints?.trim() &&
    entry.prompt.trim() &&
    !entry.prompt.toLowerCase().includes(entry.hints.trim().slice(0, 40).toLowerCase());

  return (
    <ToolContentPanel
      className={`ui-block-group min-w-0 ${highlighted ? "ring-2 ring-violet-500/40" : ""}`}
    >
      <pre className="type-code max-h-56 overflow-auto whitespace-pre-wrap border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-5 !text-[var(--tint-success-text)]">
        {entry.prompt}
      </pre>

      <ToolMetaPanel>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="type-caption min-w-0 break-words text-[var(--text-muted)]">
            {entry.tool} · {entry.model} ·{" "}
            {new Date(entry.timestamp).toLocaleString()}
          </p>
          <div className="ui-list-actions w-full justify-start">
            <a href={regenerateUrl} className="ui-btn-ghost ui-btn-sm type-caption">
              Regenerate
            </a>
            <a href={useAsHintsUrl} className="ui-btn-ghost ui-btn-sm type-caption">
              Use as hints
            </a>
            <a href={studioHistoryUrl(entry.id)} className="ui-btn-ghost ui-btn-sm type-caption">
              Link
            </a>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onToggleFavorite}>
              {entry.favorite ? "★" : "☆"}
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onCopy}>
              Copy
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onExportSidecar}>
              Sidecar
            </Button>
            <Button variant="accent-outline" size="sm" className="type-caption" onClick={() => onRequeue(false)}>
              Re-queue
            </Button>
            <Button variant="accent-outline" size="sm" className="type-caption" onClick={() => onRequeue(true)}>
              Re-queue (new seed)
            </Button>
            {batchPromptCount > 1 && onRequeueBatch ? (
              <Button
                variant="accent-outline"
                size="sm" className="type-caption"
                onClick={onRequeueBatch}
              >
                Re-queue batch ({batchPromptCount})
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm" className="type-caption"
              onClick={() => {
                const tag = window.prompt("Add tag");
                if (tag?.trim()) {
                  onAddTag(tag.trim());
                }
              }}
            >
              Tag
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onDiffLeft}>
              Diff A
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onDiffRight}>
              Diff B
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onSaveTemplate}>
              Template
            </Button>
            <Button variant="danger" size="sm" className="type-caption" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>

        {entry.hints?.trim() && (
          <p className="type-caption ui-truncate-2">
            Hints: <span className="text-[var(--text-secondary)]">{entry.hints}</span>
          </p>
        )}

        {(entry.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {entry.tags!.map((tag) => (
              <span
                key={tag}
                className="type-overline rounded-[var(--radius-full)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2.5 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {showHintDiff && (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Prompt expanded beyond the saved hints — use Regenerate to roll again with the same inputs.
          </p>
        )}

        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRate(value as PromptHistoryEntry["rating"])}
              className={`ui-chip !min-h-8 !min-w-8 justify-center px-0 ${
                entry.rating === value ? "" : ""
              }`}
              data-active={entry.rating === value ? "true" : "false"}
            >
              {value}
            </button>
          ))}
        </div>

        {entry.diagnostics && <PromptDiagnosticsPanel diagnostics={entry.diagnostics} />}
      </ToolMetaPanel>
    </ToolContentPanel>
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
  const parentHistoryId =
    typeof node.entry.metadata?.parentHistoryId === "string"
      ? node.entry.metadata.parentHistoryId
      : undefined;

  return (
    <div className="space-y-3" style={{ marginLeft: depth * 16 }}>
      <ToolContentPanel className="ui-block-group">
        <p className="type-caption text-zinc-500">
          {node.entry.tool} · {node.entry.model} ·{" "}
          {new Date(node.entry.timestamp).toLocaleString()}
        </p>
        <pre className="type-code max-h-32 overflow-auto whitespace-pre-wrap text-zinc-300">
          {node.entry.prompt}
        </pre>
        <div className="flex flex-wrap gap-2">
          <a
            href={regenerateUrl}
            className="type-caption text-sky-300 hover:text-sky-200"
          >
            Regenerate
          </a>
          <a
            href={useAsHintsUrl}
            className="type-caption text-sky-300 hover:text-sky-200"
          >
            Use as hints
          </a>
          <button
            type="button"
            onClick={() => startRefineFromHistoryEntry(node.entry)}
            className="type-caption text-violet-300 hover:text-violet-200"
          >
            Refine
          </button>
          <button
            type="button"
            onClick={() => {
              onRequeueStatus("Re-queueing from iteration tree…");
              void requeueComfyJob({
                prompt: node.entry.prompt,
                tool: node.entry.tool,
                model: node.entry.model,
                hints: node.entry.hints,
                newSeed: true,
                onStatus: onRequeueStatus,
              }).then((result) => {
                if (!result.ok) {
                  onRequeueStatus(result.error ?? "Re-queue failed.");
                  return;
                }
                onRequeueStatus(
                  [
                    "queued from iteration tree",
                    result.promptId ? `prompt_id ${result.promptId}` : null,
                    "new seed",
                  ]
                    .filter(Boolean)
                    .join(" · "),
                );
              });
            }}
            className="type-caption text-emerald-300 hover:text-emerald-200"
          >
            Queue (new seed)
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
            className="type-caption text-zinc-400 hover:text-zinc-200"
          >
            Open in history
          </a>
        </div>
      </ToolContentPanel>
      {node.children.map((child) => (
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

function CompareCard({
  title,
  result,
}: {
  title: string;
  result: EnrichedToolGenerateResult;
}) {
  return (
    <ToolContentPanel className="ui-block-group">
      <h3 className="type-title ui-truncate">{title}</h3>
      <pre className="type-code max-h-72 overflow-auto whitespace-pre-wrap border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-5 !text-[var(--tint-success-text)]">
        {result.prompt}
      </pre>
      <PromptDiagnosticsPanel diagnostics={result.diagnostics ?? null} />
    </ToolContentPanel>
  );
}
