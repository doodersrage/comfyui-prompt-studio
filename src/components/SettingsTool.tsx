"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  downloadStudioBackup,
  importStudioBackup,
  parseStudioBackupFile,
} from "@/lib/studio-backup";
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
  mergeLoraLibraryIntoCustomTokens,
  placeholderTokensFromSettings,
  resetComfyUiSettings,
  saveComfyUiSettings,
  type LoraLibraryEntry,
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
import ToolQualityProfilesSettings from "@/components/settings/ToolQualityProfilesSettings";
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  HealthCard,
  accentButtonClass,
  accentFocusClass,
} from "@/components/ui/ToolPageShell";
import { ToolPageSkeleton } from "@/components/ui/ViewState";
import { FieldError, FieldLabel, TextArea } from "@/components/ui/Field";
import { Button, PrimaryButton } from "@/components/ui/Button";
import {
  normalizeSettingsTab,
  settingsTabHref,
  SETTINGS_TABS,
  type SettingsTab,
} from "@/lib/settings-nav";
import type { ServerEnvSummary } from "@/lib/server-env-summary";
import {
  markOnboardingComfyHealthOk,
  markOnboardingLlmHealthOk,
} from "@/lib/onboarding-hooks";
import { fetchWorkflowPreview } from "@/lib/comfyui-requeue";
import { resolveQueueParams } from "@/lib/queue-params-settings";

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

const ACCENT = "neutral" as const;

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

function createLoraLibraryEntry(): LoraLibraryEntry {
  const id = `lora-${Date.now().toString(36)}`;
  return {
    id,
    label: "",
    triggerPhrase: "",
    tokenValue: "",
  };
}

type HealthResponse = {
  llm: {
    ok: boolean;
    enabled: boolean;
    model?: string;
    visionModel?: string;
    baseUrl?: string;
    error?: string;
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
  const [sharedSettings, setSharedSettings] =
    useState<SharedToolSettings>(DEFAULT_SHARED_SETTINGS);
  const [sharedMounted, setSharedMounted] = useState(false);
  const [modelWorkflowMapText, setModelWorkflowMapText] = useState("");
  const [modelCheckpointMapText, setModelCheckpointMapText] = useState("");
  const [modelVaeMapText, setModelVaeMapText] = useState("");
  const [modelRefinerMapText, setModelRefinerMapText] = useState("");
  const [modelUpscaleMapText, setModelUpscaleMapText] = useState("");
  const [loaderMapMergeHint, setLoaderMapMergeHint] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
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
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      setTab(normalizeSettingsTab(tabParam));
    });
  }, []);

  const handleTabChange = useCallback((next: SettingsTab) => {
    setTab(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", settingsTabHref(next));
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      const cache = loadSettingsCache();
      setSharedSettings(cache.shared);
      setModelWorkflowMapText(formatModelWorkflowMap(cache.shared.modelWorkflowMap));
      setModelCheckpointMapText(formatModelCheckpointMap(cache.shared.modelCheckpointMap));
      setModelVaeMapText(formatModelVaeMap(cache.shared.modelVaeMap));
      setModelRefinerMapText(formatModelRefinerMap(cache.shared.modelRefinerMap));
      setModelUpscaleMapText(formatModelUpscaleMap(cache.shared.modelUpscaleMap));
      setSharedMounted(true);
      setWebhookSettings(loadWebhookSettings());
      setScheduledBatch(loadScheduledBatchConfig());
      setAvoidedTokens(exportAvoidedTokenList());
      setWebhookLog(loadWebhookLog());
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

  const updateLoraEntry = useCallback(
    (index: number, patch: Partial<LoraLibraryEntry>) => {
      const current = settings.loraLibrary ?? [];
      const next = current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      );
      updateSettings({ loraLibrary: next });
    },
    [settings.loraLibrary, updateSettings],
  );

  const addLoraEntry = useCallback(() => {
    updateSettings({
      loraLibrary: [...(settings.loraLibrary ?? []), createLoraLibraryEntry()],
    });
  }, [settings.loraLibrary, updateSettings]);

  const removeLoraEntry = useCallback(
    (index: number) => {
      updateSettings({
        loraLibrary: (settings.loraLibrary ?? []).filter(
          (_, entryIndex) => entryIndex !== index,
        ),
      });
    },
    [settings.loraLibrary, updateSettings],
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
      <SettingsSubNav activeTab={tab} onTabChange={handleTabChange} tabs={SETTINGS_TABS} />

      {tab === "overview" && (
      <>
      <ToolSection title="Service health">
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
          <div className="mt-4 space-y-2">
            <p className="type-caption text-zinc-400">ComfyUI pool endpoints</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {health.comfyuiPool.endpoints.map((endpoint) => (
                <HealthCard
                  key={endpoint.url}
                  title={`Pool #${endpoint.index + 1}`}
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
      <ToolSection title="Session LLM preferences">
        <p className="text-sm text-zinc-400">
          Browser-session overrides sent with generation requests. Server env vars
          still define the base model and API key.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>LLM temperature</span>
            <span className="font-medium text-zinc-200">
              {typeof sharedSettings.sessionLlmTemperature === "number"
                ? sharedSettings.sessionLlmTemperature.toFixed(2)
                : "server default"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={sharedSettings.sessionLlmTemperature ?? 1}
            onChange={(event) =>
              updateSharedSettings({
                sessionLlmTemperature: Number(event.target.value),
              })
            }
            disabled={!sharedMounted}
            className="h-2 w-full accent-violet-500"
          />
          <div className="flex justify-between text-xs text-zinc-600">
            <span>0</span>
            <span>1</span>
            <span>2</span>
          </div>
          {typeof sharedSettings.sessionLlmTemperature === "number" && (
            <button
              type="button"
              disabled={!sharedMounted}
              onClick={() =>
                updateSharedSettings({ sessionLlmTemperature: undefined })
              }
              className="text-xs text-violet-300 hover:text-violet-200 disabled:opacity-50"
            >
              Reset to server default
            </button>
          )}
        </div>

        <label className="flex items-start gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={sharedSettings.sessionAllowTemplateFallback === true}
            onChange={(event) =>
              updateSharedSettings({
                sessionAllowTemplateFallback: event.target.checked
                  ? true
                  : undefined,
              })
            }
            disabled={!sharedMounted}
            className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          <span className="space-y-1">
            <span className="block font-medium text-zinc-200">
              Allow template fallback when LLM fails
            </span>
            <span className="block text-xs text-zinc-500">
              When enabled, generators may fall back to template output if the LLM
              request errors or times out.
            </span>
          </span>
        </label>
      </ToolSection>
      )}

      {tab === "comfyui" && (
      <>
      <ToolSection title="Model → workflow map">
        <p className="text-sm text-zinc-400">
          One mapping per line:{" "}
          <code className="rounded bg-zinc-800 px-1 text-violet-300">
            modelId=workflowFileId
          </code>
          . When you change the target model in a generator, the mapped workflow
          file is selected automatically.
        </p>
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
          placeholder={`qwen-image-2512=my-qwen-workflow.json\nflux-2-klein=flux-klein-default.json`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
        />
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
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
        >
          Apply smart defaults by category
        </button>
      </ToolSection>

      <ToolSection title="Workflow patching & checkpoints">
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
              <strong className="font-medium text-zinc-400">Final/Max</strong>, SDXL base workflows
              may get a latent upscale + refiner pass; outputs may also get neural or Lanczos upscale
              (with optional Lanczos polish and sharpen on Max) before SaveImage.
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
                  Chains a 1.1× Lanczos pass after UpscaleModel on Max profile.
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
                  Optional ImageSharpen after neural or Lanczos upscale on Max. Off by default — enable for crisp edges, not natural skin.
                </span>
              </span>
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
          placeholder={`# optional — only if file exists in ComfyUI\ndefault=4x-UltraSharp.pth`}
          className={`ui-input w-full font-mono text-xs leading-relaxed text-emerald-200 ${accentFocusClass(ACCENT)}`}
        />
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
      </ToolSection>

      <ComfyWorkflowLibraryPanel
        placeholderTokens={placeholderTokensFromSettings(settings)}
        onStatus={setStatus}
      />

      <WorkflowDiffPanel />

      <ToolSection title="ComfyUI connection & injection">
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
                .
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

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">LoRA / trigger library</p>
              <button
                type="button"
                onClick={addLoraEntry}
                className="text-xs text-violet-300 hover:text-violet-200"
              >
                Add LoRA
              </button>
            </div>
            <p className="text-xs text-zinc-600">
              Saved entries sync to custom workflow tokens as{" "}
              <code className="rounded bg-zinc-800 px-1 text-violet-300">
                {"{{LORA_<id>}}"}
              </code>{" "}
              when you save ComfyUI settings. Use trigger phrases in prompts and
              token values for workflow injection.
            </p>
            {(settings.loraLibrary ?? []).length === 0 ? (
              <p className="text-xs text-zinc-600">No LoRA entries yet.</p>
            ) : (
              <ul className="space-y-3">
                {(settings.loraLibrary ?? []).map((entry, index) => (
                  <li
                    key={entry.id || index}
                    className="ui-surface-inset space-y-2"
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-1 text-xs text-zinc-400">
                        ID
                        <input
                          value={entry.id}
                          onChange={(event) =>
                            updateLoraEntry(index, { id: event.target.value })
                          }
                          placeholder="portrait-style"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-zinc-400">
                        Label
                        <input
                          value={entry.label}
                          onChange={(event) =>
                            updateLoraEntry(index, { label: event.target.value })
                          }
                          placeholder="Portrait style LoRA"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                        />
                      </label>
                    </div>
                    <label className="space-y-1 text-xs text-zinc-400">
                      Trigger phrase
                      <input
                        value={entry.triggerPhrase}
                        onChange={(event) =>
                          updateLoraEntry(index, {
                            triggerPhrase: event.target.value,
                          })
                        }
                        placeholder="portrait lighting, soft skin"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                      />
                    </label>
                    <label className="space-y-1 text-xs text-zinc-400">
                      Token value
                      <input
                        value={entry.tokenValue}
                        onChange={(event) =>
                          updateLoraEntry(index, { tokenValue: event.target.value })
                        }
                        placeholder="portrait_lora.safetensors"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="text-xs text-violet-300">
                        {entry.id.trim()
                          ? `{{LORA_${entry.id.trim()}}}`
                          : "{{LORA_<id>}}"}
                      </code>
                      <button
                        type="button"
                        onClick={() => removeLoraEntry(index)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-rose-500 hover:text-rose-200"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
        </div>

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
            checked={settings.autoRefineOnLowRating !== false}
            onChange={(event) =>
              updateSettings({ autoRefineOnLowRating: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Auto-open Refine when a gallery output is rated 1–2★
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.autoRequeueFinalOnHighRating !== false}
            onChange={(event) =>
              updateSettings({ autoRequeueFinalOnHighRating: event.target.checked })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 accent-violet-500"
          />
          Auto upscale 4–5★ outputs at Final quality (same image, on by default)
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
          Auto upscale 5★ outputs at Max quality (same image, on by default)
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
          After 5★ upscale, also queue low-denoise img2img refine (experimental, off by default)
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
          Auto-tag completed gallery images with vision LLM tags
        </label>

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

      <ToolSection title="Queue parameters">
        <QueueParamsPanel />
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
          <p className="text-sm text-zinc-500">No avoided tokens yet.</p>
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
          <p className="text-sm text-zinc-500">No webhook events logged yet.</p>
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
          Background runner (in app layout) periodically generates prompts and optionally
          queues them to ComfyUI.
        </p>
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
          Enable scheduled batch
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

      <ToolSection title="Local data">
        <p className="text-sm text-zinc-400">
          Backup includes history, settings, scene presets, user templates, location
          blocklist, ComfyUI settings, gallery entries, workflow JSON (v2), avoided
          tokens, webhook log/settings, projects, and scheduled batch (v3).
        </p>
        {backupReminder ? (
          <p className="mb-3 text-sm text-amber-300/90">{backupReminder}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              downloadStudioBackup();
              writeBrowserString(STUDIO_BACKUP_LAST_EXPORT_KEY, String(Date.now()));
              setBackupReminder(null);
              setStatus("Studio backup downloaded.");
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

      <SettingsAdvancedPanel />
      </>
      )}

      {tab === "users" ? <UsersSettingsPanel /> : null}

      {status && <p className="type-caption">{status}</p>}
    </ToolLayout>
  );
}
