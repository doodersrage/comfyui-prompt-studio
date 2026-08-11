'use client';

import ComfyUiGalleryPanel from '@/components/ComfyUiGalleryPanel';
import SettingsBundlePanel from '@/components/settings/SettingsBundlePanel';
import { STUDIO_BACKUP_LAST_EXPORT_KEY } from '@/lib/studio-backup-meta';
import { writeBrowserString } from '@/lib/browser-storage';
import { clearAllLocalPromptData, LOCAL_DATA_KEYS } from '@/lib/local-data-reset';
import { DEFAULT_COMFYUI_SETTINGS, resetComfyUiSettings } from '@/lib/comfyui-settings';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { ComfyUiSettings } from '@/lib/comfyui-settings';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { TextArea, FieldLabel, TextInput } from '@/components/ui/Field';
import { normalizeGalleryWorkflowRetentionDays } from '@/lib/gallery-workflow-hygiene';
import { loadLocalObservability } from '@/lib/local-observability';

export type SettingsDataTabProps = {
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  backupReminder: string | null;
  setBackupReminder: (value: string | null) => void;
  reloadBrowserSettingsState: () => void;
  handleImport: (file: File) => void | Promise<void>;
  updateSettings: (patch: Partial<ComfyUiSettings>) => void;
  setStatus: (status: string | null) => void;
};

export default function SettingsDataTab({
  sharedSettings,
  updateSharedSettings,
  backupReminder,
  setBackupReminder,
  reloadBrowserSettingsState,
  handleImport,
  updateSettings,
  setStatus,
}: SettingsDataTabProps) {
  const metrics = loadLocalObservability();

  return (
    <>
      <ToolSection>
        <ComfyUiGalleryPanel limit={6} compact showHeader />
      </ToolSection>

      <ToolSection title="Gallery exact-replay graphs">
        <p className="text-sm text-[var(--text-secondary)]">
          Stored workflow JSON enables Replay exact graph. Older graphs are pruned to keep IndexedDB
          lean (0 = keep forever). Sidecar/ZIP exports omit graph bodies by default.
        </p>
        <FieldLabel
          htmlFor="gallery-workflow-retention"
          hint="Days to keep stored exact-replay graphs"
        >
          Retention (days)
        </FieldLabel>
        <TextInput
          id="gallery-workflow-retention"
          type="number"
          min={0}
          max={365}
          value={normalizeGalleryWorkflowRetentionDays(sharedSettings.galleryWorkflowRetentionDays)}
          onChange={event =>
            updateSharedSettings({
              galleryWorkflowRetentionDays: normalizeGalleryWorkflowRetentionDays(
                Number(event.target.value)
              ),
            })
          }
          className={accentFocusClass()}
        />
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Local metrics · first success {metrics.firstQueueSuccess} · exact replay{' '}
          {metrics.exactReplay} · playbook opens {metrics.playbookCtaClick}
        </p>
      </ToolSection>

      <ToolSection title="Active character descriptor">
        <p className="text-sm text-[var(--text-secondary)]">
          Shared mandatory descriptor injected into Character generation requests.
        </p>
        <TextArea
          rows={3}
          value={sharedSettings.activeCharacterDescriptor ?? ''}
          onChange={event =>
            updateSharedSettings({
              activeCharacterDescriptor: event.target.value.trim() || undefined,
            })
          }
          placeholder="e.g. athletic woman, mid-20s, short copper hair, green eyes"
          className={accentFocusClass()}
        />
      </ToolSection>

      <SettingsBundlePanel onImported={reloadBrowserSettingsState} onStatus={setStatus} />

      <ToolSection title="Local data">
        <p className="text-sm text-[var(--text-secondary)]">
          Full studio backup includes history, settings, scene presets, user templates, location
          blocklist, ComfyUI settings, gallery entries, workflow JSON (v2), avoided tokens, webhook
          log/settings, projects, and scheduled batch (v3). Prefer Settings export above when you
          only need prefs.
        </p>
        {backupReminder ? <p className="mb-3 text-sm text-amber-300/90">{backupReminder}</p> : null}
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              void import('@/lib/studio-backup').then(({ downloadStudioBackup }) => {
                downloadStudioBackup();
                writeBrowserString(STUDIO_BACKUP_LAST_EXPORT_KEY, String(Date.now()));
                setBackupReminder(null);
                setStatus('Studio backup downloaded.');
              });
            }}
            className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            Export backup
          </button>
          <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] hover:border-[var(--border-strong)]">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImport(file);
                }
                event.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm('Clear all local prompt history, settings, presets, and templates?')
              ) {
                clearAllLocalPromptData();
                resetComfyUiSettings();
                updateSettings(DEFAULT_COMFYUI_SETTINGS);
                setStatus('Local data cleared. Reload the page.');
              }
            }}
            className="rounded-lg border border-rose-800/60 px-4 py-2 text-rose-200 hover:border-rose-500"
          >
            Reset local data
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">Keys: {LOCAL_DATA_KEYS.join(', ')}</p>
      </ToolSection>
    </>
  );
}
