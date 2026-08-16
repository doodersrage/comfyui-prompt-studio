'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { STUDIO_BACKUP_LAST_EXPORT_KEY } from '@/lib/studio-backup-meta';
import {
  readBrowserString,
  whenBrowserStorageReady,
  writeBrowserString,
} from '@/lib/browser-storage';
import { useComfyUiSettings } from '@/hooks/useComfyUiSettings';
import { validateWorkflowJson, type CustomWorkflowToken } from '@/lib/comfyui-config';
import {
  DEFAULT_COMFYUI_SETTINGS,
  loadComfyUiSettings,
  mergeLoraLibraryIntoCustomTokens,
  placeholderTokensFromSettings,
  resetComfyUiSettings,
  saveComfyUiSettings,
} from '@/lib/comfyui-settings';
import {
  formatModelCheckpointMap,
  formatModelVaeMap,
  formatModelRefinerMap,
  mergeSuggestedLoaderMaps,
  formatSuggestedLoaderMergeMessage,
} from '@/lib/model-checkpoint-map';
import { formatModelUpscaleMap } from '@/lib/model-upscale-map';
import { formatModelControlNetMap } from '@/lib/model-controlnet-map';
import { formatModelLoraMap } from '@/lib/model-lora-map';
import {
  formatInventorySyncMessage,
  syncLoaderMapsFromInventory,
} from '@/lib/loader-map-inventory-sync';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  saveSharedSettingsNow,
  SETTINGS_CACHE_UPDATED_EVENT,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import {
  DEFAULT_SCHEDULED_BATCH,
  loadScheduledBatchConfig,
  type ScheduledBatchConfig,
} from '@/lib/scheduled-batch';
import {
  fetchScheduledBatchServerStatus,
  pushScheduledBatchProfile,
  type ScheduledBatchServerStatus,
} from '@/lib/scheduled-batch-profile-sync';
import {
  DEFAULT_WEBHOOK_SETTINGS,
  loadWebhookSettings,
  type WebhookSettings,
} from '@/lib/webhook-settings';
import { AVOIDED_TOKENS_UPDATED_EVENT, exportAvoidedTokenList } from '@/lib/avoided-tokens';
import { WEBHOOK_LOG_UPDATED_EVENT, loadWebhookLog, type WebhookLogEntry } from '@/lib/webhook-log';
import {
  isComfyNotificationSupported,
  requestComfyNotificationPermission,
} from '@/lib/comfyui-notifications';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import SettingsSubNav from '@/components/settings/SettingsSubNav';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import { Button } from '@/components/ui/Button';
import {
  normalizeSettingsTab,
  settingsTabHref,
  settingsTabsForWorkspaceMode,
  isSimpleSettingsTab,
  settingsViewFromSearchParams,
  type SettingsTab,
} from '@/lib/settings-nav';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { useSettingsPageDescriptionRich } from '@/hooks/useToolPageDescription';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import {
  comfyUiSectionRequiresFullSettings,
  normalizeComfyUiSettingsSection,
  settingsComfyUiSectionHref,
  type ComfyUiSettingsSectionId,
} from '@/lib/settings-comfyui-nav';
import {
  COMFYUI_SECTION_ELEMENT_IDS,
  PLAYBOOK_SECTION_CHECKLISTS,
  serverEnvFieldValue,
  formatModelWorkflowMap,
  type HealthResponse,
} from '@/components/settings/tabs/settings-tool-shared';
import { markOnboardingComfyHealthOk, markOnboardingLlmHealthOk } from '@/lib/onboarding-hooks';
import { fetchWorkflowPreview } from '@/lib/comfyui-requeue';
import { resolveQueueParams } from '@/lib/queue-params-settings';
import { runHealAndReady, readAdaptedLoaderMapTexts } from '@/lib/first-run-setup';

const SettingsAdvancedPanel = dynamic(() => import('@/components/SettingsAdvancedPanel'), {
  loading: () => <ToolPageSkeleton label="Loading advanced settings" />,
});
const UsersSettingsPanel = dynamic(() => import('@/components/settings/UsersSettingsPanel'), {
  loading: () => <ToolPageSkeleton label="Loading users" />,
});
const SettingsLlmPanel = dynamic(() => import('@/components/settings/SettingsLlmPanel'), {
  loading: () => <ToolPageSkeleton label="Loading LLM settings" />,
});

const SettingsOverviewTab = dynamic(
  () => import('@/components/settings/tabs/SettingsOverviewTab'),
  { loading: () => <ToolPageSkeleton label="Loading overview" /> }
);
const SettingsComfyUiTab = dynamic(() => import('@/components/settings/tabs/SettingsComfyUiTab'), {
  loading: () => <ToolPageSkeleton label="Loading ComfyUI settings" />,
});
const SettingsAutomationTab = dynamic(
  () => import('@/components/settings/tabs/SettingsAutomationTab'),
  { loading: () => <ToolPageSkeleton label="Loading automation settings" /> }
);
const SettingsDataTab = dynamic(() => import('@/components/settings/tabs/SettingsDataTab'), {
  loading: () => <ToolPageSkeleton label="Loading data settings" />,
});

const ACCENT = 'neutral' as const;

export default function SettingsTool() {
  const { mounted, settings, updateSettings } = useComfyUiSettings();
  const workspaceMode = useWorkspaceMode();
  const searchParams = useSearchParams();
  const urlView = settingsViewFromSearchParams(
    searchParams.get('tab'),
    searchParams.get('section')
  );
  // URL deep links expand immediately; the user can still open the rest by hand.
  const [userShowAllSettings, setUserShowAllSettings] = useState(false);
  const showAllSettings = urlView.showAll || userShowAllSettings;
  const [tab, setTab] = useState<SettingsTab>(urlView.tab);
  const [comfyUiSection, setComfyUiSection] = useState<ComfyUiSettingsSectionId | null>(
    urlView.section
  );
  const [sharedSettings, setSharedSettings] = useState<SharedToolSettings>(DEFAULT_SHARED_SETTINGS);
  const [sharedMounted, setSharedMounted] = useState(false);
  const [modelWorkflowMapText, setModelWorkflowMapText] = useState('');
  const [modelCheckpointMapText, setModelCheckpointMapText] = useState('');
  const [modelVaeMapText, setModelVaeMapText] = useState('');
  const [modelRefinerMapText, setModelRefinerMapText] = useState('');
  const [modelUpscaleMapText, setModelUpscaleMapText] = useState('');
  const [modelControlNetMapText, setModelControlNetMapText] = useState('');
  const [modelLoraMapText, setModelLoraMapText] = useState('');
  const [loaderMapMergeHint, setLoaderMapMergeHint] = useState<string | null>(null);
  const [ipAdapterUploadStatus, setIpAdapterUploadStatus] = useState<string | null>(null);
  const [ipAdapterUploading, setIpAdapterUploading] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [healBusy, setHealBusy] = useState(false);
  const [healProgress, setHealProgress] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [workflowHealthRefresh, setWorkflowHealthRefresh] = useState(0);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [previewPrompt, setPreviewPrompt] = useState(
    'Two gravel cyclists racing through a muddy forest doubletrack at dusk.'
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [workflowPreview, setWorkflowPreview] = useState<Awaited<
    ReturnType<typeof fetchWorkflowPreview>
  > | null>(null);
  const [webhookSettings, setWebhookSettings] = useState<WebhookSettings>(DEFAULT_WEBHOOK_SETTINGS);
  const [scheduledBatch, setScheduledBatch] =
    useState<ScheduledBatchConfig>(DEFAULT_SCHEDULED_BATCH);
  const [serverScheduledBatchStatus, setServerScheduledBatchStatus] =
    useState<ScheduledBatchServerStatus | null>(null);
  const [avoidedTokens, setAvoidedTokens] = useState<string[]>([]);
  const [avoidedTokenDraft, setAvoidedTokenDraft] = useState('');
  const [avoidancePreviewPrompt, setAvoidancePreviewPrompt] = useState('');
  const [avoidancePreview, setAvoidancePreview] = useState<{
    filtered: string;
    removedTokens: string[];
    instructionLine: string;
  } | null>(null);
  const [webhookLog, setWebhookLog] = useState<WebhookLogEntry[]>([]);
  const [webhookEventFilter, setWebhookEventFilter] = useState<string>('all');
  const [expandedWebhookLogId, setExpandedWebhookLogId] = useState<string | null>(null);
  const [backupReminder, setBackupReminder] = useState<string | null>(null);

  const visibleSettingsTabs = useMemo(
    () => settingsTabsForWorkspaceMode(workspaceMode, showAllSettings),
    [workspaceMode, showAllSettings]
  );

  const slimSettings = !showAllSettings;
  const description = useSettingsPageDescriptionRich(slimSettings);

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (isComfyNotificationSupported()) {
        setNotificationPermission(Notification.permission);
      } else {
        setNotificationPermission('unsupported');
      }
    });
  }, []);

  const [guidedFixHint, setGuidedFixHint] = useState<string | null>(null);

  const scrollToComfyUiSection = useCallback((section: ComfyUiSettingsSectionId) => {
    const element = document.getElementById(COMFYUI_SECTION_ELEMENT_IDS[section]);
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.classList.add(
      'ring-2',
      'ring-[var(--accent-ring)]',
      'ring-offset-2',
      'ring-offset-[var(--bg-base)]',
      'transition'
    );
    window.setTimeout(() => {
      element.classList.remove(
        'ring-2',
        'ring-[var(--accent-ring)]',
        'ring-offset-2',
        'ring-offset-[var(--bg-base)]',
        'transition'
      );
    }, 2600);
    const hint = PLAYBOOK_SECTION_CHECKLISTS[section];
    if (hint) {
      setGuidedFixHint(hint);
      window.setTimeout(() => setGuidedFixHint(null), 8000);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    scheduleAfterCommit(() => {
      const params = new URLSearchParams(window.location.search);
      const nextTab = normalizeSettingsTab(params.get('tab'));
      const section = normalizeComfyUiSettingsSection(params.get('section'));
      setTab(nextTab);
      setComfyUiSection(section);
      if (
        (workspaceMode === 'simple' && !isSimpleSettingsTab(nextTab)) ||
        comfyUiSectionRequiresFullSettings(section)
      ) {
        setUserShowAllSettings(true);
      }
      if (nextTab === 'comfyui' && section) {
        window.setTimeout(() => scrollToComfyUiSection(section), 250);
      }
      if (nextTab === 'data' && params.get('section') === 'reliability') {
        window.setTimeout(() => {
          const element = document.getElementById('settings-data-reliability');
          if (!element) {
            return;
          }
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          element.classList.add(
            'ring-2',
            'ring-[var(--accent-ring)]',
            'ring-offset-2',
            'ring-offset-[var(--bg-base)]',
            'transition'
          );
          window.setTimeout(() => {
            element.classList.remove(
              'ring-2',
              'ring-[var(--accent-ring)]',
              'ring-offset-2',
              'ring-offset-[var(--bg-base)]',
              'transition'
            );
          }, 2600);
        }, 120);
      }
    });
  }, [workspaceMode, scrollToComfyUiSection]);

  const handleTabChange = useCallback((next: SettingsTab) => {
    setTab(next);
    if (next !== 'comfyui') {
      setComfyUiSection(null);
    }
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', settingsTabHref(next));
    }
  }, []);

  const handleComfyUiSectionJump = useCallback(
    (section: ComfyUiSettingsSectionId) => {
      if (comfyUiSectionRequiresFullSettings(section)) {
        setUserShowAllSettings(true);
      }
      setComfyUiSection(section);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', settingsComfyUiSectionHref(section));
      }
      scheduleAfterCommit(() => {
        scrollToComfyUiSection(section);
      });
    },
    [scrollToComfyUiSection]
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

  /** Soft sync for same-tab cache events — never wipe map textarea drafts mid-edit. */
  const softSyncSharedSettings = useCallback(() => {
    const cache = loadSettingsCache();
    setSharedSettings(cache.shared);
    updateSettings(loadComfyUiSettings());
    setWebhookSettings(loadWebhookSettings());
    setScheduledBatch(loadScheduledBatchConfig());
    setAvoidedTokens(exportAvoidedTokenList());
  }, [updateSettings]);

  useEffect(() => {
    if (tab !== 'comfyui' || !comfyUiSection) {
      return;
    }
    scheduleAfterCommit(() => {
      scrollToComfyUiSection(comfyUiSection);
    });
  }, [tab, comfyUiSection, scrollToComfyUiSection]);

  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
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
            'No recent Studio backup detected — export a v3 backup to preserve avoided tokens, webhooks, and projects.'
          );
        }
      } catch {
        setBackupReminder(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshAvoided = () => setAvoidedTokens(exportAvoidedTokenList());
    const refreshWebhookLog = () => setWebhookLog(loadWebhookLog());
    const refreshShared = () => {
      if (!sharedMounted) {
        return;
      }
      scheduleAfterCommit(() => {
        softSyncSharedSettings();
      });
    };
    window.addEventListener(AVOIDED_TOKENS_UPDATED_EVENT, refreshAvoided);
    window.addEventListener(WEBHOOK_LOG_UPDATED_EVENT, refreshWebhookLog);
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refreshShared);
    return () => {
      window.removeEventListener(AVOIDED_TOKENS_UPDATED_EVENT, refreshAvoided);
      window.removeEventListener(WEBHOOK_LOG_UPDATED_EVENT, refreshWebhookLog);
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refreshShared);
    };
  }, [sharedMounted, softSyncSharedSettings]);

  const updateSharedSettings = useCallback((patch: Partial<SharedToolSettings>) => {
    setSharedSettings(previous => ({ ...previous, ...patch }));
    const next = { ...loadSettingsCache().shared, ...patch };
    // Avoid broadcasting back into this page — optimistic UI already applied.
    void saveSharedSettingsNow(next, { notify: false });
  }, []);

  // Mirrors Studio Automation config to server storage so the headless scheduled
  // batch runner (src/instrumentation.ts) queues with the same model/detail/quality.
  useEffect(() => {
    if (!sharedMounted) {
      return;
    }
    const timer = window.setTimeout(() => {
      void pushScheduledBatchProfile({
        model:
          scheduledBatch.overrideSharedSettings && scheduledBatch.model?.trim()
            ? scheduledBatch.model.trim()
            : sharedSettings.model,
        detail:
          scheduledBatch.overrideSharedSettings && scheduledBatch.detail
            ? scheduledBatch.detail
            : sharedSettings.detail,
        qualityProfile:
          scheduledBatch.overrideSharedSettings && scheduledBatch.qualityProfile
            ? scheduledBatch.qualityProfile
            : sharedSettings.queueQualityProfile,
        target: scheduledBatch.target,
        count: scheduledBatch.count,
        genre: scheduledBatch.genre,
        autoQueueComfyUi: scheduledBatch.autoQueueComfyUi,
        bestOfN: scheduledBatch.bestOfN,
        bestOfNVision: scheduledBatch.bestOfNVision,
      }).then(result => {
        if (result) {
          setServerScheduledBatchStatus(previous => ({
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
    scheduledBatch.overrideSharedSettings,
    scheduledBatch.model,
    scheduledBatch.detail,
    scheduledBatch.qualityProfile,
    scheduledBatch.bestOfN,
    scheduledBatch.bestOfNVision,
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
  }, [
    sharedSettings.modelCheckpointMap,
    sharedSettings.modelRefinerMap,
    sharedSettings.modelVaeMap,
    updateSharedSettings,
  ]);

  const syncLoaderMapsFromComfyInventory = useCallback(async () => {
    setStatus('Fetching ComfyUI inventory…');
    const objectInfo = await fetchComfyObjectInfoCached({
      comfyUrl: settings.apiUrl || undefined,
    });
    if (!objectInfo?.models) {
      setStatus('Could not fetch ComfyUI object_info — is ComfyUI reachable?');
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
    setWorkflowHealthRefresh(n => n + 1);
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
    return validateWorkflowJson(settings.workflowJson, placeholderTokensFromSettings(settings));
  }, [settings.workflowJson, settings.positiveToken, settings.negativeToken]);

  const refreshHealth = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!settings.useServerDefaults && settings.apiUrl?.trim()) {
        params.set('comfyUrl', settings.apiUrl.trim());
      }
      const query = params.toString();
      const response = await fetch(query ? `/api/health?${query}` : '/api/health');
      const healthData = (await response.json()) as HealthResponse;
      setHealth(healthData);
      if (healthData.llm?.ok) {
        markOnboardingLlmHealthOk();
      }
      if (healthData.comfyui?.ok) {
        markOnboardingComfyHealthOk();
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Health check failed.');
    } finally {
      setLoading(false);
    }
  }, [settings.apiUrl, settings.useServerDefaults]);

  const handleHealAndReady = useCallback(async () => {
    setHealBusy(true);
    setHealProgress('Starting Heal & ready…');
    try {
      const result = await runHealAndReady({
        comfyUrl:
          !settings.useServerDefaults && settings.apiUrl?.trim()
            ? settings.apiUrl.trim()
            : undefined,
        onProgress: progress => {
          setHealProgress(progress.message);
          setStatus(progress.message);
        },
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
      setWorkflowHealthRefresh(n => n + 1);
      await refreshHealth();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Heal & ready failed.');
    } finally {
      setHealBusy(false);
      setHealProgress(null);
    }
  }, [refreshHealth, settings.apiUrl, settings.useServerDefaults, updateSharedSettings]);

  useEffect(() => {
    if (tab !== 'overview' && tab !== 'comfyui') {
      return;
    }
    scheduleAfterCommit(() => {
      void refreshHealth();
    });
  }, [refreshHealth, tab]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const raw = await file.text();
      const { importStudioBackup, parseStudioBackupFile } = await import('@/lib/studio-backup');
      importStudioBackup(parseStudioBackupFile(raw));
      setStatus('Backup imported. Reload the page to apply all settings.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.');
    }
  }, []);

  const handleExportBackup = useCallback(() => {
    void import('@/lib/studio-backup').then(({ downloadStudioBackup }) => {
      downloadStudioBackup();
      writeBrowserString(STUDIO_BACKUP_LAST_EXPORT_KEY, String(Date.now()));
      setBackupReminder(null);
      setStatus('Studio backup downloaded.');
    });
  }, []);

  const handleSaveComfySettings = useCallback(() => {
    if (!settings.useServerDefaults && settings.workflowJson?.trim()) {
      const validation = validateWorkflowJson(
        settings.workflowJson,
        placeholderTokensFromSettings(settings)
      );
      if (!validation.ok) {
        setWorkflowError(validation.error ?? 'Invalid workflow JSON.');
        return;
      }
    }

    saveComfyUiSettings(mergeLoraLibraryIntoCustomTokens(settings));
    setWorkflowError(null);
    setStatus('ComfyUI settings saved.');
    void refreshHealth();
  }, [refreshHealth, settings]);

  const handleImportWorkflow = useCallback(
    async (file: File) => {
      try {
        const raw = await file.text();
        const validation = validateWorkflowJson(raw, placeholderTokensFromSettings(settings));
        if (!validation.ok) {
          setWorkflowError(validation.error ?? 'Invalid workflow JSON.');
          return;
        }

        updateSettings({
          useServerDefaults: false,
          workflowJson: raw.trim(),
        });
        setWorkflowError(null);
        setStatus(
          `Imported workflow · ${validation.placeholders?.positive ?? 0} positive placeholder(s).`
        );
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Workflow import failed.');
      }
    },
    [settings, updateSettings]
  );

  const handleResetComfySettings = useCallback(() => {
    resetComfyUiSettings();
    updateSettings(DEFAULT_COMFYUI_SETTINGS);
    setWorkflowError(null);
    setStatus('ComfyUI settings reset to server defaults.');
    void refreshHealth();
  }, [refreshHealth, updateSettings]);

  const handleEnableNotifications = useCallback(async () => {
    const permission = await requestComfyNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      updateSettings({ notifyOnComplete: true });
      setStatus('Browser notifications enabled for completed ComfyUI jobs.');
    } else if (permission === 'denied') {
      setStatus('Notifications blocked in browser settings.');
    }
  }, [updateSettings]);

  const updateQueueParam = useCallback(
    (key: 'seed' | 'width' | 'height' | 'cfg' | 'steps', value: string) => {
      updateSettings({
        queueParams: {
          ...settings.queueParams,
          [key]: value,
        },
      });
    },
    [settings.queueParams, updateSettings]
  );

  const updateCustomToken = useCallback(
    (index: number, patch: Partial<CustomWorkflowToken>) => {
      const current = settings.customTokens ?? [];
      const next = current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      );
      updateSettings({ customTokens: next });
    },
    [settings.customTokens, updateSettings]
  );

  const addCustomToken = useCallback(() => {
    updateSettings({
      customTokens: [...(settings.customTokens ?? []), { token: '{{CHECKPOINT}}', value: '' }],
    });
  }, [settings.customTokens, updateSettings]);

  const removeCustomToken = useCallback(
    (index: number) => {
      updateSettings({
        customTokens: (settings.customTokens ?? []).filter((_, entryIndex) => entryIndex !== index),
      });
    },
    [settings.customTokens, updateSettings]
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
      setPreviewError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setPreviewLoading(false);
    }
  }, [previewPrompt, settings, sharedSettings.model]);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Settings</ToolBadge>}
      title="Settings & Health"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.settings} />
      {guidedFixHint ? (
        <div role="status" className="ui-setup-banner mb-4 text-sm text-[var(--text-primary)]">
          {guidedFixHint}
        </div>
      ) : null}
      <div className="md:grid md:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] md:items-start md:gap-8">
        <SettingsSubNav
          activeTab={tab}
          onTabChange={handleTabChange}
          tabs={visibleSettingsTabs}
          footer={
            slimSettings ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full justify-start"
                onClick={() => setUserShowAllSettings(true)}
              >
                All settings…
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full justify-start"
                onClick={() => setUserShowAllSettings(false)}
              >
                Show essentials only
              </Button>
            )
          }
        />
        <div className="min-w-0 space-y-[var(--section-gap)]">
          {tab === 'overview' && (
            <SettingsOverviewTab
              health={health}
              loading={loading}
              healBusy={healBusy}
              healProgress={healProgress}
              handleHealAndReady={handleHealAndReady}
              refreshHealth={refreshHealth}
              sharedSettings={sharedSettings}
              updateSharedSettings={updateSharedSettings}
              setStatus={setStatus}
              slimSettings={slimSettings}
              onOpenComfyUiSection={section => {
                if (comfyUiSectionRequiresFullSettings(section)) {
                  setUserShowAllSettings(true);
                }
                setTab('comfyui');
                setComfyUiSection(section);
                window.setTimeout(() => scrollToComfyUiSection(section), 250);
              }}
              onShowAllSettings={() => setUserShowAllSettings(true)}
              handleImport={handleImport}
              handleExportBackup={handleExportBackup}
            />
          )}

          {tab === 'llm' && (
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
                serverTemperature: serverEnvFieldValue(health?.serverEnv, 'LLM_TEMPERATURE'),
                embedModel: serverEnvFieldValue(health?.serverEnv, 'LLM_EMBED_MODEL'),
                inFlight: health?.llm.inFlight,
                maxInflight: health?.llm.maxInflight,
                busy: health?.llm.busy,
                apiKeyConfigured: health?.config.llmApiKeyConfigured,
                visionModelConfigured: health?.config.visionModelConfigured,
              }}
              autoVisionTags={settings.autoVisionTags !== false}
              onAutoVisionTagsChange={value => updateSettings({ autoVisionTags: value })}
              onTestConnection={() => void refreshHealth()}
              testingConnection={loading}
            />
          )}

          {tab === 'comfyui' && (
            <SettingsComfyUiTab
              slimSettings={slimSettings}
              onShowAllSettings={() => setUserShowAllSettings(true)}
              comfyUiSection={comfyUiSection}
              handleComfyUiSectionJump={handleComfyUiSectionJump}
              sharedSettings={sharedSettings}
              sharedMounted={sharedMounted}
              updateSharedSettings={updateSharedSettings}
              mounted={mounted}
              settings={settings}
              updateSettings={updateSettings}
              modelWorkflowMapText={modelWorkflowMapText}
              setModelWorkflowMapText={setModelWorkflowMapText}
              modelCheckpointMapText={modelCheckpointMapText}
              setModelCheckpointMapText={setModelCheckpointMapText}
              modelVaeMapText={modelVaeMapText}
              setModelVaeMapText={setModelVaeMapText}
              modelRefinerMapText={modelRefinerMapText}
              setModelRefinerMapText={setModelRefinerMapText}
              modelUpscaleMapText={modelUpscaleMapText}
              setModelUpscaleMapText={setModelUpscaleMapText}
              modelControlNetMapText={modelControlNetMapText}
              setModelControlNetMapText={setModelControlNetMapText}
              modelLoraMapText={modelLoraMapText}
              setModelLoraMapText={setModelLoraMapText}
              loaderMapMergeHint={loaderMapMergeHint}
              ipAdapterUploadStatus={ipAdapterUploadStatus}
              ipAdapterUploading={ipAdapterUploading}
              setIpAdapterUploading={setIpAdapterUploading}
              setIpAdapterUploadStatus={setIpAdapterUploadStatus}
              workflowHealthRefresh={workflowHealthRefresh}
              setWorkflowHealthRefresh={setWorkflowHealthRefresh}
              setStatus={setStatus}
              applySuggestedLoaderMaps={applySuggestedLoaderMaps}
              syncLoaderMapsFromComfyInventory={syncLoaderMapsFromComfyInventory}
              updateQueueParam={updateQueueParam}
              updateCustomToken={updateCustomToken}
              addCustomToken={addCustomToken}
              removeCustomToken={removeCustomToken}
              workflowError={workflowError}
              setWorkflowError={setWorkflowError}
              workflowValidation={workflowValidation}
              previewPrompt={previewPrompt}
              setPreviewPrompt={setPreviewPrompt}
              previewLoading={previewLoading}
              previewError={previewError}
              workflowPreview={workflowPreview}
              handlePreviewWorkflow={handlePreviewWorkflow}
              handleImportWorkflow={handleImportWorkflow}
              notificationPermission={notificationPermission}
              handleEnableNotifications={handleEnableNotifications}
              handleSaveComfySettings={handleSaveComfySettings}
              handleResetComfySettings={handleResetComfySettings}
              refreshHealth={refreshHealth}
              health={health}
              healBusy={healBusy}
              healProgress={healProgress}
              handleHealAndReady={handleHealAndReady}
            />
          )}

          {tab === 'automation' && (
            <SettingsAutomationTab
              webhookSettings={webhookSettings}
              setWebhookSettings={setWebhookSettings}
              avoidedTokens={avoidedTokens}
              avoidedTokenDraft={avoidedTokenDraft}
              setAvoidedTokenDraft={setAvoidedTokenDraft}
              avoidancePreviewPrompt={avoidancePreviewPrompt}
              setAvoidancePreviewPrompt={setAvoidancePreviewPrompt}
              avoidancePreview={avoidancePreview}
              setAvoidancePreview={setAvoidancePreview}
              webhookLog={webhookLog}
              webhookEventFilter={webhookEventFilter}
              setWebhookEventFilter={setWebhookEventFilter}
              expandedWebhookLogId={expandedWebhookLogId}
              setExpandedWebhookLogId={setExpandedWebhookLogId}
              scheduledBatch={scheduledBatch}
              setScheduledBatch={setScheduledBatch}
              serverScheduledBatchStatus={serverScheduledBatchStatus}
              sharedSettings={sharedSettings}
              setStatus={setStatus}
            />
          )}

          {tab === 'data' && (
            <SettingsDataTab
              sharedSettings={sharedSettings}
              updateSharedSettings={updateSharedSettings}
              backupReminder={backupReminder}
              reloadBrowserSettingsState={reloadBrowserSettingsState}
              handleImport={handleImport}
              handleExportBackup={handleExportBackup}
              updateSettings={updateSettings}
              setStatus={setStatus}
            />
          )}

          {tab === 'advanced' && <SettingsAdvancedPanel />}

          {tab === 'users' ? <UsersSettingsPanel /> : null}

          {status && <p className="type-caption">{status}</p>}
        </div>
      </div>
    </ToolLayout>
  );
}
