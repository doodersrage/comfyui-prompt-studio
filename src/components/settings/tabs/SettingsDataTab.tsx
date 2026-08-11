'use client';

import Link from 'next/link';
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
import {
  normalizeGalleryWorkflowMaxBytes,
  normalizeGalleryWorkflowRetentionDays,
} from '@/lib/gallery-workflow-hygiene';
import { loadLocalObservability, summarizeLocalReliability } from '@/lib/local-observability';

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

function formatRate(value: number | null): string {
  if (value == null) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

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
  const reliability = summarizeLocalReliability(metrics);
  const maxBytes = normalizeGalleryWorkflowMaxBytes(sharedSettings.galleryWorkflowMaxBytes);
  const maxMb = maxBytes <= 0 ? 0 : Math.round((maxBytes / (1024 * 1024)) * 10) / 10;

  return (
    <>
      <ToolSection>
        <ComfyUiGalleryPanel limit={6} compact showHeader />
      </ToolSection>

      <ToolSection title="Reliability">
        <p className="text-sm text-[var(--text-secondary)]">{reliability.headline}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
            <dt className="text-xs text-[var(--text-muted)]">Exact-replay share</dt>
            <dd className="mt-1 text-lg text-[var(--text-primary)]">
              {formatRate(reliability.replayHitRate)}
            </dd>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {metrics.exactReplay} replays · {metrics.firstQueueSuccess} first successes
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
            <dt className="text-xs text-[var(--text-muted)]">Playbook CTA rate</dt>
            <dd className="mt-1 text-lg text-[var(--text-primary)]">
              {formatRate(reliability.playbookClickRate)}
            </dd>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {metrics.playbookCtaClick} opens · {metrics.queueFailures} failures
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
            <dt className="text-xs text-[var(--text-muted)]">Setup completion</dt>
            <dd className="mt-1 text-lg text-[var(--text-primary)]">
              {formatRate(reliability.setupCompletionRate)}
            </dd>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {metrics.firstQueueSetupCompleted}/{metrics.firstQueueSetupShown} · dismissals{' '}
              {metrics.firstQueueSetupDismissed}
            </p>
          </div>
        </dl>
        {metrics.lastFailureMessage ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Last failure
            {metrics.lastFailureAt
              ? ` · ${new Date(metrics.lastFailureAt).toLocaleString()}`
              : ''}: {metrics.lastFailureMessage}
            {metrics.lastFailureHref ? (
              <>
                {' '}
                <Link
                  href={metrics.lastFailureHref}
                  className="text-[var(--accent-text)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                >
                  Open fix
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {metrics.lastBlockedSetupStep ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            First-queue funnel often blocked on{' '}
            <span className="text-[var(--text-secondary)]">{metrics.lastBlockedSetupStep}</span>
            {metrics.firstQueueSetupStepFails[metrics.lastBlockedSetupStep]
              ? ` (${metrics.firstQueueSetupStepFails[metrics.lastBlockedSetupStep]}×)`
              : ''}
            .
          </p>
        ) : null}
      </ToolSection>

      <ToolSection title="Gallery exact-replay graphs">
        <p className="text-sm text-[var(--text-secondary)]">
          Stored workflow JSON enables Replay exact graph. Older graphs are pruned by age, then by a
          total byte budget so IndexedDB stays lean (0 = unlimited). Sidecar/ZIP exports omit graph
          bodies by default.
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
        <div className="mt-4">
          <FieldLabel
            htmlFor="gallery-workflow-max-mb"
            hint="Drop oldest non-favorite graphs when total stored JSON exceeds this"
          >
            Max stored graphs (MiB)
          </FieldLabel>
          <TextInput
            id="gallery-workflow-max-mb"
            type="number"
            min={0}
            max={64}
            step={0.5}
            value={maxMb}
            onChange={event =>
              updateSharedSettings({
                galleryWorkflowMaxBytes: normalizeGalleryWorkflowMaxBytes(
                  Number(event.target.value) * 1024 * 1024
                ),
              })
            }
            className={accentFocusClass()}
          />
        </div>
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
            className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Export backup
          </button>
          <label className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]">
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
            className="rounded-lg border border-rose-800/60 px-4 py-2 text-rose-200 transition hover:border-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Reset local data
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">Keys: {LOCAL_DATA_KEYS.join(', ')}</p>
      </ToolSection>
    </>
  );
}
