'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { HealthResponse } from '@/components/settings/tabs/settings-tool-shared';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';

type ComfyClusterSettingsPanelProps = {
  sharedSettings: SharedToolSettings;
  sharedMounted: boolean;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  health: HealthResponse | null;
  onRefreshHealth?: () => void | Promise<void>;
};

export default function ComfyClusterSettingsPanel({
  sharedSettings,
  sharedMounted,
  updateSharedSettings,
  health,
  onRefreshHealth,
}: ComfyClusterSettingsPanelProps) {
  const [draftUrl, setDraftUrl] = useState('');
  const [probeStatus, setProbeStatus] = useState<string | null>(null);
  const [probingUrl, setProbingUrl] = useState<string | null>(null);
  const extras = sharedSettings.comfyPoolUrls ?? [];
  const envEndpoints = health?.comfyuiPool?.endpoints ?? [];

  const addUrl = (raw: string) => {
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (!trimmed) {
      return;
    }
    if (extras.some(url => url.replace(/\/+$/, '').toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    updateSharedSettings({ comfyPoolUrls: [...extras, trimmed] });
    setDraftUrl('');
  };

  const probe = async (url: string) => {
    setProbingUrl(url);
    setProbeStatus(null);
    try {
      const response = await fetch('/api/comfyui/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; url?: string };
      if (!response.ok || !data.ok) {
        setProbeStatus(data.error ?? 'Unreachable.');
        return;
      }
      setProbeStatus(`Reachable · ${data.url ?? url}`);
      await onRefreshHealth?.();
    } catch (error) {
      setProbeStatus(error instanceof Error ? error.message : 'Probe failed.');
    } finally {
      setProbingUrl(null);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-4">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">ComfyUI cluster</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          Extra pool members are saved in Settings and merged with{' '}
          <code className="ui-inline-code">COMFYUI_POOL</code> at queue time. Host allowlists stay
          in <code className="ui-inline-code">.env.local</code>.
        </p>
      </div>

      {envEndpoints.length > 0 ? (
        <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
          {envEndpoints.map(endpoint => (
            <li key={`env-${endpoint.url}`}>
              Env · {endpoint.ok ? 'up' : 'down'} · {endpoint.url}
              {endpoint.queuePending != null
                ? ` · ${endpoint.queueRunning ?? 0} running / ${endpoint.queuePending} pending`
                : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          No env pool set. Add members below or pin a single URL above.
        </p>
      )}

      <ul className="space-y-2">
        {extras.map(url => (
          <li
            key={url}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2"
          >
            <span className="min-w-0 truncate font-mono text-xs text-[var(--text-secondary)]">
              {url}
            </span>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!sharedMounted || probingUrl === url}
                onClick={() => void probe(url)}
              >
                {probingUrl === url ? 'Probing…' : 'Test'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!sharedMounted}
                onClick={() =>
                  updateSharedSettings({
                    comfyPoolUrls: extras.filter(entry => entry !== url),
                    preferredComfyHost:
                      sharedSettings.preferredComfyHost === url
                        ? undefined
                        : sharedSettings.preferredComfyHost,
                  })
                }
              >
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <input
          value={draftUrl}
          disabled={!sharedMounted}
          placeholder="http://127.0.0.1:8189"
          onChange={event => setDraftUrl(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addUrl(draftUrl);
            }
          }}
          className="ui-input min-w-[16rem] flex-1 font-mono text-sm"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!sharedMounted || !draftUrl.trim()}
          onClick={() => addUrl(draftUrl)}
        >
          Add host
        </Button>
      </div>
      {probeStatus ? <p className="text-xs text-[var(--text-muted)]">{probeStatus}</p> : null}

      <div className="space-y-1.5">
        <label htmlFor="cluster-preferred-host" className="text-xs text-[var(--text-secondary)]">
          Preferred pool host
        </label>
        <select
          id="cluster-preferred-host"
          disabled={!sharedMounted}
          value={sharedSettings.preferredComfyHost ?? ''}
          onChange={event =>
            updateSharedSettings({
              preferredComfyHost: event.target.value.trim() || undefined,
            })
          }
          className="ui-input w-full text-sm"
        >
          <option value="">Auto (VRAM / round-robin)</option>
          {[...envEndpoints.map(endpoint => endpoint.url), ...extras].map(url => (
            <option key={url} value={url}>
              {url}
            </option>
          ))}
        </select>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          disabled={!sharedMounted}
          checked={sharedSettings.comfyPoolLoadBalance !== false}
          onChange={event =>
            updateSharedSettings({
              comfyPoolLoadBalance: event.target.checked,
            })
          }
          className="mt-0.5 rounded border-[var(--border-default)]"
        />
        <span className="space-y-0.5">
          <span className="block text-sm text-[var(--text-primary)]">Load-balance across pool</span>
          <span className="block text-xs text-[var(--text-muted)]">
            Skip hosts at or above the busy threshold and pick the least-loaded remaining server.
          </span>
        </span>
      </label>

      {sharedSettings.comfyPoolLoadBalance !== false ? (
        <label className="block space-y-1.5 text-xs text-[var(--text-secondary)]">
          Busy threshold (pending + running)
          <input
            type="number"
            min={0}
            max={64}
            step={1}
            disabled={!sharedMounted}
            value={sharedSettings.comfyPoolBusyThreshold ?? 4}
            onChange={event => {
              const parsed = Number(event.target.value);
              updateSharedSettings({
                comfyPoolBusyThreshold: Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined,
              });
            }}
            className="ui-input max-w-[8rem] text-sm"
          />
        </label>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          disabled={!sharedMounted}
          checked={sharedSettings.autoRetryOnOom !== false}
          onChange={event => updateSharedSettings({ autoRetryOnOom: event.target.checked })}
          className="mt-0.5 rounded border-[var(--border-default)]"
        />
        <span className="space-y-0.5">
          <span className="block text-sm text-[var(--text-primary)]">
            Retry on OOM or unreachable host
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            Switch to another pool host after out-of-memory or connection refused / timeout.
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          disabled={!sharedMounted}
          checked={sharedSettings.oomRetryDowngrade !== false}
          onChange={event => updateSharedSettings({ oomRetryDowngrade: event.target.checked })}
          className="mt-0.5 rounded border-[var(--border-default)]"
        />
        <span className="space-y-0.5">
          <span className="block text-sm text-[var(--text-primary)]">
            Downgrade quality on OOM retry
          </span>
          <span className="block text-xs text-[var(--text-muted)]">
            Max jobs fall back to Final on the retry host.
          </span>
        </span>
      </label>

      <p className="text-[11px] text-[var(--text-muted)]">
        SSRF guards (<code className="ui-inline-code">COMFYUI_ALLOW_CLIENT_URL</code>,{' '}
        <code className="ui-inline-code">COMFYUI_ALLOWED_HOSTS</code>) stay in env.{' '}
        <Link href={settingsComfyUiSectionHref('connection')} className="text-[var(--accent-text)]">
          Connection section
        </Link>
      </p>
    </div>
  );
}
