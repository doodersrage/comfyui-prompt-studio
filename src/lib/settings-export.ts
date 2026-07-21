import {
  loadSettingsCache,
  saveSharedSettings,
  type SharedToolSettings,
} from "./settings-cache";
import {
  loadComfyUiSettings,
  saveComfyUiSettings,
  type ComfyUiSettings,
} from "./comfyui-settings";
import {
  loadWebhookSettings,
  saveWebhookSettings,
  type WebhookSettings,
} from "./webhook-settings";
import {
  loadScheduledBatchConfig,
  saveScheduledBatchConfig,
  type ScheduledBatchConfig,
} from "./scheduled-batch";
import { exportAvoidedTokenList, saveAvoidedTokens } from "./avoided-tokens";

export const SETTINGS_BUNDLE_VERSION = 1;

/**
 * Lightweight "settings only" export/import — no history, gallery, presets, or
 * workflow library. See `studio-backup.ts` for the full studio backup.
 */
export type SettingsBundleV1 = {
  version: 1;
  exportedAt: string;
  shared: SharedToolSettings;
  comfyUiSettings?: ComfyUiSettings;
  webhookSettings?: WebhookSettings;
  scheduledBatch?: ScheduledBatchConfig;
  avoidedTokens?: string[];
};

export type SettingsBundle = SettingsBundleV1;

export function exportSettingsBundle(): SettingsBundle {
  return {
    version: SETTINGS_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    shared: loadSettingsCache().shared,
    comfyUiSettings: loadComfyUiSettings(),
    webhookSettings: loadWebhookSettings(),
    scheduledBatch: loadScheduledBatchConfig(),
    avoidedTokens: exportAvoidedTokenList(),
  };
}

export function parseSettingsBundle(json: string): SettingsBundle {
  const parsed = JSON.parse(json) as Partial<SettingsBundle> | null;
  if (
    !parsed ||
    parsed.version !== SETTINGS_BUNDLE_VERSION ||
    !parsed.shared ||
    typeof parsed.shared !== "object"
  ) {
    throw new Error("Invalid settings bundle file.");
  }
  return parsed as SettingsBundle;
}

export function importSettingsBundle(data: SettingsBundle): void {
  if (data.version !== SETTINGS_BUNDLE_VERSION) {
    throw new Error("Unsupported settings bundle version.");
  }

  const cache = loadSettingsCache();
  saveSharedSettings({ ...cache.shared, ...data.shared });

  if (data.comfyUiSettings) {
    saveComfyUiSettings({ ...loadComfyUiSettings(), ...data.comfyUiSettings });
  }
  if (data.webhookSettings) {
    saveWebhookSettings({ ...loadWebhookSettings(), ...data.webhookSettings });
  }
  if (data.scheduledBatch) {
    saveScheduledBatchConfig({
      ...loadScheduledBatchConfig(),
      ...data.scheduledBatch,
    });
  }
  if (data.avoidedTokens) {
    saveAvoidedTokens(data.avoidedTokens);
  }
}

export function downloadSettingsBundle(): void {
  const payload = JSON.stringify(exportSettingsBundle(), null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `prompt-studio-settings-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
