'use client';

import ComfyClusterSettingsPanel from '@/components/settings/ComfyClusterSettingsPanel';
import { WORKFLOW_PARAM_TOKEN_HELP } from '@/lib/comfyui-config';
import type { SettingsComfyConnectionPanelProps } from '@/components/settings/panels/settings-comfy-connection-types';

type Props = Pick<
  SettingsComfyConnectionPanelProps,
  | 'settings'
  | 'updateSettings'
  | 'sharedSettings'
  | 'sharedMounted'
  | 'updateSharedSettings'
  | 'health'
  | 'refreshHealth'
  | 'updateQueueParam'
>;

export function SettingsComfyConnectionBasicsSection({
  settings,
  updateSettings,
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  health,
  refreshHealth,
  updateQueueParam,
}: Props) {
  return (
    <>
      <p className="text-sm text-[var(--text-secondary)]">
        Override the server&apos;s <code className="ui-inline-code">COMFYUI_*</code> env vars for
        this browser: API URL, placeholder tokens, queue params, and an optional fallback workflow
        when no library file is selected.
      </p>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={settings.useServerDefaults}
          onChange={event => updateSettings({ useServerDefaults: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-muted)] accent-[var(--accent)]"
        />
        Use server defaults (ignore local ComfyUI overrides)
      </label>

      <div
        className={`grid gap-4 ${settings.useServerDefaults ? 'pointer-events-none opacity-50' : ''}`}
      >
        <div className="space-y-1">
          <label htmlFor="comfy-url" className="text-xs text-[var(--text-secondary)]">
            ComfyUI API URL
          </label>
          <input
            id="comfy-url"
            value={settings.apiUrl ?? ''}
            onChange={event => updateSettings({ apiUrl: event.target.value })}
            placeholder="http://127.0.0.1:8188"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </div>

        <ComfyClusterSettingsPanel
          sharedSettings={sharedSettings}
          sharedMounted={sharedMounted}
          updateSharedSettings={updateSharedSettings}
          health={health}
          onRefreshHealth={refreshHealth}
        />
        <div className="space-y-1">
          <label htmlFor="positive-token" className="text-xs text-[var(--text-secondary)]">
            Positive placeholder token
          </label>
          <input
            id="positive-token"
            value={settings.positiveToken ?? ''}
            onChange={event => updateSettings({ positiveToken: event.target.value })}
            placeholder="{{POSITIVE}}"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="negative-token" className="text-xs text-[var(--text-secondary)]">
            Negative placeholder token (optional)
          </label>
          <input
            id="negative-token"
            value={settings.negativeToken ?? ''}
            onChange={event => updateSettings({ negativeToken: event.target.value })}
            placeholder="{{NEGATIVE}}"
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">Queue parameter placeholders</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ['seed', 'Seed (empty = random per job)'],
                ['width', 'Width'],
                ['height', 'Height'],
                ['cfg', 'CFG'],
                ['steps', 'Steps'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs text-[var(--text-secondary)]">
                {label}
                <input
                  value={settings.queueParams?.[key]?.toString() ?? ''}
                  onChange={event => updateQueueParam(key, event.target.value)}
                  placeholder={
                    key === 'seed'
                      ? 'random'
                      : key === 'width' || key === 'height'
                        ? '1024'
                        : key === 'cfg'
                          ? '7'
                          : '20'
                  }
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]"
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Use tokens in workflow JSON:{' '}
            {WORKFLOW_PARAM_TOKEN_HELP.map(token => (
              <code key={token} className="mr-1 ui-inline-code">
                {token}
              </code>
            ))}
          </p>
        </div>
      </div>
    </>
  );
}
