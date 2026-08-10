'use client';

import ServerEnvPanel from '@/components/settings/ServerEnvPanel';
import { ToolSection, HealthCard } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { HealthResponse } from '@/components/settings/tabs/settings-tool-shared';

export type SettingsOverviewTabProps = {
  health: HealthResponse | null;
  loading: boolean;
  healBusy: boolean;
  handleHealAndReady: () => void | Promise<void>;
  refreshHealth: () => void | Promise<void>;
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  setStatus: (status: string | null) => void;
};

export default function SettingsOverviewTab({
  health,
  loading,
  healBusy,
  handleHealAndReady,
  refreshHealth,
  sharedSettings,
  updateSharedSettings,
  setStatus,
}: SettingsOverviewTabProps) {
  return (
    <>
      <ToolSection title="Appearance & chrome">
        <p className="text-sm text-[var(--text-secondary)]">
          Theme (Auto / Light / Dark), ambient intensity, density, and queue toasts live in{' '}
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
              <p className="text-sm font-medium text-[var(--accent-text)]">Heal & ready</p>
              <p className="type-caption text-[var(--text-secondary)]">
                One click for new installs: enable system workflows, merge suggested loader maps,
                adapt from ComfyUI inventory when reachable, and refresh health.
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
                health.llm.enabled ? health.llm.model : 'disabled',
                health.llm.baseUrl,
                health.llm.enabled && typeof health.llm.inFlight === 'number'
                  ? `LLM busy: ${health.llm.inFlight}/${health.llm.maxInflight ?? '?'} in flight`
                  : null,
                health.llm.error,
              ]
                .filter(Boolean)
                .join(' · ')}
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
                .join(' · ')}
            />
            {health.diffusers ? (
              <HealthCard
                title="Diffusers"
                ok={health.diffusers.ok}
                detail={[
                  health.diffusers.url,
                  health.diffusers.device,
                  health.diffusers.model,
                  health.diffusers.mock ? 'mock' : null,
                  health.diffusers.error,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : null}
          </div>
        )}

        {health?.comfyuiPool?.enabled && health.comfyuiPool.endpoints.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="type-caption text-[var(--text-secondary)]">ComfyUI pool endpoints</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {health.comfyuiPool.endpoints.map(endpoint => (
                <HealthCard
                  key={endpoint.url}
                  title={`Pool #${endpoint.index + 1}${
                    sharedSettings.preferredComfyHost?.replace(/\/+$/, '') ===
                    endpoint.url.replace(/\/+$/, '')
                      ? ' · preferred'
                      : ''
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
                    .join(' · ')}
                />
              ))}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="preferred-comfy-host"
                className="text-xs text-[var(--text-secondary)]"
              >
                Preferred pool host
              </label>
              <select
                id="preferred-comfy-host"
                value={sharedSettings.preferredComfyHost ?? ''}
                onChange={event =>
                  updateSharedSettings({
                    preferredComfyHost: event.target.value.trim() || undefined,
                  })
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] shadow-inner shadow-[var(--shadow-surface)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 active:border-[var(--border-strong)]"
              >
                <option value="">Auto (VRAM / round-robin)</option>
                {health.comfyuiPool.endpoints.map(endpoint => (
                  <option key={endpoint.url} value={endpoint.url}>
                    {endpoint.ok ? '●' : '○'} Pool #{endpoint.index + 1} — {endpoint.url}
                    {endpoint.ok ? '' : ' (unhealthy)'}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                When the preferred host is in the pool and healthy, queues use it first. Unhealthy
                or busy preferred hosts fall back to the least-loaded pool server.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sharedSettings.comfyPoolLoadBalance !== false}
                onChange={event =>
                  updateSharedSettings({
                    comfyPoolLoadBalance: event.target.checked,
                  })
                }
                className="mt-0.5 rounded border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-primary)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 active:scale-[0.98]"
              />
              <span className="space-y-0.5">
                <span className="block text-sm text-[var(--text-primary)]">
                  Load-balance across pool
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  Before each queue, refresh pool queue depth and skip hosts that exceed the busy
                  threshold. Rotates to the next least-loaded server automatically.
                </span>
              </span>
            </label>
            {sharedSettings.comfyPoolLoadBalance !== false ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="comfy-pool-busy-threshold"
                  className="text-xs text-[var(--text-secondary)]"
                >
                  Busy threshold (pending + running jobs)
                </label>
                <input
                  id="comfy-pool-busy-threshold"
                  type="number"
                  min={0}
                  max={64}
                  step={1}
                  value={sharedSettings.comfyPoolBusyThreshold ?? 4}
                  onChange={event => {
                    const parsed = Number(event.target.value);
                    updateSharedSettings({
                      comfyPoolBusyThreshold:
                        Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined,
                    });
                  }}
                  className="w-full max-w-[8rem] rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] shadow-inner shadow-[var(--shadow-surface)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 active:border-[var(--border-strong)]"
                />
                <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                  Hosts at or above this queue depth are skipped. Override server default with{' '}
                  <code className="rounded bg-[var(--bg-elevated)] px-1">
                    COMFYUI_POOL_BUSY_THRESHOLD
                  </code>
                  .
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {health?.apiUsage ? (
          <ul className="space-y-1 text-xs text-[var(--text-muted)]">
            <li>
              API usage (in-memory): {health.apiUsage.total} requests · {health.apiUsage.lastHour}{' '}
              last hour · {health.apiUsage.rateLimited} rate limited
            </li>
            <li>Server storage: {health.storage?.enabled ? 'enabled' : 'disabled'}</li>
          </ul>
        ) : null}

        {health && (
          <ul className="space-y-1 text-xs text-[var(--text-muted)]">
            <li>Vision model: {health.config.visionModel}</li>
            <li>
              Template fallback: {health.config.allowTemplateFallback ? 'allowed' : 'disabled'}
            </li>
            {health.workflow && (
              <li>
                Active workflow: {health.workflow.workflowSource}
                {health.workflow.hasWorkflow
                  ? ` · ${health.workflow.placeholders.positive}× ${health.workflow.placeholderTokens.positive}${
                      health.workflow.placeholders.negative > 0
                        ? ` · ${health.workflow.placeholders.negative}× ${health.workflow.placeholderTokens.negative}`
                        : ''
                    }`
                  : ' · minimal fallback workflow'}
                {health.workflow.legacyNodeFallback ? ' · env node-ID fallback available' : ''}
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
  );
}
