"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { STUDIO_BACKUP_LAST_EXPORT_KEY } from "@/lib/studio-backup-meta";
import { readBrowserString, writeBrowserString } from "@/lib/browser-storage";
import { clearAllLocalPromptData, LOCAL_DATA_KEYS } from "@/lib/local-data-reset";
import { useComfyUiSettings } from "@/hooks/useComfyUiSettings";
import {
  validateWorkflowJson,
  WORKFLOW_PARAM_TOKEN_HELP,
  type CustomWorkflowToken,
} from "@/lib/comfyui-config";
import {
  DEFAULT_COMFYUI_SETTINGS,
  loadComfyUiSettings,
  mergeLoraLibraryIntoCustomTokens,
  placeholderTokensFromSettings,
  resetComfyUiSettings,
  saveComfyUiSettings,
} from "@/lib/comfyui-settings";
import {
  DEFAULT_NEGATIVE_PROFILES,
  type NegativeProfile,
} from "@/lib/negative-profiles";
import {
  formatModelCheckpointMap,
  parseModelCheckpointMap,
  formatModelVaeMap,
  parseModelVaeMap,
  formatModelRefinerMap,
  parseModelRefinerMap,
  mergeSuggestedLoaderMaps,
  formatSuggestedLoaderMergeMessage,
} from "@/lib/model-checkpoint-map";
import {
  formatModelUpscaleMap,
  parseModelUpscaleMap,
} from "@/lib/model-upscale-map";
import {
  formatModelControlNetMap,
  parseModelControlNetMap,
} from "@/lib/model-controlnet-map";
import {
  formatModelLoraMap,
  parseModelLoraMap,
} from "@/lib/model-lora-map";
import {
  formatInventorySyncMessage,
  syncLoaderMapsFromInventory,
} from "@/lib/loader-map-inventory-sync";
import { fetchComfyObjectInfoCached } from "@/lib/comfyui-object-info-cache";
import { uploadComfyInputImage } from "@/lib/comfyui-image-upload";
import {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
} from "@/lib/ipadapter-workflow-patch";
import { loadComfyWorkflowFiles } from "@/lib/comfyui-workflow-files";
import {
  countMappedModels,
  mergeModelWorkflowMap,
  suggestWorkflowDefaultsByCategory,
} from "@/lib/workflow-category-defaults";
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  saveSharedSettings,
  type SharedToolSettings,
} from "@/lib/settings-cache";
import {
  DEFAULT_SCHEDULED_BATCH,
  loadScheduledBatchConfig,
  saveScheduledBatchConfig,
  type ScheduledBatchConfig,
} from "@/lib/scheduled-batch";
import {
  fetchScheduledBatchServerStatus,
  pushScheduledBatchProfile,
  type ScheduledBatchServerStatus,
} from "@/lib/scheduled-batch-profile-sync";
import {
  DEFAULT_WEBHOOK_SETTINGS,
  loadWebhookSettings,
  saveWebhookSettings,
  type WebhookSettings,
} from "@/lib/webhook-settings";
import {
  AVOIDED_TOKENS_UPDATED_EVENT,
  addAvoidedToken,
  addAvoidedTokens,
  clearAvoidedTokens,
  exportAvoidedTokenList,
  importAvoidedTokensJson,
  downloadAvoidedTokensExport,
  removeAvoidedToken,
} from "@/lib/avoided-tokens";
import {
  WEBHOOK_LOG_UPDATED_EVENT,
  clearWebhookLog,
  loadWebhookLog,
  retryWebhookLogEntry,
  type WebhookLogEntry,
} from "@/lib/webhook-log";
import {
  isComfyNotificationSupported,
  requestComfyNotificationPermission,
} from "@/lib/comfyui-notifications";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import SettingsSubNav from "@/components/settings/SettingsSubNav";
import CompactDraftSavesStatus from "@/components/settings/CompactDraftSavesStatus";
import WildcardListsEditor from "@/components/settings/WildcardListsEditor";
import FaceDetailerHealthChip from "@/components/settings/FaceDetailerHealthChip";
import IdentityPackHealthChips from "@/components/settings/IdentityPackHealthChips";
import {
  CollapsibleSection,
  ToolBadge,
  ToolLayout,
  ToolSection,
  HealthCard,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { EmptyState, ToolPageSkeleton } from "@/components/ui/ViewState";
import { FieldError, FieldLabel, TextArea } from "@/components/ui/Field";
import { Button, PrimaryButton } from "@/components/ui/Button";
import {
  normalizeSettingsTab,
  settingsTabHref,
  SETTINGS_TABS,
  type SettingsTab,
} from "@/lib/settings-nav";
import {
  normalizeComfyUiSettingsSection,
  settingsComfyUiSectionHref,
  type ComfyUiSettingsSectionId,
} from "@/lib/settings-comfyui-nav";
import type { ServerEnvSummary } from "@/lib/server-env-summary";
import {
  markOnboardingComfyHealthOk,
  markOnboardingLlmHealthOk,
  markOnboardingSystemWorkflowsEnabled,
} from "@/lib/onboarding-hooks";
import { fetchWorkflowPreview } from "@/lib/comfyui-requeue";
import { resolveQueueParams } from "@/lib/queue-params-settings";
import { runHealAndReady, readAdaptedLoaderMapTexts } from "@/lib/first-run-setup";

const ToolQualityProfilesSettings = dynamic(
  () => import("@/components/settings/ToolQualityProfilesSettings"),
  { loading: () => <ToolPageSkeleton label="Loading quality profiles" /> },
);
const WorkflowHealthPanel = dynamic(() => import("@/components/WorkflowHealthPanel"), {
  loading: () => <ToolPageSkeleton label="Loading workflow health" />,
});
const ComfyUiGalleryPanel = dynamic(() => import("@/components/ComfyUiGalleryPanel"), {
  loading: () => <ToolPageSkeleton label="Loading gallery panel" />,
});
const ComfyWorkflowLibraryPanel = dynamic(
  () => import("@/components/ComfyWorkflowLibraryPanel"),
  { loading: () => <ToolPageSkeleton label="Loading workflow library" /> },
);
const WorkflowDiffPanel = dynamic(
  () => import("@/components/settings/WorkflowDiffPanel"),
  { loading: () => <ToolPageSkeleton label="Loading workflow diff" /> },
);
const SettingsAdvancedPanel = dynamic(() => import("@/components/SettingsAdvancedPanel"), {
  loading: () => <ToolPageSkeleton label="Loading advanced settings" />,
});
const UsersSettingsPanel = dynamic(() => import("@/components/settings/UsersSettingsPanel"), {
  loading: () => <ToolPageSkeleton label="Loading users" />,
});
const ServerEnvPanel = dynamic(() => import("@/components/settings/ServerEnvPanel"), {
  loading: () => <ToolPageSkeleton label="Loading server environment" />,
});
const QueueParamsPanel = dynamic(() => import("@/components/QueueParamsPanel"), {
  loading: () => <ToolPageSkeleton label="Loading queue params" />,
});
const WorkflowPreviewPanel = dynamic(() => import("@/components/WorkflowPreviewPanel"), {
  loading: () => <ToolPageSkeleton label="Loading workflow preview" />,
});
const SettingsPromptQualityPanel = dynamic(
  () => import("@/components/settings/SettingsPromptQualityPanel"),
  { loading: () => <ToolPageSkeleton label="Loading prompt quality" /> },
);
const SettingsLlmPanel = dynamic(
  () => import("@/components/settings/SettingsLlmPanel"),
  { loading: () => <ToolPageSkeleton label="Loading LLM settings" /> },
);
const ComfyUiSettingsJumpNav = dynamic(
  () => import("@/components/settings/ComfyUiSettingsJumpNav"),
  { loading: () => <ToolPageSkeleton label="Loading section nav" /> },
);
const SettingsBrowserPresetsPanel = dynamic(
  () => import("@/components/settings/SettingsBrowserPresetsPanel"),
  { loading: () => <ToolPageSkeleton label="Loading presets" /> },
);
const SettingsBundlePanel = dynamic(
  () => import("@/components/settings/SettingsBundlePanel"),
  { loading: () => <ToolPageSkeleton label="Loading settings export" /> },
);
const LoraLibrarySettingsPanel = dynamic(
  () => import("@/components/settings/LoraLibrarySettingsPanel"),
  { loading: () => <ToolPageSkeleton label="Loading LoRA library" /> },
);
const LoraTrainPanel = dynamic(
  () => import("@/components/settings/LoraTrainPanel"),
  { loading: () => <ToolPageSkeleton label="Loading LoRA train" /> },
);
const ComfyModelAssetsPanel = dynamic(
  () => import("@/components/settings/ComfyModelAssetsPanel"),
  { loading: () => <ToolPageSkeleton label="Loading model assets" /> },
);
const ACCENT = "neutral" as const;

const COMFYUI_SECTION_ELEMENT_IDS: Record<ComfyUiSettingsSectionId, string> = {
  presets: "settings-comfyui-presets",
  "workflow-map": "settings-comfyui-workflow-map",
  "model-assets": "settings-comfyui-model-assets",
  "workflow-patching": "settings-comfyui-workflow-patching",
  "lora-library": "settings-comfyui-lora-library",
  "lora-train": "settings-comfyui-lora-train",
  "workflow-library": "settings-comfyui-workflow-library",
  "inference-engine": "settings-comfyui-inference-engine",
  connection: "settings-comfyui-connection",
  "auto-improve": "settings-comfyui-auto-improve",
  "queue-params": "settings-comfyui-queue-params",
  "prompt-quality": "settings-comfyui-prompt-quality",
  "vram-guard": "settings-comfyui-vram-guard",
  "hold-max": "settings-comfyui-hold-max",
  "sampler-memory": "settings-comfyui-sampler-memory",
};

function serverEnvFieldValue(
  serverEnv: ServerEnvSummary | undefined,
  key: string,
): string | undefined {
  for (const group of serverEnv?.groups ?? []) {
    const field = group.fields.find((entry) => entry.key === key);
    if (field?.value) {
      return field.value;
    }
  }
  return undefined;
}

function formatModelWorkflowMap(map?: Record<string, string>): string {
  if (!map) {
    return "";
  }
  return Object.entries(map)
    .map(([modelId, workflowFileId]) => `${modelId}=${workflowFileId}`)
    .join("\n");
}

function parseModelWorkflowMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const modelId = trimmed.slice(0, separator).trim();
    const workflowFileId = trimmed.slice(separator + 1).trim();
    if (modelId && workflowFileId) {
      map[modelId] = workflowFileId;
    }
  }
  return map;
}

type HealthResponse = {
  llm: {
    ok: boolean;
    enabled: boolean;
    model?: string;
    visionModel?: string;
    baseUrl?: string;
    error?: string;
    inFlight?: number;
    maxInflight?: number;
    busy?: boolean;
  };
  comfyui: {
    ok: boolean;
    url: string;
    error?: string;
    queuePending?: number;
    queueRunning?: number;
    vram?: { free?: number; total?: number };
  };
  apiUsage?: {
    total: number;
    lastHour: number;
    rateLimited: number;
    avgDurationMs: number;
  };
  storage?: { enabled: boolean };
  workflow?: {
    apiUrl: string;
    workflowSource: "client" | "env" | "none";
    placeholderTokens: { positive: string; negative: string };
    placeholders: { positive: number; negative: number };
    legacyNodeFallback: boolean;
    hasWorkflow: boolean;
  };
  config: {
    llmEnabled: boolean;
    allowTemplateFallback: boolean;
    llmModel: string;
    visionModel: string;
    comfyUiUrl: string;
  };
  serverEnv?: ServerEnvSummary;
  comfyuiPool?: {
    enabled: boolean;
    endpoints: Array<{
      index: number;
      ok: boolean;
      url: string;
      error?: string;
      queuePending?: number;
      queueRunning?: number;
      vram?: { free?: number; total?: number };
    }>;
  };
};

export default function SettingsTool() {
  const { mounted, settings, updateSettings } = useComfyUiSettings();
  const [tab, setTab] = useState<SettingsTab>("overview");
  const [comfyUiSection, setComfyUiSection] =
    useState<ComfyUiSettingsSectionId | null>(null);
  const [sharedSettings, setSharedSettings] =
    useState<SharedToolSettings>(DEFAULT_SHARED_SETTINGS);
  const [sharedMounted, setSharedMounted] = useState(false);
  const [modelWorkflowMapText, setModelWorkflowMapText] = useState("");
  const [modelCheckpointMapText, setModelCheckpointMapText] = useState("");
  const [modelVaeMapText, setModelVaeMapText] = useState("");
  const [modelRefinerMapText, setModelRefinerMapText] = useState("");
  const [modelUpscaleMapText, setModelUpscaleMapText] = useState("");
  const [modelControlNetMapText, setModelControlNetMapText] = useState("");
  const [modelLoraMapText, setModelLoraMapText] = useState("");
  const [loaderMapMergeHint, setLoaderMapMergeHint] = useState<string | null>(null);
  const [ipAdapterUploadStatus, setIpAdapterUploadStatus] = useState<string | null>(null);
  const [ipAdapterUploading, setIpAdapterUploading] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [healBusy, setHealBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [workflowHealthRefresh, setWorkflowHealthRefresh] = useState(0);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [previewPrompt, setPreviewPrompt] = useState(
    "Two gravel cyclists racing through a muddy forest doubletrack at dusk.",
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [workflowPreview, setWorkflowPreview] = useState<Awaited<
    ReturnType<typeof fetchWorkflowPreview>
  > | null>(null);
  const [webhookSettings, setWebhookSettings] = useState<WebhookSettings>(
    DEFAULT_WEBHOOK_SETTINGS,
  );
  const [scheduledBatch, setScheduledBatch] = useState<ScheduledBatchConfig>(
    DEFAULT_SCHEDULED_BATCH,
  );
  const [serverScheduledBatchStatus, setServerScheduledBatchStatus] =
    useState<ScheduledBatchServerStatus | null>(null);
  const [avoidedTokens, setAvoidedTokens] = useState<string[]>([]);
  const [avoidedTokenDraft, setAvoidedTokenDraft] = useState("");
  const [avoidancePreviewPrompt, setAvoidancePreviewPrompt] = useState("");
  const [avoidancePreview, setAvoidancePreview] = useState<{
    filtered: string;
    removedTokens: string[];
    instructionLine: string;
  } | null>(null);
  const [webhookLog, setWebhookLog] = useState<WebhookLogEntry[]>([]);
  const [webhookEventFilter, setWebhookEventFilter] = useState<string>("all");
  const [expandedWebhookLogId, setExpandedWebhookLogId] = useState<string | null>(
    null,
  );
  const [backupReminder, setBackupReminder] = useState<string | null>(null);

  const filteredWebhookLog = useMemo(() => {
    if (webhookEventFilter === "all") {
      return webhookLog;
    }
    return webhookLog.filter((entry) => entry.event === webhookEventFilter);
  }, [webhookEventFilter, webhookLog]);

  const webhookEventOptions = useMemo(() => {
    const events = new Set(webhookLog.map((entry) => entry.event));
    return [...events].sort();
  }, [webhookLog]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (isComfyNotificationSupported()) {
        setNotificationPermission(Notification.permission);
      } else {
        setNotificationPermission("unsupported");
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    scheduleAfterCommit(() => {
      const params = new URLSearchParams(window.location.search);
      setTab(normalizeSettingsTab(params.get("tab")));
      setComfyUiSection(normalizeComfyUiSettingsSection(params.get("section")));
    });
  }, []);

  const scrollToComfyUiSection = useCallback((section: ComfyUiSettingsSectionId) => {
    const element = document.getElementById(COMFYUI_SECTION_ELEMENT_IDS[section]);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleTabChange = useCallback((next: SettingsTab) => {
    setTab(next);
    if (next !== "comfyui") {
      setComfyUiSection(null);
    }
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", settingsTabHref(next));
    }
  }, []);

  const handleComfyUiSectionJump = useCallback(
    (section: ComfyUiSettingsSectionId) => {
      setComfyUiSection(section);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", settingsComfyUiSectionHref(section));
      }
      scheduleAfterCommit(() => {
        scrollToComfyUiSection(section);
      });
    },
    [scrollToComfyUiSection],
  );

  const reloadBrowserSettingsState = useCallback(() => {
    const cache = loadSettingsCache();
    setSharedSettings(cache.shared);
    setModelWorkflowMapText(formatModelWorkflowMap(cache.shared.modelWorkflowMap));
    setModelCheckpointMapText(formatModelCheckpointMap(cache.shared.modelCheckpointMap));
    setModelVaeMapText(formatModelVaeMap(cache.shared.modelVaeMap));
    setModelRefinerMapText(formatModelRefinerMap(cache.shared.modelRefinerMap));
    setModelUpscaleMapText(formatModelUpscaleMap(cache.shared.modelUpscaleMap));
    setModelControlNetMapText(formatModelControlNetMap(cache.shared.modelControlNetMap));
    setModelLoraMapText(formatModelLoraMap(cache.shared.modelLoraMap));
    updateSettings(loadComfyUiSettings());
    setWebhookSettings(loadWebhookSettings());
    setScheduledBatch(loadScheduledBatchConfig());
    setAvoidedTokens(exportAvoidedTokenList());
  }, [updateSettings]);

  useEffect(() => {
    if (tab !== "comfyui" || !comfyUiSection) {
      return;
    }
    scheduleAfterCommit(() => {
      scrollToComfyUiSection(comfyUiSection);
    });
  }, [tab, comfyUiSection, scrollToComfyUiSection]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const cache = loadSettingsCache();
      setSharedSettings(cache.shared);
      setModelWorkflowMapText(formatModelWorkflowMap(cache.shared.modelWorkflowMap));
      setModelCheckpointMapText(formatModelCheckpointMap(cache.shared.modelCheckpointMap));
      setModelVaeMapText(formatModelVaeMap(cache.shared.modelVaeMap));
      setModelRefinerMapText(formatModelRefinerMap(cache.shared.modelRefinerMap));
      setModelUpscaleMapText(formatModelUpscaleMap(cache.shared.modelUpscaleMap));
      setModelControlNetMapText(formatModelControlNetMap(cache.shared.modelControlNetMap));
      setModelLoraMapText(formatModelLoraMap(cache.shared.modelLoraMap));
      setSharedMounted(true);
      setWebhookSettings(loadWebhookSettings());
      setScheduledBatch(loadScheduledBatchConfig());
      setAvoidedTokens(exportAvoidedTokenList());
      setWebhookLog(loadWebhookLog());
      void fetchScheduledBatchServerStatus().then(setServerScheduledBatchStatus);
      try {
        const lastBackupRaw = readBrowserString(STUDIO_BACKUP_LAST_EXPORT_KEY);
        const lastBackup = lastBackupRaw ? Number(lastBackupRaw) : 0;
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        if (!lastBackup || Date.now() - lastBackup > weekMs) {
          setBackupReminder(
            "No recent Studio backup detected — export a v3 backup to preserve avoided tokens, webhooks, and projects.",
          );
        }
      } catch {
        setBackupReminder(null);
      }
    });
  }, []);

  useEffect(() => {
    const refreshAvoided = () => setAvoidedTokens(exportAvoidedTokenList());
    const refreshWebhookLog = () => setWebhookLog(loadWebhookLog());
    window.addEventListener(AVOIDED_TOKENS_UPDATED_EVENT, refreshAvoided);
    window.addEventListener(WEBHOOK_LOG_UPDATED_EVENT, refreshWebhookLog);
    return () => {
      window.removeEventListener(AVOIDED_TOKENS_UPDATED_EVENT, refreshAvoided);
      window.removeEventListener(WEBHOOK_LOG_UPDATED_EVENT, refreshWebhookLog);
    };
  }, []);

  const updateSharedSettings = useCallback((patch: Partial<SharedToolSettings>) => {
    setSharedSettings((previous) => {
      const next = { ...previous, ...patch };
      saveSharedSettings(next);
      return next;
    });
  }, []);

  // Mirrors Studio Automation config to server storage so the headless scheduled
  // batch runner (src/instrumentation.ts) queues with the same model/detail/quality.
  useEffect(() => {
    if (!sharedMounted) {
      return;
    }
    const timer = window.setTimeout(() => {
      void pushScheduledBatchProfile({
        model: sharedSettings.model,
        detail: sharedSettings.detail,
        qualityProfile: sharedSettings.queueQualityProfile,
        target: scheduledBatch.target,
        count: scheduledBatch.count,
        genre: scheduledBatch.genre,
        autoQueueComfyUi: scheduledBatch.autoQueueComfyUi,
      }).then((result) => {
        if (result) {
          setServerScheduledBatchStatus((previous) => ({
            profile: result.profile,
            persisted: result.persisted,
            lastRunAt: previous?.lastRunAt,
            enabled: previous?.enabled ?? false,
          }));
        }
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    sharedMounted,
    sharedSettings.model,
    sharedSettings.detail,
    sharedSettings.queueQualityProfile,
    scheduledBatch.target,
    scheduledBatch.count,
    scheduledBatch.genre,
    scheduledBatch.autoQueueComfyUi,
  ]);

  const applySuggestedLoaderMaps = useCallback(() => {
    const merged = mergeSuggestedLoaderMaps({
      checkpointMap: sharedSettings.modelCheckpointMap,
      vaeMap: sharedSettings.modelVaeMap,
      refinerMap: sharedSettings.modelRefinerMap,
    });
    const message = formatSuggestedLoaderMergeMessage(merged);
    updateSharedSettings({
      modelCheckpointMap: merged.modelCheckpointMap,
      modelVaeMap: merged.modelVaeMap,
      modelRefinerMap: merged.modelRefinerMap,
    });
    setModelCheckpointMapText(formatModelCheckpointMap(merged.modelCheckpointMap));
    setModelVaeMapText(formatModelVaeMap(merged.modelVaeMap));
    setModelRefinerMapText(formatModelRefinerMap(merged.modelRefinerMap));
    setLoaderMapMergeHint(message);
    setStatus(message);
  }, [sharedSettings.modelCheckpointMap, sharedSettings.modelRefinerMap, sharedSettings.modelVaeMap, updateSharedSettings]);

  const syncLoaderMapsFromComfyInventory = useCallback(async () => {
    setStatus("Fetching ComfyUI inventory…");
    const objectInfo = await fetchComfyObjectInfoCached({
      comfyUrl: settings.apiUrl || undefined,
    });
    if (!objectInfo?.models) {
      setStatus("Could not fetch ComfyUI object_info — is ComfyUI reachable?");
      return;
    }
    const synced = syncLoaderMapsFromInventory({
      models: objectInfo.models,
      checkpointMap: sharedSettings.modelCheckpointMap,
      vaeMap: sharedSettings.modelVaeMap,
      upscaleMap: sharedSettings.modelUpscaleMap,
      controlNetMap: sharedSettings.modelControlNetMap,
      healMissing: true,
    });
    const message = formatInventorySyncMessage(synced);
    updateSharedSettings({
      modelCheckpointMap: synced.modelCheckpointMap,
      modelVaeMap: synced.modelVaeMap,
      modelUpscaleMap: synced.modelUpscaleMap,
      modelControlNetMap: synced.modelControlNetMap,
    });
    setModelCheckpointMapText(formatModelCheckpointMap(synced.modelCheckpointMap));
    setModelVaeMapText(formatModelVaeMap(synced.modelVaeMap));
    setModelUpscaleMapText(formatModelUpscaleMap(synced.modelUpscaleMap));
    setModelControlNetMapText(formatModelControlNetMap(synced.modelControlNetMap));
    setLoaderMapMergeHint(message);
    setStatus(message);
    setWorkflowHealthRefresh((n) => n + 1);
  }, [
    settings.apiUrl,
    sharedSettings.modelCheckpointMap,
    sharedSettings.modelControlNetMap,
    sharedSettings.modelUpscaleMap,
    sharedSettings.modelVaeMap,
    updateSharedSettings,
  ]);

  const workflowValidation = useMemo(() => {
    if (!settings.workflowJson?.trim()) {
      return null;
    }
    return validateWorkflowJson(
      settings.workflowJson,
      placeholderTokensFromSettings(settings),
    );
  }, [settings.workflowJson, settings.positiveToken, settings.negativeToken]);

  const refreshHealth = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!settings.useServerDefaults && settings.apiUrl?.trim()) {
        params.set("comfyUrl", settings.apiUrl.trim());
      }
      const query = params.toString();
      const response = await fetch(query ? `/api/health?${query}` : "/api/health");
      const healthData = (await response.json()) as HealthResponse;
      setHealth(healthData);
      if (healthData.llm?.ok) {
        markOnboardingLlmHealthOk();
      }
      if (healthData.comfyui?.ok) {
        markOnboardingComfyHealthOk();
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Health check failed.");
    } finally {
      setLoading(false);
    }
  }, [settings.apiUrl, settings.useServerDefaults]);

  const handleHealAndReady = useCallback(async () => {
    setHealBusy(true);
    try {
      const result = await runHealAndReady({
        comfyUrl:
          !settings.useServerDefaults && settings.apiUrl?.trim()
            ? settings.apiUrl.trim()
            : undefined,
      });
      const adapted = loadSettingsCache().shared;
      updateSharedSettings({
        useSystemWorkflows: true,
        queueQualityProfile: adapted.queueQualityProfile,
        modelCheckpointMap: adapted.modelCheckpointMap,
        modelVaeMap: adapted.modelVaeMap,
        modelRefinerMap: adapted.modelRefinerMap,
        modelUpscaleMap: adapted.modelUpscaleMap,
        modelControlNetMap: adapted.modelControlNetMap,
      });
      const texts = readAdaptedLoaderMapTexts();
      setModelCheckpointMapText(texts.checkpoint);
      setModelVaeMapText(texts.vae);
      setModelRefinerMapText(texts.refiner);
      setModelUpscaleMapText(texts.upscale);
      setModelControlNetMapText(texts.controlNet);
      setStatus(result.message);
      setWorkflowHealthRefresh((n) => n + 1);
      await refreshHealth();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Heal & ready failed.");
    } finally {
      setHealBusy(false);
    }
  }, [
    refreshHealth,
    settings.apiUrl,
    settings.useServerDefaults,
    updateSharedSettings,
  ]);

  useEffect(() => {
    if (tab !== "overview" && tab !== "comfyui") {
      return;
    }
    scheduleAfterCommit(() => {
      void refreshHealth();
    });
  }, [refreshHealth, tab]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const { importStudioBackup, parseStudioBackupFile } = await import(
        "@/lib/studio-backup"
      );
      importStudioBackup(parseStudioBackupFile(raw));
      setStatus("Backup imported. Reload the page to apply all settings.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import failed.");
    }
  }, []);

  const handleSaveComfySettings = useCallback(() => {
    if (!settings.useServerDefaults && settings.workflowJson?.trim()) {
      const validation = validateWorkflowJson(
        settings.workflowJson,
        placeholderTokensFromSettings(settings),
      );
      if (!validation.ok) {
        setWorkflowError(validation.error ?? "Invalid workflow JSON.");
        return;
      }
    }

    saveComfyUiSettings(mergeLoraLibraryIntoCustomTokens(settings));
    setWorkflowError(null);
    setStatus("ComfyUI settings saved.");
    void refreshHealth();
  }, [refreshHealth, settings]);

  const handleImportWorkflow = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const validation = validateWorkflowJson(
        raw,
        placeholderTokensFromSettings(settings),
      );
      if (!validation.ok) {
        setWorkflowError(validation.error ?? "Invalid workflow JSON.");
        return;
      }

      updateSettings({
        useServerDefaults: false,
        workflowJson: raw.trim(),
      });
      setWorkflowError(null);
      setStatus(
        `Imported workflow · ${validation.placeholders?.positive ?? 0} positive placeholder(s).`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Workflow import failed.");
    }
  }, [settings, updateSettings]);

  const handleResetComfySettings = useCallback(() => {
    resetComfyUiSettings();
    updateSettings(DEFAULT_COMFYUI_SETTINGS);
    setWorkflowError(null);
    setStatus("ComfyUI settings reset to server defaults.");
    void refreshHealth();
  }, [refreshHealth, updateSettings]);

  const handleEnableNotifications = useCallback(async () => {
    const permission = await requestComfyNotificationPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      updateSettings({ notifyOnComplete: true });
      setStatus("Browser notifications enabled for completed ComfyUI jobs.");
    } else if (permission === "denied") {
      setStatus("Notifications blocked in browser settings.");
    }
  }, [updateSettings]);

  const updateQueueParam = useCallback(
    (key: "seed" | "width" | "height" | "cfg" | "steps", value: string) => {
      updateSettings({
        queueParams: {
          ...settings.queueParams,
          [key]: value,
        },
      });
    },
    [settings.queueParams, updateSettings],
  );

  const updateCustomToken = useCallback(
    (index: number, patch: Partial<CustomWorkflowToken>) => {
      const current = settings.customTokens ?? [];
      const next = current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      );
      updateSettings({ customTokens: next });
    },
    [settings.customTokens, updateSettings],
  );

  const addCustomToken = useCallback(() => {
    updateSettings({
      customTokens: [
        ...(settings.customTokens ?? []),
        { token: "{{CHECKPOINT}}", value: "" },
      ],
    });
  }, [settings.customTokens, updateSettings]);

  const removeCustomToken = useCallback(
    (index: number) => {
      updateSettings({
        customTokens: (settings.customTokens ?? []).filter(
          (_, entryIndex) => entryIndex !== index,
        ),
      });
    },
    [settings.customTokens, updateSettings],
  );

  const handlePreviewWorkflow = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setWorkflowPreview(null);
    try {
      saveComfyUiSettings(settings);
      const preview = await fetchWorkflowPreview({
        prompt: previewPrompt,
        model: sharedSettings.model,
        params: resolveQueueParams({ model: sharedSettings.model }),
      });
      setWorkflowPreview(preview);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewPrompt, settings, sharedSettings.model]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Settings</ToolBadge>}
      title="Settings & Health"
      description={
        <>
          Organized by area — use the tabs below. Browser overrides apply per session;
          server defaults come from <code className="text-violet-300">.env.local</code>{" "}
          (see Overview).
        </>
      }
    >
      <div className="md:grid md:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] md:items-start md:gap-8">
      <SettingsSubNav activeTab={tab} onTabChange={handleTabChange} tabs={SETTINGS_TABS} />
      <div className="min-w-0 space-y-[var(--section-gap)]">

      {tab === "overview" && (
      <>
      <ToolSection title="Appearance & chrome">
        <p className="text-sm text-zinc-400">
          Theme (Auto / Light / Dark), ambient intensity, density, and queue toasts live in{" "}
          <a
            href="/profile"
            className="text-[var(--accent-text)] underline-offset-2 hover:underline"
          >
            Profile → Appearance
          </a>
          . Prompt quality and VRAM guards are under the ComfyUI tab.
        </p>
      </ToolSection>

      <ToolSection title="Service health">
        <div className="mb-4 rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 shadow-[var(--shadow-surface)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-[var(--accent-text)]">
                Heal & ready
              </p>
              <p className="type-caption text-[var(--text-secondary)]">
                One click for new installs: enable system workflows, merge suggested
                loader maps, adapt from ComfyUI inventory when reachable, and refresh
                health.
              </p>
            </div>
            <Button
              size="sm"
              loading={healBusy}
              loadingLabel="Healing…"
              onClick={() => void handleHealAndReady()}
            >
              Heal & ready
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            loading={loading}
            loadingLabel="Checking service health"
            onClick={() => void refreshHealth()}
            className="type-caption"
          >
            Refresh
          </Button>
        </div>

        {health && (
          <div className="grid gap-3 sm:grid-cols-2">
            <HealthCard
              title="LLM API"
              ok={health.llm.ok}
              detail={[
                health.llm.enabled ? health.llm.model : "disabled",
                health.llm.baseUrl,
                health.llm.enabled && typeof health.llm.inFlight === "number"
                  ? `LLM busy: ${health.llm.inFlight}/${health.llm.maxInflight ?? "?"} in flight`
                  : null,
                health.llm.error,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <HealthCard
              title="ComfyUI"
              ok={health.comfyui.ok}
              detail={[
                health.comfyui.url,
                health.comfyui.queuePending != null
                  ? `queue ${health.comfyui.queueRunning ?? 0} running · ${health.comfyui.queuePending} pending`
                  : null,
                health.comfyui.vram?.total
                  ? `VRAM ${Math.round((health.comfyui.vram.free ?? 0) / 1e9)} / ${Math.round(health.comfyui.vram.total / 1e9)} GB free`
                  : null,
                health.comfyui.error,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          </div>
        )}

        {health?.comfyuiPool?.enabled && health.comfyuiPool.endpoints.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="type-caption text-zinc-400">ComfyUI pool endpoints</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {health.comfyuiPool.endpoints.map((endpoint) => (
                <HealthCard
                  key={endpoint.url}
                  title={`Pool #${endpoint.index + 1}${
                    sharedSettings.preferredComfyHost?.replace(/\/+$/, "") ===
                    endpoint.url.replace(/\/+$/, "")
                      ? " · preferred"
                      : ""
                  }`}
                  ok={endpoint.ok}
                  detail={[
                    endpoint.url,
                    endpoint.queuePending != null
                      ? `${endpoint.queueRunning ?? 0} running · ${endpoint.queuePending} pending`
                      : null,
                    endpoint.vram?.total
                      ? `VRAM ${Math.round((endpoint.vram.free ?? 0) / 1e9)} / ${Math.round(endpoint.vram.total / 1e9)} GB`
                      : null,
                    endpoint.error,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="preferred-comfy-host"
                className="text-xs text-zinc-400"
              >
                Preferred pool host
              </label>
              <select
                id="preferred-comfy-host"
                value={sharedSettings.preferredComfyHost ?? ""}
                onChange={(event) =>
                  updateSharedSettings({
                    preferredComfyHost: event.target.value.trim() || undefined,
                  })
                }
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 shadow-inner shadow-black/20 transition hover:border-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 active:border-zinc-500"
              >
                <option value="">Auto (VRAM / round-robin)</option>
                {health.comfyuiPool.endpoints.map((endpoint) => (
                  <option key={endpoint.url} value={endpoint.url}>
                    {endpoint.ok ? "●" : "○"} Pool #{endpoint.index + 1} —{" "}
                    {endpoint.url}
                    {endpoint.ok ? "" : " (unhealthy)"}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                When the preferred host is in the pool and healthy, queues use it
                first. Unhealthy preferred hosts fall back to VRAM-aware routing.
              </p>
            </div>
          </div>
        ) : null}

        {health?.apiUsage ? (
          <ul className="space-y-1 text-xs text-zinc-500">
            <li>
              API usage (in-memory): {health.apiUsage.total} requests ·{" "}
              {health.apiUsage.lastHour} last hour · {health.apiUsage.rateLimited} rate limited
            </li>
            <li>Server storage: {health.storage?.enabled ? "enabled" : "disabled"}</li>
          </ul>
        ) : null}

        {health && (
          <ul className="space-y-1 text-xs text-zinc-500">
            <li>Vision model: {health.config.visionModel}</li>
            <li>
              Template fallback:{" "}
              {health.config.allowTemplateFallback ? "allowed" : "disabled"}
            </li>
            {health.workflow && (
              <li>
                Active workflow: {health.workflow.workflowSource}
                {health.workflow.hasWorkflow
                  ? ` · ${health.workflow.placeholders.positive}× ${health.workflow.placeholderTokens.positive}${
                      health.workflow.placeholders.negative > 0
                        ? ` · ${health.workflow.placeholders.negative}× ${health.workflow.placeholderTokens.negative}`
                        : ""
                    }`
                  : " · minimal fallback workflow"}
                {health.workflow.legacyNodeFallback
                  ? " · env node-ID fallback available"
                  : ""}
              </li>
            )}
          </ul>
        )}
      </ToolSection>

      {health?.serverEnv ? (
        <ServerEnvPanel
          groups={health.serverEnv.groups}
          llmOk={health.llm.ok}
          comfyOk={health.comfyui.ok}
          onRefreshHealth={() => void refreshHealth()}
          onStatus={setStatus}
        />
      ) : null}
      </>
      )}

      {tab === "llm" && (
      <SettingsLlmPanel
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        server={{
          enabled: health?.config.llmEnabled,
          ok: health?.llm.ok,
          model: health?.llm.model ?? health?.config.llmModel,
          baseUrl: health?.llm.baseUrl,
          error: health?.llm.error,
          visionModel: health?.config.visionModel,
          allowTemplateFallback: health?.config.allowTemplateFallback,
          serverTemperature: serverEnvFieldValue(health?.serverEnv, "LLM_TEMPERATURE"),
          embedModel: serverEnvFieldValue(health?.serverEnv, "LLM_EMBED_MODEL"),
          inFlight: health?.llm.inFlight,
          maxInflight: health?.llm.maxInflight,
          busy: health?.llm.busy,
        }}
        autoVisionTags={settings.autoVisionTags !== false}
        onAutoVisionTagsChange={(value) =>
          updateSettings({ autoVisionTags: value })
        }
        onTestConnection={() => void refreshHealth()}
        testingConnection={loading}
      />
      )}

      {tab === "comfyui" && (
      <>
      <ComfyUiSettingsJumpNav
        activeSection={comfyUiSection}
        onJump={handleComfyUiSectionJump}
      />
      <ToolSection
        id="settings-comfyui-inference-engine"
        title="Inference engine"
        description="Choose ComfyUI (full workflows) or Diffusers (narrow txt2img via the local FastAPI service)."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="inference-engine" className="text-xs text-zinc-400">
              Active engine
            </label>
            <select
              id="inference-engine"
              value={sharedSettings.inferenceEngine === "diffusers" ? "diffusers" : "comfyui"}
              onChange={(event) =>
                updateSharedSettings({
                  inferenceEngine:
                    event.target.value === "diffusers" ? "diffusers" : "comfyui",
                })
              }
              className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 shadow-inner transition focus-visible:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40"
            >
              <option value="comfyui">ComfyUI</option>
              <option value="diffusers">Diffusers (txt2img)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="diffusers-url" className="text-xs text-zinc-400">
              Diffusers API URL
            </label>
            <input
              id="diffusers-url"
              value={sharedSettings.diffusersApiUrl ?? ""}
              onChange={(event) =>
                updateSharedSettings({ diffusersApiUrl: event.target.value })
              }
              placeholder="http://127.0.0.1:8190"
              disabled={sharedSettings.inferenceEngine !== "diffusers"}
              className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 shadow-inner transition focus-visible:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Run{" "}
          <code className="rounded bg-zinc-800/80 px-1 text-zinc-300">
            services/diffusers-engine
          </code>{" "}
          locally (see its README). Server proxy uses{" "}
          <code className="rounded bg-zinc-800/80 px-1 text-zinc-300">
            DIFFUSERS_API_URL
          </code>
          .
        </p>
      </ToolSection>
      <SettingsBrowserPresetsPanel
        disabled={!sharedMounted || !mounted}
        onApply={(preset) => {
          updateSharedSettings(preset.shared);
          updateSettings(preset.comfyUi);
          setStatus(`Applied ${preset.label} browser preset.`);
        }}
      />
      <ToolSection id="settings-comfyui-workflow-map" title="Model → workflow map">
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.useSystemWorkflows === true}
            onChange={(event) => {
              const enabled = event.target.checked;
              updateSharedSettings({
                useSystemWorkflows: enabled,
                ...(enabled &&
                (sharedSettings.queueQualityProfile === "followSettings" ||
                  sharedSettings.queueQualityProfile == null)
                  ? { queueQualityProfile: "final" as const }
                  : {}),
              });
              if (enabled) {
                markOnboardingSystemWorkflowsEnabled();
                void (async () => {
                  setStatus("Scanning ComfyUI inventory for system workflows…");
                  const { scanAndAdaptSystemWorkflowInventory } = await import(
                    "@/lib/comfyui-runtime-for-model"
                  );
                  const models = await scanAndAdaptSystemWorkflowInventory({
                    comfyUrl: settings.apiUrl || undefined,
                    persist: true,
                  });
                  if (!models) {
                    setStatus(
                      "System workflows on — could not reach ComfyUI inventory yet; scaffolds will adapt on next queue.",
                    );
                    return;
                  }
                  const adapted = loadSettingsCache().shared;
                  updateSharedSettings({
                    modelCheckpointMap: adapted.modelCheckpointMap,
                    modelVaeMap: adapted.modelVaeMap,
                    modelUpscaleMap: adapted.modelUpscaleMap,
                    modelControlNetMap: adapted.modelControlNetMap,
                  });
                  setModelCheckpointMapText(
                    formatModelCheckpointMap(adapted.modelCheckpointMap),
                  );
                  setModelVaeMapText(formatModelVaeMap(adapted.modelVaeMap));
                  setModelUpscaleMapText(
                    formatModelUpscaleMap(adapted.modelUpscaleMap),
                  );
                  setStatus(
                    "System workflows on — loader maps adapted from ComfyUI inventory.",
                  );
                  setWorkflowHealthRefresh((n) => n + 1);
                })();
              }
            }}
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Use system workflows
            </span>
            <span className="block text-xs text-zinc-500">
              Queue from the best matching library pack when one scores well,
              otherwise a built-in scaffold. Draft / Final / Max still drive
              sampler, resolution, and polish. Checkpoint/VAE maps still apply.
              For FLUX / Qwen / video, hides the workflow picker while enabled.
              Enabling scans ComfyUI inventory and adapts checkpoint/VAE/upscale maps.
            </span>
          </span>
        </label>

        {sharedSettings.useSystemWorkflows === true ? (
          <label className="mb-3 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={sharedSettings.systemWorkflowsLimitPicker !== false}
              onChange={(event) =>
                updateSharedSettings({
                  systemWorkflowsLimitPicker: event.target.checked,
                })
              }
              disabled={!sharedMounted}
              className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-zinc-200">
                Limit picker to FLUX / Qwen / video
              </span>
              <span className="block text-xs text-zinc-500">
                On (default): snap the model list to system-supported families.
                Off (hybrid): keep SDXL and other models — they use mapped/manual
                workflows while FLUX/Qwen/video still use the system path.
              </span>
            </span>
          </label>
        ) : null}

        {sharedSettings.useSystemWorkflows === true ? (
          <p className="mb-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3 text-xs leading-relaxed text-zinc-500">
            Explicit model→workflow map entries still win at queue time. When a
            model has no map entry, matching pack graphs in your library are
            preferred automatically, otherwise a built-in scaffold is used.
            Expand below to edit the map or pin{" "}
            <code className="rounded bg-zinc-800 px-1 text-violet-300">
              faceDetailer=
            </code>{" "}
            for Gallery → Face detail.
          </p>
        ) : (
          <p className="mb-3 text-sm text-zinc-400">
            One mapping per line:{" "}
            <code className="rounded bg-zinc-800 px-1 text-violet-300">
              modelId=workflowFileId
            </code>
            . When you change the target model in a generator, the mapped workflow
            file is selected automatically.
          </p>
        )}

        {sharedSettings.useSystemWorkflows !== true ? (
          <>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.autoSelectWorkflowForModel !== false}
                onChange={(event) =>
                  updateSharedSettings({
                    autoSelectWorkflowForModel: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-zinc-200">
                  Auto-select workflow when target model changes
                </span>
                <span className="block text-xs text-zinc-500">
                  Uses the map below, or filename-based defaults when no line exists.
                  You can still pick a different workflow manually to override for the
                  session.
                </span>
              </span>
            </label>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.limitModelsToAvailableWorkflows !== false}
                onChange={(event) =>
                  updateSharedSettings({
                    limitModelsToAvailableWorkflows: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-zinc-200">
                  Limit model picker to available workflows
                </span>
                <span className="block text-xs text-zinc-500">
                  Generators only list models that have a workflow in your library or
                  assignment map. Use &quot;Show all models&quot; in a tool sidebar to
                  override temporarily.
                </span>
              </span>
            </label>
          </>
        ) : null}

        {sharedSettings.useSystemWorkflows === true ? (
          <CollapsibleSection
            title="Library map (advanced)"
            summary={
              sharedSettings.systemWorkflowsLimitPicker === false
                ? "SDXL/other hybrid maps, FaceDetailer pin, and explicit overrides."
                : "FaceDetailer pin and explicit model→workflow overrides."
            }
            defaultOpen={sharedSettings.systemWorkflowsLimitPicker === false}
            persistKey="settings-system-workflow-map-advanced"
          >
            <textarea
              value={modelWorkflowMapText}
              onChange={(event) => {
                const text = event.target.value;
                setModelWorkflowMapText(text);
                updateSharedSettings({
                  modelWorkflowMap: parseModelWorkflowMap(text),
                });
              }}
              rows={4}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`faceDetailer=my-facedetailer-workflow.json`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
            />
            <p className="mt-2 text-xs text-zinc-500">
              Pin a FaceDetailer/ReActor graph with{" "}
              <code className="rounded bg-zinc-800 px-1 text-violet-300">
                faceDetailer=&lt;workflowId&gt;
              </code>
              .
            </p>
          </CollapsibleSection>
        ) : (
          <>
            <textarea
              value={modelWorkflowMapText}
              onChange={(event) => {
                const text = event.target.value;
                setModelWorkflowMapText(text);
                updateSharedSettings({
                  modelWorkflowMap: parseModelWorkflowMap(text),
                });
              }}
              rows={6}
              spellCheck={false}
              disabled={!sharedMounted}
              placeholder={`qwen-image-2512=my-qwen-workflow.json\nflux-2-klein=flux-klein-default.json\nfaceDetailer=my-facedetailer-workflow.json`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
            />
            <p className="text-xs text-zinc-500">
              Pin a FaceDetailer/ReActor graph with{" "}
              <code className="rounded bg-zinc-800 px-1 text-violet-300">
                faceDetailer=&lt;workflowId&gt;
              </code>{" "}
              (required for Gallery → Face detail).
            </p>
            <button
              type="button"
              disabled={!sharedMounted}
              onClick={() => {
                const suggested = suggestWorkflowDefaultsByCategory(
                  loadComfyWorkflowFiles(),
                );
                const merged = mergeModelWorkflowMap(
                  loadSettingsCache().shared.modelWorkflowMap,
                  suggested,
                  false,
                );
                updateSharedSettings({ modelWorkflowMap: merged });
                setModelWorkflowMapText(formatModelWorkflowMap(merged));
                setStatus(
                  `Applied ${countMappedModels(merged)} model→workflow mappings from workflow filenames.`,
                );
              }}
              className="mt-3 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 active:scale-[0.99]"
            >
              Apply smart defaults by category
            </button>
          </>
        )}
      </ToolSection>

      <ToolSection id="settings-comfyui-model-assets" title="Model assets">
        <ComfyModelAssetsPanel
          onStatus={setStatus}
          onInstalled={() => {
            void syncLoaderMapsFromComfyInventory();
          }}
        />
      </ToolSection>

      <ToolSection id="settings-comfyui-workflow-patching" title="Workflow patching & checkpoints">
        <p className="text-sm text-zinc-400">
          Direct patching updates <code className="rounded bg-zinc-800 px-1 text-violet-300">EmptyLatentImage</code>{" "}
          and loader nodes at queue time even when placeholders are missing. Disable to compare
          against raw workflow JSON.
        </p>
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.directWorkflowPatching !== false}
            onChange={(event) =>
              updateSharedSettings({
                directWorkflowPatching: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Direct workflow patching on queue
            </span>
            <span className="block text-xs text-zinc-500">
              Patches latent size and checkpoint/UNET/VAE loader filenames from model defaults
              below. KSampler and model-sampling nodes are always patched when params are resolved.
            </span>
          </span>
        </label>
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.syncWorkflowLoadersToModel === true}
            onChange={(event) =>
              updateSharedSettings({
                syncWorkflowLoadersToModel: event.target.checked,
              })
            }
            disabled={!sharedMounted || sharedSettings.directWorkflowPatching === false}
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Sync loaders to model on queue
            </span>
            <span className="block text-xs text-zinc-500">
              Overwrites hardcoded checkpoint/UNET/VAE/CLIP filenames with the target model at
              queue time. Use when switching model families on an imported workflow — otherwise
              leave off to preserve hand-picked weights inside the JSON.
            </span>
          </span>
        </label>
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.workflowQueueOptimize !== false}
            onChange={(event) =>
              updateSharedSettings({
                workflowQueueOptimize: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Optimize workflows on queue
            </span>
            <span className="block text-xs text-zinc-500">
              Auto-binds missing placeholders (prompt, latent, sampler, loaders) on imported
              workflows before injection — turns community JSON into app-controlled templates.
              Use <strong className="font-medium text-zinc-400">Optimize &amp; save copy</strong>{" "}
              in the workflow library to persist the result.
            </span>
          </span>
        </label>
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.compactDraftSaves !== false}
            onChange={(event) =>
              updateSharedSettings({
                compactDraftSaves: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Compact Draft saves (WebP when available)
            </span>
            <span className="block text-xs text-zinc-500">
              On <strong className="font-medium text-zinc-400">Draft</strong>, rewrite SaveImage to a
              WebP-capable custom node when ComfyUI has one installed (e.g. SaveImageExtended).{" "}
              <strong className="font-medium text-zinc-400">Final/Max</strong> stay PNG for keepers.
              Stock SaveImage alone cannot emit WebP — install a save custom node to shrink draft
              files on disk.
            </span>
          </span>
        </label>
        <CompactDraftSavesStatus
          enabled={sharedMounted && sharedSettings.compactDraftSaves !== false}
        />
        <label className="mb-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.workflowGraphEnrich !== false}
            onChange={(event) =>
              updateSharedSettings({
                workflowGraphEnrich: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Insert model-sampling nodes on queue
            </span>
            <span className="block text-xs text-zinc-500">
              For FLUX and SD3-family workflows, inserts{" "}
              <code className="rounded bg-zinc-800 px-1 text-violet-300">ModelSamplingFlux</code>{" "}
              or shift patch nodes when a loader connects directly to KSampler. On{" "}
              <strong className="font-medium text-zinc-400">Final/Max</strong>, SDXL may get a
              latent refiner pass and Flux a soft latent detail pass (vanilla Qwen skips that —
              anatomy guard); outputs then get neural or Lanczos upscale capped to ~1.25×/1.5×
              net (vanilla 2512 stays Lanczos-only; Max Lanczos polish + Max sharpen when enabled).
            </span>
          </span>
        </label>
        {sharedSettings.workflowGraphEnrich !== false ? (
          <div className="mb-4 ml-7 space-y-2 border-l border-zinc-800 pl-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.workflowSdxlRefinerEnrich !== false}
                onChange={(event) =>
                  updateSharedSettings({
                    workflowSdxlRefinerEnrich: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm text-zinc-300">SDXL refiner pass (Final/Max)</span>
                <span className="block text-xs text-zinc-500">
                  Latent upscale + refiner KSampler before VAEDecode when a refiner map is configured.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.workflowNeuralUpscalePolish !== false}
                onChange={(event) =>
                  updateSharedSettings({
                    workflowNeuralUpscalePolish: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm text-zinc-300">Lanczos polish after neural upscale (Max)</span>
                <span className="block text-xs text-zinc-500">
                  Chains a 1.05× Lanczos pass after UpscaleModel on Max profile.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.workflowSharpenAfterUpscale === true}
                onChange={(event) =>
                  updateSharedSettings({
                    workflowSharpenAfterUpscale: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm text-zinc-300">Subtle sharpen after upscale (Max)</span>
                <span className="block text-xs text-zinc-500">
                  ImageSharpen after neural UpscaleModel on Max quality (not Lanczos-only).
                  On by default for Max; uncheck if edges look waxy. Qwen/Klein use a lighter alpha.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.useLibraryUpscaleWorkflow === true}
                onChange={(event) =>
                  updateSharedSettings({
                    useLibraryUpscaleWorkflow: event.target.checked,
                  })
                }
                disabled={!sharedMounted}
                className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
              />
              <span className="space-y-1">
                <span className="block text-sm text-zinc-300">Prefer library upscale workflows</span>
                <span className="block text-xs text-zinc-500">
                  Gallery upscale actions use a mapped library workflow with UpscaleModel nodes when available instead of the minimal scaffold.
                </span>
              </span>
            </label>
            <label className="block space-y-2">
              <span className="block text-sm text-zinc-300">Neural upscale tile size (Max)</span>
              <span className="block text-xs text-zinc-500">
                Only applied when ComfyUI’s ImageUpscaleWithModel declares tile_size. Set 0 to disable.
              </span>
              <input
                type="number"
                min={0}
                max={2048}
                step={64}
                value={sharedSettings.neuralUpscaleTileSize ?? 512}
                onChange={(event) =>
                  updateSharedSettings({
                    neuralUpscaleTileSize: Number(event.target.value),
                  })
                }
                disabled={!sharedMounted}
                className={`ui-input w-32 ${accentFocusClass(ACCENT)}`}
              />
            </label>
          </div>
        ) : null}
        <div className="mb-4 space-y-2">
          <p className="text-sm font-medium text-zinc-200">Per-tool queue quality</p>
          <p className="text-xs text-zinc-500">
            Set default Draft / Final / Max profiles for individual tools. Overrides the global
            sidebar profile when that tool queues to ComfyUI.
          </p>
          <ToolQualityProfilesSettings
            profiles={sharedSettings.toolQueueQualityProfiles ?? {}}
            disabled={!sharedMounted}
            onChange={(toolQueueQualityProfiles) =>
              updateSharedSettings({ toolQueueQualityProfiles })
            }
          />
        </div>
        <p className="mb-2 text-sm text-zinc-400">
          Checkpoint map — one line per model:{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">modelId=filename.safetensors</code>
          . Used for both CheckpointLoader and UNETLoader when a workflow has those nodes.
        </p>
        <textarea
          value={modelCheckpointMapText}
          onChange={(event) => {
            const text = event.target.value;
            setModelCheckpointMapText(text);
            updateSharedSettings({
              modelCheckpointMap: parseModelCheckpointMap(text),
            });
          }}
          rows={5}
          spellCheck={false}
          disabled={!sharedMounted}
          placeholder={`qwen-image-2512=qwen_image_2512_bf16.safetensors\nflux-2-klein-9b=flux-2-klein-9b.safetensors`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!sharedMounted}
            onClick={applySuggestedLoaderMaps}
            className={`rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 transition hover:bg-violet-500/20 ${accentFocusClass(ACCENT)}`}
          >
            Merge suggested loader maps
          </button>
          <button
            type="button"
            disabled={!sharedMounted}
            onClick={() => void syncLoaderMapsFromComfyInventory()}
            className={`rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 transition hover:bg-emerald-500/20 ${accentFocusClass(ACCENT)}`}
          >
            Sync from ComfyUI inventory
          </button>
        </div>
        {loaderMapMergeHint ? (
          <p className="mt-2 text-xs leading-relaxed text-emerald-300/90">{loaderMapMergeHint}</p>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Suggested maps are applied automatically on load. Use this button after clearing a map
            or on a new install — feedback appears here.
          </p>
        )}
        <p className="mb-2 mt-4 text-sm text-zinc-400">
          VAE map — override{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">{"{{VAE}}"}</code> /{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">VAELoader</code> filenames
          per model. FLUX Klein workflows often need{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">flux2-vae.safetensors</code>{" "}
          or{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">FLUX.2-klein-9B.safetensors</code>{" "}
          depending on your ComfyUI install.
        </p>
        <textarea
          value={modelVaeMapText}
          onChange={(event) => {
            const text = event.target.value;
            setModelVaeMapText(text);
            updateSharedSettings({
              modelVaeMap: parseModelVaeMap(text),
            });
          }}
          rows={3}
          spellCheck={false}
          disabled={!sharedMounted}
          placeholder={`flux-2-klein-9b=flux2-vae.safetensors\ndefault=flux2-vae.safetensors`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
        />
        <p className="mb-2 mt-4 text-sm text-zinc-400">
          SDXL refiner map — checkpoint for the hi-res refiner pass on{" "}
          <strong className="font-medium text-zinc-300">Final/Max</strong> SDXL queues (
          <code className="rounded bg-zinc-800 px-1 text-violet-300">sd_xl_refiner_1.0.safetensors</code>{" "}
          by default). Inserts latent upscale + refiner KSampler before VAEDecode on single-pass base
          workflows.
        </p>
        <textarea
          value={modelRefinerMapText}
          onChange={(event) => {
            const text = event.target.value;
            setModelRefinerMapText(text);
            updateSharedSettings({
              modelRefinerMap: parseModelRefinerMap(text),
            });
          }}
          rows={3}
          spellCheck={false}
          disabled={!sharedMounted}
          placeholder={`sdxl=sd_xl_refiner_1.0.safetensors\ndefault=sd_xl_refiner_1.0.safetensors`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
        />
        <p className="mb-2 mt-4 text-sm text-zinc-400">
          Upscale model map — optional. Leave empty to use Lanczos upscale on Final/Max. Set{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">default=your-model.pth</code>{" "}
          only when the file exists in ComfyUI{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">models/upscale_models/</code>.
          Patches <code className="rounded bg-zinc-800 px-1 text-violet-300">UpscaleModel</code> nodes
          and replaces{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">{"{{UPSCALE_MODEL}}"}</code>{" "}
          placeholders at queue time.
        </p>
        <textarea
          value={modelUpscaleMapText}
          onChange={(event) => {
            const text = event.target.value;
            setModelUpscaleMapText(text);
            updateSharedSettings({
              modelUpscaleMap: parseModelUpscaleMap(text),
            });
          }}
          rows={3}
          spellCheck={false}
          disabled={!sharedMounted}
          placeholder={`# Final/Max neural upscale (must exist in models/upscale_models/)\ndefault=4x-UltraSharp.pth\nqwen-image-2512=4x_NMKD-Siax_200k.pth\nflux-dev=4x-UltraSharp.pth`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
        />
        <p className="mb-2 mt-4 text-sm text-zinc-400">
          ControlNet model map — optional. Patches{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">ControlNetLoader</code> nodes and replaces{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">{"{{CONTROLNET_MODEL}}"}</code> at queue time.
        </p>
        <textarea
          value={modelControlNetMapText}
          onChange={(event) => {
            const text = event.target.value;
            setModelControlNetMapText(text);
            updateSharedSettings({
              modelControlNetMap: parseModelControlNetMap(text),
            });
          }}
          rows={3}
          spellCheck={false}
          disabled={!sharedMounted}
          placeholder={`# optional — file in ComfyUI models/controlnet/\ndefault=control_v11p_sd15_openpose.pth`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
        />
        <p className="mb-2 mt-4 text-sm text-zinc-400">
          Model LoRA map — default library entries per model:{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            modelId=loraId1,loraId2
          </code>
          . Values are{" "}
          <strong className="font-medium text-zinc-300">library ids</strong> from the LoRA
          library panel (not filenames). Empty value (
          <code className="rounded bg-zinc-800 px-1 text-violet-300">modelId=</code>
          ) means no LoRAs for that model. Applied when the session picker is still following
          defaults.
        </p>
        <textarea
          value={modelLoraMapText}
          onChange={(event) => {
            const text = event.target.value;
            setModelLoraMapText(text);
            updateSharedSettings({
              modelLoraMap: parseModelLoraMap(text),
            });
          }}
          rows={4}
          spellCheck={false}
          disabled={!sharedMounted}
          placeholder={`# library ids from Settings → LoRA library\nwan-video=skin,motion\nflux-dev=`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
        />
        <label className="mb-3 mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.autoSelectLorasForModel !== false}
            onChange={(event) =>
              updateSharedSettings({
                autoSelectLorasForModel: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Auto-select LoRAs for model
            </span>
            <span className="block text-xs text-zinc-500">
              When you change the target model, load that model&apos;s stored LoRA
              picks (or the map above). Explicit picks are remembered per model and
              never overwrite another model&apos;s stack.
            </span>
          </span>
        </label>
        <label className="mt-4 block space-y-2">
          <span className="block text-sm font-medium text-zinc-200">Edit denoise strength</span>
          <span className="block text-xs text-zinc-500">
            Applied when queueing with an input image or from Refine / Image → Prompt. FLUX Inpaint
            uses 0.75 by default; other edit flows use this value (0.05–1).
          </span>
          <input
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={sharedSettings.editDenoiseStrength ?? 0.65}
            onChange={(event) =>
              updateSharedSettings({
                editDenoiseStrength: Number(event.target.value),
              })
            }
            disabled={!sharedMounted}
            className={`ui-input w-32 ${accentFocusClass(ACCENT)}`}
          />
        </label>
        <label className="mt-4 block space-y-2">
          <span className="block text-sm font-medium text-zinc-200">
            Face detail denoise
          </span>
          <span className="block text-xs text-zinc-500">
            Gallery → Face detail strength for{" "}
            <code className="rounded bg-zinc-800 px-1 text-violet-300">
              {"{{FACE_DETAIL_DENOISE}}"}
            </code>{" "}
            (0.05–1). Requires a pinned FaceDetailer/ReActor workflow.
          </span>
          <input
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={sharedSettings.faceDetailerDenoise ?? 0.35}
            onChange={(event) =>
              updateSharedSettings({
                faceDetailerDenoise: Number(event.target.value),
              })
            }
            disabled={!sharedMounted}
            className={`ui-input w-32 ${accentFocusClass(ACCENT)}`}
          />
        </label>
        <FaceDetailerHealthChip refreshKey={workflowHealthRefresh} />
        <IdentityPackHealthChips refreshKey={workflowHealthRefresh} />
      </ToolSection>

      <ToolSection
        id="settings-comfyui-ipadapter"
        title="IP-Adapter identity reference"
      >
        <p className="text-sm text-zinc-400">
          Session-wide identity/style reference (not Image → Prompt&apos;s text
          multi-ref). At queue time, with a reference image set, the app updates
          existing{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            {DEFAULT_IPADAPTER_IMAGE_TOKEN}
          </code>
          {" / "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            {DEFAULT_IPADAPTER_STRENGTH_TOKEN}
          </code>
          {" / "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            {DEFAULT_IPADAPTER_MODEL_TOKEN}
          </code>{" "}
          tokens <strong className="font-medium text-zinc-300">or auto-inserts</strong> a
          minimal LoadImage → IPAdapterModelLoader → IPAdapterAdvanced chain when
          none exist. Requires ComfyUI-IPAdapter-Plus-class nodes installed.
          Extra reference filenames stack additional Apply nodes. When IP-Adapter
          Plus is missing but InstantID/PuLID nodes are installed, Studio falls
          back to auto-inserting those instead. You can also import a BYO InstantID
          / PuLID scaffold from the Workflow library.
        </p>

        <div className="space-y-2">
          <FieldLabel htmlFor="settings-ipadapter-image">Reference image filename</FieldLabel>
          <input
            id="settings-ipadapter-image"
            value={sharedSettings.ipAdapterImageFilename ?? ""}
            onChange={(event) =>
              updateSharedSettings({ ipAdapterImageFilename: event.target.value })
            }
            placeholder="already-uploaded-file.png (or upload below)"
            disabled={!sharedMounted}
            className={`ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body ${accentFocusClass(ACCENT)}`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">
              {ipAdapterUploading ? "Uploading…" : "Upload reference image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!sharedMounted || ipAdapterUploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  setIpAdapterUploading(true);
                  setIpAdapterUploadStatus(null);
                  void uploadComfyInputImage({ file, model: sharedSettings.model })
                    .then((uploaded) => {
                      updateSharedSettings({ ipAdapterImageFilename: uploaded.name });
                      setIpAdapterUploadStatus(`Uploaded as ${uploaded.name}.`);
                    })
                    .catch((err) => {
                      setIpAdapterUploadStatus(
                        err instanceof Error ? err.message : "Upload failed.",
                      );
                    })
                    .finally(() => setIpAdapterUploading(false));
                }}
              />
            </label>
            {ipAdapterUploadStatus ? (
              <span className="text-xs text-zinc-500">{ipAdapterUploadStatus}</span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <FieldLabel htmlFor="settings-ipadapter-extra">
            Extra reference filenames (multi-ref stack)
          </FieldLabel>
          <input
            id="settings-ipadapter-extra"
            value={(sharedSettings.ipAdapterImageFilenames ?? []).join(", ")}
            onChange={(event) => {
              const names = event.target.value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean);
              updateSharedSettings({
                ipAdapterImageFilenames: names.length > 0 ? names : undefined,
                ...(names[0] && !sharedSettings.ipAdapterImageFilename?.trim()
                  ? { ipAdapterImageFilename: names[0] }
                  : {}),
              });
            }}
            placeholder="ref-a.png, ref-b.png (comma-separated; index 0 can mirror the primary)"
            disabled={!sharedMounted}
            className={`ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body ${accentFocusClass(ACCENT)}`}
          />
          <p className="text-xs text-zinc-500">
            Two or more filenames stack additional IPAdapterAdvanced nodes onto the
            sampler model chain at queue time.
          </p>
        </div>

        <label className="mt-4 block space-y-2">
          <span className="block text-sm font-medium text-zinc-200">
            Strength — {(sharedSettings.ipAdapterStrength ?? 0.6).toFixed(2)}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sharedSettings.ipAdapterStrength ?? 0.6}
            onChange={(event) =>
              updateSharedSettings({ ipAdapterStrength: Number(event.target.value) })
            }
            disabled={!sharedMounted}
            className={`w-full accent-violet-500 ${accentFocusClass(ACCENT)}`}
          />
        </label>

        <div className="mt-4 space-y-2">
          <FieldLabel htmlFor="settings-ipadapter-model">
            IP-Adapter model filename (optional)
          </FieldLabel>
          <input
            id="settings-ipadapter-model"
            value={sharedSettings.ipAdapterModelFilename ?? ""}
            onChange={(event) =>
              updateSharedSettings({ ipAdapterModelFilename: event.target.value })
            }
            placeholder="ip-adapter-plus_sdxl.safetensors (leave blank to keep the workflow's default)"
            disabled={!sharedMounted}
            className={`ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body ${accentFocusClass(ACCENT)}`}
          />
        </div>
      </ToolSection>

      <ToolSection
        id="settings-comfyui-wildcards"
        title="Custom wildcard lists"
      >
        <WildcardListsEditor
          lists={sharedSettings.wildcardLists}
          disabled={!sharedMounted}
          focusClassName={accentFocusClass(ACCENT)}
          onChange={(wildcardLists) =>
            updateSharedSettings({
              wildcardLists:
                Object.keys(wildcardLists).length > 0 ? wildcardLists : undefined,
            })
          }
        />
      </ToolSection>

      <div id="settings-comfyui-workflow-library" className="scroll-mt-28 space-y-6">
      <ComfyWorkflowLibraryPanel
        placeholderTokens={placeholderTokensFromSettings(settings)}
        onStatus={(msg) => {
          setStatus(msg);
          setWorkflowHealthRefresh((n) => n + 1);
        }}
      />

      <WorkflowHealthPanel refreshKey={workflowHealthRefresh} />

      <WorkflowDiffPanel />
      </div>

      <ToolSection id="settings-comfyui-lora-library" title="LoRA library">
        <LoraLibrarySettingsPanel
          library={settings.loraLibrary}
          comfyUrl={settings.apiUrl}
          onChange={(loraLibrary) => updateSettings({ loraLibrary })}
        />
      </ToolSection>

      <ToolSection
        id="settings-comfyui-lora-train"
        title="LoRA train loop"
        description="External trainer jobs — webhook or command — then register weights into the library."
      >
        <LoraTrainPanel onStatus={setStatus} />
      </ToolSection>

      <ToolSection id="settings-comfyui-connection" title="ComfyUI connection & injection">
        <p className="text-sm text-zinc-400">
          Override the server&apos;s{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            COMFYUI_*
          </code>{" "}
          env vars for this browser: API URL, placeholder tokens, queue params, and
          an optional fallback workflow when no library file is selected.
        </p>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.useServerDefaults}
            onChange={(event) =>
              updateSettings({ useServerDefaults: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Use server defaults (ignore local ComfyUI overrides)
        </label>

        <div
          className={`grid gap-4 ${settings.useServerDefaults ? "pointer-events-none opacity-50" : ""}`}
        >
          <div className="space-y-1">
            <label htmlFor="comfy-url" className="text-xs text-zinc-400">
              ComfyUI API URL
            </label>
            <input
              id="comfy-url"
              value={settings.apiUrl ?? ""}
              onChange={(event) => updateSettings({ apiUrl: event.target.value })}
              placeholder="http://127.0.0.1:8188"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="positive-token" className="text-xs text-zinc-400">
                Positive placeholder token
              </label>
              <input
                id="positive-token"
                value={settings.positiveToken ?? ""}
                onChange={(event) =>
                  updateSettings({ positiveToken: event.target.value })
                }
                placeholder="{{POSITIVE}}"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="negative-token" className="text-xs text-zinc-400">
                Negative placeholder token (optional)
              </label>
              <input
                id="negative-token"
                value={settings.negativeToken ?? ""}
                onChange={(event) =>
                  updateSettings({ negativeToken: event.target.value })
                }
                placeholder="{{NEGATIVE}}"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-zinc-400">Queue parameter placeholders</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["seed", "Seed (empty = random per job)"],
                  ["width", "Width"],
                  ["height", "Height"],
                  ["cfg", "CFG"],
                  ["steps", "Steps"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs text-zinc-400">
                  {label}
                  <input
                    value={settings.queueParams?.[key]?.toString() ?? ""}
                    onChange={(event) => updateQueueParam(key, event.target.value)}
                    placeholder={
                      key === "seed"
                        ? "random"
                        : key === "width" || key === "height"
                          ? "1024"
                          : key === "cfg"
                            ? "7"
                            : "20"
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-zinc-600">
              Use tokens in workflow JSON:{" "}
              {WORKFLOW_PARAM_TOKEN_HELP.map((token) => (
                <code
                  key={token}
                  className="mr-1 rounded bg-zinc-800 px-1 text-violet-300"
                >
                  {token}
                </code>
              ))}
            </p>
          </div>

          <CollapsibleSection
            title="Custom tokens"
            summary="Named {{TOKEN}} placeholders for workflow injection."
            defaultOpen={false}
            persistKey="settings-custom-tokens-lora"
          >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">Custom workflow tokens</p>
              <button
                type="button"
                onClick={addCustomToken}
                className="text-xs text-violet-300 hover:text-violet-200"
              >
                Add token
              </button>
            </div>
            {(settings.customTokens ?? []).length === 0 ? (
              <p className="text-xs text-zinc-600">
                Optional placeholders like{" "}
                <code className="rounded bg-zinc-800 px-1 text-violet-300">
                  {"{{CHECKPOINT}}"}
                </code>{" "}
                or{" "}
                <code className="rounded bg-zinc-800 px-1 text-violet-300">
                  {"{{LORA}}"}
                </code>
                . LoRA files live in the{" "}
                <button
                  type="button"
                  onClick={() => handleComfyUiSectionJump("lora-library")}
                  className="text-violet-300 underline-offset-2 hover:underline"
                >
                  LoRA library
                </button>{" "}
                section.
              </p>
            ) : (
              <ul className="space-y-2">
                {(settings.customTokens ?? []).map((entry, index) => (
                  <li
                    key={`${entry.token}-${index}`}
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      value={entry.token}
                      onChange={(event) =>
                        updateCustomToken(index, { token: event.target.value })
                      }
                      placeholder="{{CHECKPOINT}}"
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
                    />
                    <input
                      value={entry.value}
                      onChange={(event) =>
                        updateCustomToken(index, { value: event.target.value })
                      }
                      placeholder="flux1-dev.safetensors"
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomToken(index)}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:border-rose-500 hover:text-rose-200"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Fallback workflow & preview"
            summary="Optional JSON fallback and dry-run injection preview."
            defaultOpen={false}
            persistKey="settings-fallback-workflow"
          >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="workflow-json" className="text-xs text-zinc-400">
                Fallback workflow JSON (optional)
              </label>
              <label className="cursor-pointer text-xs text-violet-300 hover:text-violet-200">
                Import into editor
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleImportWorkflow(file);
                    }
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-zinc-600">
              Used only when no workflow file is selected in the library above. For
              multiple workflows, import them into the library instead.
            </p>
            <textarea
              id="workflow-json"
              value={settings.workflowJson ?? ""}
              onChange={(event) => {
                updateSettings({ workflowJson: event.target.value });
                setWorkflowError(null);
              }}
              rows={12}
              spellCheck={false}
              placeholder={`Paste exported ComfyUI API JSON here.\nUse ${settings.positiveToken ?? "{{POSITIVE}}"} and ${settings.negativeToken ?? "{{NEGATIVE}}"} anywhere prompts should be injected.`}
              className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
            />
            <FieldError>{workflowError}</FieldError>
            {workflowValidation && (
              <p className="text-xs text-zinc-500">
                {workflowValidation.ok ? (
                  <>
                    Placeholders: {workflowValidation.placeholders?.positive ?? 0}×{" "}
                    {settings.positiveToken}
                    {(workflowValidation.placeholders?.negative ?? 0) > 0
                      ? ` · ${workflowValidation.placeholders?.negative}× ${settings.negativeToken}`
                      : ""}
                    {workflowValidation.nodeIds?.length
                      ? ` · nodes: ${workflowValidation.nodeIds.join(", ")}`
                      : ""}
                  </>
                ) : (
                  <span className="text-amber-400/90">{workflowValidation.error}</span>
                )}
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-cyan-900/30 bg-zinc-950/40 p-4">
            <div className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-cyan-300/90">
                Workflow dry-run preview
              </h3>
              <p className="text-xs text-zinc-500">
                Test placeholder injection without queueing a ComfyUI job. Uses the
                current settings above (save first if you changed them recently).
              </p>
            </div>
            <TextArea
              value={previewPrompt}
              onChange={(event) => setPreviewPrompt(event.target.value)}
              rows={3}
              className={accentFocusClass(ACCENT)}
            />
            <button
              type="button"
              disabled={previewLoading || !previewPrompt.trim()}
              onClick={() => void handlePreviewWorkflow()}
              className="rounded-lg border border-cyan-700/60 px-4 py-2 text-sm text-cyan-200 hover:border-cyan-500 disabled:opacity-50"
            >
              {previewLoading ? "Previewing…" : "Preview injection"}
            </button>
            <WorkflowPreviewPanel
              loading={previewLoading}
              error={previewError}
              preview={workflowPreview}
            />
          </div>
          </CollapsibleSection>
        </div>

        <ToolSection id="settings-comfyui-auto-improve" title="Auto-improve on gallery ratings">
          <p className="text-sm text-zinc-400">
            Rating-driven queue actions. Prefer the calm preset if you do not want
            surprise Max jobs.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                updateSettings({
                  autoRequeueFinalOnHighRating: true,
                  autoRequeueMaxOnFiveStar: false,
                  autoImg2imgRefineOnFiveStar: false,
                  autoMutateOnHighRating: false,
                  autoSeedExperimentOnHighRating: false,
                  autoRefineOnLowRating: true,
                });
                setStatus("Auto-improve preset: calm (Final on 4–5★, Max off).");
              }}
            >
              Calm preset
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                updateSettings({
                  autoRequeueFinalOnHighRating: true,
                  autoRequeueMaxOnFiveStar: true,
                  autoImg2imgRefineOnFiveStar: false,
                  autoMutateOnHighRating: false,
                  autoSeedExperimentOnHighRating: false,
                  autoRefineOnLowRating: true,
                });
                setStatus("Auto-improve preset: aggressive (Final + Max).");
              }}
            >
              Aggressive preset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                updateSettings({
                  autoRequeueFinalOnHighRating: false,
                  autoRequeueMaxOnFiveStar: false,
                  autoImg2imgRefineOnFiveStar: false,
                  autoMutateOnHighRating: false,
                  autoSeedExperimentOnHighRating: false,
                  autoRefineOnLowRating: false,
                });
                setStatus("Auto-improve disabled.");
              }}
            >
              Off
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.autoRequeueFinalOnHighRating !== false}
              onChange={(event) =>
                updateSettings({ autoRequeueFinalOnHighRating: event.target.checked })
              }
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
            />
            Auto improve 4–5★ → Final (upscale / moiré / Lightning re-seed)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.autoRequeueMaxOnFiveStar !== false}
              onChange={(event) =>
                updateSettings({ autoRequeueMaxOnFiveStar: event.target.checked })
              }
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
            />
            Auto improve 5★ → Max
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.autoImg2imgRefineOnFiveStar === true}
              onChange={(event) =>
                updateSettings({ autoImg2imgRefineOnFiveStar: event.target.checked })
              }
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
            />
            After 5★ upscale, also queue low-denoise refine (experimental)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.autoRefineOnLowRating !== false}
              onChange={(event) =>
                updateSettings({ autoRefineOnLowRating: event.target.checked })
              }
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
            />
            Auto-open Refine when rated 1–2★
          </label>
        </ToolSection>

        <CollapsibleSection
          title="Queue automation & notifications"
          summary="Auto-save, mutate/seed fallbacks, WebSocket progress, and browser alerts."
          defaultOpen={false}
          persistKey="settings-queue-automation"
        >
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.autoSaveHistoryOnQueue !== false}
            onChange={(event) =>
              updateSettings({ autoSaveHistoryOnQueue: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Auto-save to history when queueing from result panels (skips if already saved)
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={sharedSettings.promptVersioningEnabled !== false}
            onChange={(event) =>
              updateSharedSettings({
                promptVersioningEnabled: event.target.checked,
              })
            }
            disabled={!sharedMounted}
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Named prompt versions (vN labels + lineage on history saves)
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.autoMutateOnHighRating ?? false}
            onChange={(event) =>
              updateSettings({ autoMutateOnHighRating: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Auto-queue mutations when a gallery output is rated 4–5★
          (fallback when Final/Max improve is off or fails)
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.autoSeedExperimentOnHighRating ?? false}
            onChange={(event) =>
              updateSettings({ autoSeedExperimentOnHighRating: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Auto-queue seed experiments when a gallery output is rated 4–5★
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.autoSeedExperimentOnFavorite ?? false}
            onChange={(event) =>
              updateSettings({ autoSeedExperimentOnFavorite: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Auto-queue seed experiments when an output is favorited
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.autoNegativeOnQueue !== false}
            onChange={(event) =>
              updateSettings({ autoNegativeOnQueue: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Auto-generate negative prompt when queueing SD-family models
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.useWebSocketProgress !== false}
            onChange={(event) =>
              updateSettings({ useWebSocketProgress: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Use ComfyUI WebSocket for faster job progress updates
        </label>

        <div className="ui-surface-inset space-y-2">
          <p className="text-xs font-medium text-zinc-300">Negative profile library</p>
          <select
            value={settings.selectedNegativeProfileId ?? "general-sd"}
            onChange={(event) =>
              updateSettings({ selectedNegativeProfileId: event.target.value })
            }
            className="ui-input w-full px-3 py-2 text-sm"
          >
            {(settings.negativeProfiles?.length
              ? settings.negativeProfiles
              : DEFAULT_NEGATIVE_PROFILES
            ).map((profile: NegativeProfile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              updateSettings({
                negativeProfiles: DEFAULT_NEGATIVE_PROFILES,
              })
            }
            className="text-xs text-violet-300 hover:text-violet-200"
          >
            Reset profiles to defaults
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.notifyOnComplete ?? false}
            disabled={notificationPermission === "unsupported"}
            onChange={(event) =>
              updateSettings({ notifyOnComplete: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Notify when ComfyUI jobs complete
          {notificationPermission !== "granted" &&
            notificationPermission !== "unsupported" && (
              <button
                type="button"
                onClick={() => void handleEnableNotifications()}
                className="text-xs text-violet-300 hover:text-violet-200"
              >
                Enable permission
              </button>
            )}
        </label>
        {notificationPermission === "unsupported" && (
          <p className="text-xs text-zinc-600">
            Browser notifications are not supported in this environment.
          </p>
        )}

        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.autoVisionTags !== false}
            onChange={(event) =>
              updateSettings({ autoVisionTags: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Auto-tag completed gallery images with vision LLM tags (also on LLM tab)
        </label>
        </CollapsibleSection>

        <div className="flex flex-wrap gap-2 text-sm">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            disabled={!mounted}
            onClick={handleSaveComfySettings}
          >
            Save ComfyUI settings
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void refreshHealth()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-zinc-500"
          >
            Test connection
          </button>
          <button
            type="button"
            onClick={handleResetComfySettings}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            Reset to server defaults
          </button>
        </div>

        <p className="text-xs text-zinc-600">
          Export a workflow from ComfyUI (Save API format), put{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            {settings.positiveToken ?? "{{POSITIVE}}"}
          </code>{" "}
          (and optionally{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            {settings.negativeToken ?? "{{NEGATIVE}}"}
          </code>
          ) in any string field where prompts should land—CLIP text inputs, custom node
          fields, filenames, etc.
        </p>
      </ToolSection>

      <ToolSection id="settings-comfyui-queue-params" title="Queue parameters">
        <QueueParamsPanel />
      </ToolSection>

      <SettingsPromptQualityPanel
        sharedSettings={sharedSettings}
        sharedMounted={sharedMounted}
        updateSharedSettings={updateSharedSettings}
        freeVramGb={
          typeof health?.comfyui.vram?.free === "number"
            ? health.comfyui.vram.free / 1e9
            : null
        }
        totalVramGb={
          typeof health?.comfyui.vram?.total === "number"
            ? health.comfyui.vram.total / 1e9
            : null
        }
      />

      <ToolSection id="settings-comfyui-hold-max" title="Queue Max hold">
        <p className="text-sm text-zinc-400">
          When on, Max Generate / re-queue / Upscale / Moiré / Refine wait until the ComfyUI
          queue is idle, then flush from Queue → Orchestration.
        </p>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={sharedSettings.holdMaxUntilIdle === true}
            onChange={(event) => {
              updateSharedSettings({ holdMaxUntilIdle: event.target.checked });
              setStatus(
                event.target.checked
                  ? "Hold Max until idle enabled."
                  : "Hold Max until idle disabled.",
              );
            }}
            className={`mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 ${accentFocusClass(ACCENT)}`}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-zinc-200">
              Hold Max until idle
            </span>
            <span className="block text-xs text-zinc-500">
              Avoid stacking Max enrich while ComfyUI is already busy. Also shown on Queue →
              Orchestration.
            </span>
          </span>
        </label>
      </ToolSection>

      <ToolSection id="settings-comfyui-sampler-memory" title="Sampler memory">
        <p className="text-sm text-zinc-400">
          4–5★ gallery ratings remember per-model CFG / steps / sampler / scheduler for the
          next queue (Lightning and Rapid AIO stay CFG-1).
        </p>
        {(() => {
          const memory = sharedSettings.modelSamplerMemory ?? {};
          const entries = Object.entries(memory).sort(([a], [b]) => a.localeCompare(b));
          if (entries.length === 0) {
            return (
              <EmptyState
                compact
                icon="inbox"
                title="No sampler memory yet"
                description="Rate a completed gallery image 4–5★ to remember its sampler params for that model."
              />
            );
          }
          return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    updateSharedSettings({ modelSamplerMemory: {} });
                    setStatus("Cleared all sampler memory.");
                  }}
                >
                  Clear all
                </Button>
              </div>
              <ul className="space-y-2">
                {entries.map(([model, remembered]) => (
                  <li
                    key={model}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm text-zinc-200">{model}</p>
                      <p className="type-caption text-zinc-500">
                        {[
                          remembered.cfg ? `CFG ${remembered.cfg}` : null,
                          remembered.steps ? `${remembered.steps} steps` : null,
                          remembered.samplerName,
                          remembered.scheduler,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = { ...(sharedSettings.modelSamplerMemory ?? {}) };
                        delete next[model];
                        updateSharedSettings({ modelSamplerMemory: next });
                        setStatus(`Cleared sampler memory for ${model}.`);
                      }}
                    >
                      Clear
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </ToolSection>
      </>
      )}

      {tab === "automation" && (
      <>
      <ToolSection title="Webhooks">
        <p className="text-sm text-zinc-400">
          POST ComfyUI job completion events to an external URL (via server proxy).
        </p>
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={webhookSettings.enabled}
            onChange={(event) => {
              const next = { ...webhookSettings, enabled: event.target.checked };
              setWebhookSettings(next);
              saveWebhookSettings(next);
            }}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Enable webhooks
        </label>
        <FieldLabel htmlFor="webhook-url">Webhook URL</FieldLabel>
        <input
          id="webhook-url"
          value={webhookSettings.url ?? ""}
          onChange={(event) => {
            const next = { ...webhookSettings, url: event.target.value };
            setWebhookSettings(next);
            saveWebhookSettings(next);
          }}
          placeholder="https://example.com/hooks/comfyui"
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
        <FieldLabel htmlFor="webhook-secret">Shared secret (optional)</FieldLabel>
        <input
          id="webhook-secret"
          value={webhookSettings.secret ?? ""}
          onChange={(event) => {
            const next = { ...webhookSettings, secret: event.target.value };
            setWebhookSettings(next);
            saveWebhookSettings(next);
          }}
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
        <FieldLabel htmlFor="webhook-template">Payload template</FieldLabel>
        <select
          id="webhook-template"
          value={webhookSettings.template ?? "generic"}
          onChange={(event) => {
            const next = {
              ...webhookSettings,
              template: event.target.value as WebhookSettings["template"],
            };
            setWebhookSettings(next);
            saveWebhookSettings(next);
          }}
          className="ui-input w-full max-w-xs"
        >
          <option value="generic">Generic JSON</option>
          <option value="discord">Discord embed</option>
          <option value="slack">Slack blocks</option>
        </select>
      </ToolSection>

      <ToolSection title="Avoided tokens">
        <p className="text-sm text-zinc-400">
          Motifs to steer generators away from. Low gallery ratings append tokens
          automatically; manage the list here.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            id="settings-avoided-token-draft"
            value={avoidedTokenDraft}
            onChange={(event) => setAvoidedTokenDraft(event.target.value)}
            placeholder="Add token"
            className="ui-input min-w-[180px] flex-1 px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
          <Button
            variant="secondary"
            disabled={!avoidedTokenDraft.trim()}
            onClick={() => {
              addAvoidedToken(avoidedTokenDraft);
              setAvoidedTokenDraft("");
              setStatus(`Added “${avoidedTokenDraft.trim()}” to avoided tokens.`);
            }}
          >
            Add
          </Button>
          <Button
            variant="secondary"
            disabled={avoidedTokens.length === 0}
            onClick={() => {
              clearAvoidedTokens();
              setStatus("Cleared avoided tokens.");
            }}
          >
            Clear all
          </Button>
          <Button
            variant="secondary"
            disabled={avoidedTokens.length === 0}
            onClick={() => {
              downloadAvoidedTokensExport();
              setStatus("Avoided tokens exported.");
            }}
          >
            Export JSON
          </Button>
          <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500">
            Import JSON
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
                  const merge = window.confirm(
                    "Merge imported tokens into the list? Cancel replaces the full list.",
                  );
                  const count = importAvoidedTokensJson(raw, merge ? "merge" : "replace");
                  setStatus(`Imported ${count} avoided token(s).`);
                });
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {avoidedTokens.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title="No avoided tokens yet"
            description="Add motifs to steer generators away from, or rate low Gallery outputs so tokens append automatically."
            action={{
              label: "Add a token",
              onClick: () => {
                document.getElementById("settings-avoided-token-draft")?.focus();
              },
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {avoidedTokens.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => {
                  removeAvoidedToken(token);
                  setStatus(`Removed “${token}”.`);
                }}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-rose-500/60 hover:text-rose-200"
                title="Click to remove"
              >
                {token} ×
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 space-y-2">
          <FieldLabel htmlFor="avoidance-preview-prompt">Avoidance preview</FieldLabel>
          <TextArea
            id="avoidance-preview-prompt"
            rows={3}
            value={avoidancePreviewPrompt}
            onChange={(event) => setAvoidancePreviewPrompt(event.target.value)}
            placeholder="Paste a prompt to see which avoided tokens match and the LLM instruction line."
            className={accentFocusClass()}
          />
          <Button
            variant="secondary"
            disabled={!avoidancePreviewPrompt.trim()}
            onClick={() => {
              void fetch("/api/avoidance/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: avoidancePreviewPrompt }),
              })
                .then((response) => response.json())
                .then((data: {
                  filtered?: string;
                  removedTokens?: string[];
                  instructionLine?: string;
                }) => {
                  setAvoidancePreview({
                    filtered: data.filtered ?? "",
                    removedTokens: data.removedTokens ?? [],
                    instructionLine: data.instructionLine ?? "",
                  });
                })
                .catch(() => setAvoidancePreview(null));
            }}
          >
            Preview avoidance
          </Button>
          {avoidancePreview ? (
            <div className="ui-surface-inset type-caption">
              {avoidancePreview.removedTokens.length > 0 ? (
                <p className="text-amber-300">
                  Matched tokens: {avoidancePreview.removedTokens.join(", ")}
                </p>
              ) : (
                <p>No avoided tokens found in this prompt.</p>
              )}
              {avoidancePreview.instructionLine ? (
                <p className="mt-2 text-zinc-500">{avoidancePreview.instructionLine}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </ToolSection>

      <ToolSection title="Webhook event log">
        <p className="text-sm text-zinc-400">
          Recent webhook dispatch attempts (newest first).
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="space-y-1 text-xs text-zinc-400">
            Event filter
            <select
              value={webhookEventFilter}
              onChange={(event) => setWebhookEventFilter(event.target.value)}
              className="block rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
            >
              <option value="all">All events</option>
              {webhookEventOptions.map((eventName) => (
                <option key={eventName} value={eventName}>
                  {eventName}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            disabled={webhookLog.length === 0}
            onClick={() => {
              clearWebhookLog();
              setStatus("Cleared webhook log.");
            }}
          >
            Clear log
          </Button>
        </div>
        {filteredWebhookLog.length === 0 ? (
          <EmptyState
            compact
            icon="inbox"
            title={
              webhookLog.length === 0
                ? "No webhook events yet"
                : "No events for this filter"
            }
            description={
              webhookLog.length === 0
                ? "Dispatch attempts appear here once webhooks fire for queue, gallery, or storage events."
                : "Try another event type or clear the filter to see the full log."
            }
            action={
              webhookLog.length > 0 && webhookEventFilter !== "all"
                ? {
                    label: "Show all events",
                    onClick: () => setWebhookEventFilter("all"),
                  }
                : undefined
            }
          />
        ) : (
          <ol className="space-y-2">
            {filteredWebhookLog.slice(0, 12).map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400"
              >
                <p className={entry.ok ? "text-emerald-300" : "text-rose-300"}>
                  {entry.ok ? "OK" : "FAIL"} · {entry.event} ·{" "}
                  {new Date(entry.timestamp).toLocaleString()}
                </p>
                <p>{entry.message ?? entry.url}</p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedWebhookLogId((previous) =>
                      previous === entry.id ? null : entry.id,
                    )
                  }
                  className="mt-2 text-zinc-400 hover:text-zinc-200"
                >
                  {expandedWebhookLogId === entry.id ? "Hide payload" : "Show payload"}
                </button>
                {expandedWebhookLogId === entry.id ? (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void retryWebhookLogEntry(entry).then((ok) =>
                      setStatus(ok ? "Webhook retry succeeded." : "Webhook retry failed."),
                    );
                  }}
                  className="mt-2 text-violet-300 hover:text-violet-200"
                >
                  Retry
                </button>
              </li>
            ))}
          </ol>
        )}
      </ToolSection>

      <ToolSection title="Scheduled batch">
        <p className="text-sm text-zinc-400">
          Two runners exist: a <strong className="font-medium text-zinc-300">browser</strong>{" "}
          scheduler (needs this tab open) and an optional{" "}
          <strong className="font-medium text-zinc-300">headless server</strong> cron
          gated by env.
        </p>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400">
          <p className="mb-1 font-medium text-zinc-300">
            Headless server runner (env)
          </p>
          <p className="mb-2">
            Requires <code className="text-zinc-300">PROMPT_DATA_DIR</code> for durable
            profile storage, plus{" "}
            <code className="text-zinc-300">SERVER_SCHEDULED_BATCH=true</code>. The
            checkbox below only controls the in-browser runner.
          </p>
          {serverScheduledBatchStatus ? (
            <>
              <p>
                {serverScheduledBatchStatus.enabled
                  ? "Active — server cron enabled (SERVER_SCHEDULED_BATCH=true)."
                  : "Disabled — set SERVER_SCHEDULED_BATCH=true on the server to enable."}
                {" "}
                {serverScheduledBatchStatus.persisted
                  ? "Profile persisted to server storage."
                  : "Profile not persisted (set PROMPT_DATA_DIR to survive restarts)."}
              </p>
              <p className="mt-1">
                Using model{" "}
                <span className="text-zinc-200">{serverScheduledBatchStatus.profile.model}</span>{" "}
                · detail{" "}
                <span className="text-zinc-200">{serverScheduledBatchStatus.profile.detail}</span>{" "}
                · quality{" "}
                <span className="text-zinc-200">
                  {serverScheduledBatchStatus.profile.qualityProfile}
                </span>
              </p>
              <p className="mt-1">
                Last run:{" "}
                {serverScheduledBatchStatus.lastRunAt
                  ? new Date(serverScheduledBatchStatus.lastRunAt).toLocaleString()
                  : "never"}
              </p>
            </>
          ) : (
            <p>Checking server status…</p>
          )}
        </div>
        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={scheduledBatch.enabled}
            onChange={(event) => {
              const next = { ...scheduledBatch, enabled: event.target.checked };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Enable browser scheduled batch (tab must stay open)
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="scheduled-interval">Interval (minutes)</FieldLabel>
            <input
              id="scheduled-interval"
              type="number"
              min={5}
              value={scheduledBatch.intervalMinutes}
              onChange={(event) => {
                const next = {
                  ...scheduledBatch,
                  intervalMinutes: Number(event.target.value) || 60,
                };
                setScheduledBatch(next);
                saveScheduledBatchConfig(next);
              }}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
          <div>
            <FieldLabel htmlFor="scheduled-count">Prompt count</FieldLabel>
            <input
              id="scheduled-count"
              type="number"
              min={1}
              max={12}
              value={scheduledBatch.count}
              onChange={(event) => {
                const next = {
                  ...scheduledBatch,
                  count: Number(event.target.value) || 3,
                };
                setScheduledBatch(next);
                saveScheduledBatchConfig(next);
              }}
              className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
          </div>
        </div>
        <FieldLabel htmlFor="scheduled-target">Target generator</FieldLabel>
        <select
          id="scheduled-target"
          value={scheduledBatch.target}
          onChange={(event) => {
            const next = {
              ...scheduledBatch,
              target: event.target.value as ScheduledBatchConfig["target"],
            };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        >
          <option value="random-scene">Random scene</option>
          <option value="topics">Topics batch</option>
        </select>
        <label className="mt-3 flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={scheduledBatch.autoQueueComfyUi}
            onChange={(event) => {
              const next = {
                ...scheduledBatch,
                autoQueueComfyUi: event.target.checked,
              };
              setScheduledBatch(next);
              saveScheduledBatchConfig(next);
            }}
            className={`h-4 w-4 rounded ${accentFocusClass()}`}
          />
          Auto-queue to ComfyUI
        </label>
        <FieldLabel htmlFor="scheduled-genre">Genre/theme hint (optional)</FieldLabel>
        <input
          id="scheduled-genre"
          value={scheduledBatch.genre ?? ""}
          onChange={(event) => {
            const next = { ...scheduledBatch, genre: event.target.value || undefined };
            setScheduledBatch(next);
            saveScheduledBatchConfig(next);
          }}
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        />
      </ToolSection>
      </>
      )}

      {tab === "data" && (
      <>
      <ToolSection>
        <ComfyUiGalleryPanel limit={6} compact showHeader />
      </ToolSection>

      <ToolSection title="Active character descriptor">
        <p className="text-sm text-zinc-400">
          Shared mandatory descriptor injected into Character generation requests.
        </p>
        <TextArea
          rows={3}
          value={sharedSettings.activeCharacterDescriptor ?? ""}
          onChange={(event) =>
            updateSharedSettings({
              activeCharacterDescriptor: event.target.value.trim() || undefined,
            })
          }
          placeholder="e.g. athletic woman, mid-20s, short copper hair, green eyes"
          className={accentFocusClass()}
        />
      </ToolSection>

      <SettingsBundlePanel
        onImported={reloadBrowserSettingsState}
        onStatus={setStatus}
      />

      <ToolSection title="Local data">
        <p className="text-sm text-zinc-400">
          Full studio backup includes history, settings, scene presets, user templates,
          location blocklist, ComfyUI settings, gallery entries, workflow JSON (v2),
          avoided tokens, webhook log/settings, projects, and scheduled batch (v3). Prefer
          Settings export above when you only need prefs.
        </p>
        {backupReminder ? (
          <p className="mb-3 text-sm text-amber-300/90">{backupReminder}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              void import("@/lib/studio-backup").then(({ downloadStudioBackup }) => {
                downloadStudioBackup();
                writeBrowserString(STUDIO_BACKUP_LAST_EXPORT_KEY, String(Date.now()));
                setBackupReminder(null);
                setStatus("Studio backup downloaded.");
              });
            }}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-zinc-500"
          >
            Export backup
          </button>
          <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-zinc-500">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImport(file);
                }
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Clear all local prompt history, settings, presets, and templates?",
                )
              ) {
                clearAllLocalPromptData();
                resetComfyUiSettings();
                updateSettings(DEFAULT_COMFYUI_SETTINGS);
                setStatus("Local data cleared. Reload the page.");
              }
            }}
            className="rounded-lg border border-rose-800/60 px-4 py-2 text-rose-200 hover:border-rose-500"
          >
            Reset local data
          </button>
        </div>
        <p className="text-xs text-zinc-600">
          Keys: {LOCAL_DATA_KEYS.join(", ")}
        </p>
      </ToolSection>
      </>
      )}

      {tab === "advanced" && <SettingsAdvancedPanel />}

      {tab === "users" ? <UsersSettingsPanel /> : null}

      {status && <p className="type-caption">{status}</p>}
      </div>
      </div>
    </ToolLayout>
  );
}
