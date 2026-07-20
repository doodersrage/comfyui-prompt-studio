import {
  loadLocationBlocklist,
  PROMPT_HISTORY_KEY,
  saveLocationBlocklist,
  type PromptHistoryEntry,
} from "@/hooks/usePromptHistory";
import {
  loadSettingsCache,
  saveSettingsCache,
  SETTINGS_CACHE_KEY,
  type SettingsCache,
} from "@/lib/settings-cache";
import {
  loadScenePresets,
  saveScenePresets,
  type ScenePreset,
} from "@/lib/scene-presets";
import {
  loadUserTemplates,
  saveUserTemplates,
  type UserPromptTemplate,
} from "@/lib/user-templates";
import {
  loadComfyGallery,
  saveComfyGallery,
  type ComfyGalleryEntry,
} from "@/lib/comfyui-gallery";
import {
  loadComfyUiSettings,
  saveComfyUiSettings,
  type ComfyUiSettings,
} from "@/lib/comfyui-settings";
import {
  loadComfyWorkflowFiles,
  saveComfyWorkflowFiles,
  type ComfyWorkflowFile,
} from "@/lib/comfyui-workflow-files";
import {
  loadComfyWorkflowPresets,
  saveComfyWorkflowPresets,
  type ComfyWorkflowPreset,
} from "@/lib/comfyui-workflow-presets";
import { exportAvoidedTokenList, saveAvoidedTokens } from "@/lib/avoided-tokens";
import { WEBHOOK_LOG_KEY, loadWebhookLog, type WebhookLogEntry } from "@/lib/webhook-log";
import { readBrowserValue, writeBrowserValue } from "@/lib/browser-storage";
import {
  ACTIVE_PROJECT_KEY,
  loadActiveProjectId,
  loadPromptProjects,
  savePromptProjects,
  setActiveProjectId,
  type PromptProject,
} from "@/lib/prompt-projects";
import {
  loadScheduledBatchConfig,
  saveScheduledBatchConfig,
  type ScheduledBatchConfig,
} from "@/lib/scheduled-batch";
import {
  loadWebhookSettings,
  saveWebhookSettings,
  type WebhookSettings,
} from "@/lib/webhook-settings";

export type StudioBackupV1 = {
  version: 1;
  exportedAt: string;
  history: PromptHistoryEntry[];
  locationBlocklist: string[];
  settings: SettingsCache;
  scenePresets?: ScenePreset[];
  userTemplates?: UserPromptTemplate[];
};

export type StudioBackupV2 = Omit<StudioBackupV1, "version"> & {
  version: 2;
  comfyUiSettings?: ComfyUiSettings;
  comfyGallery?: ComfyGalleryEntry[];
  comfyWorkflowPresets?: ComfyWorkflowPreset[];
  comfyWorkflowFiles?: ComfyWorkflowFile[];
};

export type StudioBackupV3 = Omit<StudioBackupV2, "version"> & {
  version: 3;
  avoidedTokens?: string[];
  webhookLog?: WebhookLogEntry[];
  promptProjects?: PromptProject[];
  activeProjectId?: string;
  scheduledBatch?: ScheduledBatchConfig;
  webhookSettings?: WebhookSettings;
};

export type StudioBackup = StudioBackupV1 | StudioBackupV2 | StudioBackupV3;

export function exportStudioBackup(): StudioBackupV3 {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    history: loadHistoryFromStorage(),
    locationBlocklist: loadLocationBlocklist(),
    settings: loadSettingsCache(),
    scenePresets: loadScenePresets(),
    userTemplates: loadUserTemplates(),
    comfyUiSettings: loadComfyUiSettings(),
    comfyGallery: loadComfyGallery(),
    comfyWorkflowPresets: loadComfyWorkflowPresets(),
    comfyWorkflowFiles: loadComfyWorkflowFiles(),
    avoidedTokens: exportAvoidedTokenList(),
    webhookLog: loadWebhookLog(),
    promptProjects: loadPromptProjects(),
    activeProjectId: loadActiveProjectId(),
    scheduledBatch: loadScheduledBatchConfig(),
    webhookSettings: loadWebhookSettings(),
  };
}

export function importStudioBackup(backup: StudioBackup): void {
  if (backup.version !== 1 && backup.version !== 2 && backup.version !== 3) {
    throw new Error("Unsupported backup version.");
  }

  writeBrowserValue(PROMPT_HISTORY_KEY, backup.history.slice(0, 100));
  saveLocationBlocklist(backup.locationBlocklist);
  saveSettingsCache(backup.settings);
  if (backup.scenePresets) {
    saveScenePresets(backup.scenePresets);
  }
  if (backup.userTemplates) {
    saveUserTemplates(backup.userTemplates);
  }

  if (backup.version === 2 || backup.version === 3) {
    if (backup.comfyUiSettings) {
      saveComfyUiSettings(backup.comfyUiSettings);
    }
    if (backup.comfyGallery) {
      saveComfyGallery(backup.comfyGallery);
    }
    if (backup.comfyWorkflowPresets) {
      saveComfyWorkflowPresets(backup.comfyWorkflowPresets);
    }
    if (backup.comfyWorkflowFiles) {
      saveComfyWorkflowFiles(backup.comfyWorkflowFiles);
    }
  }

  if (backup.version === 3) {
    if (backup.avoidedTokens) {
      saveAvoidedTokens(backup.avoidedTokens);
    }
    if (backup.webhookLog) {
      writeBrowserValue(WEBHOOK_LOG_KEY, backup.webhookLog);
    }
    if (backup.promptProjects) {
      savePromptProjects(backup.promptProjects);
    }
    if (backup.activeProjectId) {
      setActiveProjectId(backup.activeProjectId);
    } else {
      setActiveProjectId(undefined);
    }
    if (backup.scheduledBatch) {
      saveScheduledBatchConfig(backup.scheduledBatch);
    }
    if (backup.webhookSettings) {
      saveWebhookSettings(backup.webhookSettings);
    }
  }
}

export function downloadStudioBackup(): void {
  const payload = JSON.stringify(exportStudioBackup(), null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `prompt-studio-backup-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadHistoryFromStorage(): PromptHistoryEntry[] {
  try {
    return readBrowserValue<PromptHistoryEntry[]>(PROMPT_HISTORY_KEY) ?? [];
  } catch {
    return [];
  }
}

export function parseStudioBackupFile(raw: string): StudioBackup {
  const parsed = JSON.parse(raw) as StudioBackup;
  if (
    !parsed ||
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) ||
    !Array.isArray(parsed.history)
  ) {
    throw new Error("Invalid studio backup file.");
  }
  return parsed;
}

export function downloadHistoryExport(entries: PromptHistoryEntry[]): void {
  const payload = JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `prompt-history-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { SETTINGS_CACHE_KEY };
