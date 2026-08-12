'use client';

import Link from 'next/link';
import ServerEnvPanel from '@/components/settings/ServerEnvPanel';
import StorageHealthChip from '@/components/StorageHealthChip';
import { ToolSection, HealthCard } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import { settingsTabHref } from '@/lib/settings-nav';
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
  slimSettings?: boolean;
  onOpenComfyUiSection?: (section: ComfyUiSettingsSectionId) => void;
  onShowAllSettings?: () => void;
};

const ESSENTIAL_TASKS: Array<{
  title: string;
  description: string;
  section?: ComfyUiSettingsSectionId;
  href?: string;
}> = [
  {
    title: 'Connection',
    description: 'ComfyUI URL, tokens, and save settings.',
    section: 'connection',
  },
  {
    title: 'Workflow map',
    description: 'Assign models to workflows.',
    section: 'workflow-map',
  },
  {
    title: 'Model assets',
    description: 'Download curated checkpoints and helpers.',
    section: 'model-assets',
  },
  {
    title: 'LLM',
    description: 'Models, vision tags, and API health.',
    href: settingsTabHref('llm'),
  },
  {
    title: 'Backup & data',
    description: 'Export, sync, and restore studio data.',
    href: settingsTabHref('data'),
  },
];

export default function SettingsOverviewTab({
  health,
  loading,
  healBusy,
  handleHealAndReady,
  refreshHealth,
  sharedSettings,
  updateSharedSettings,
  setStatus,
  slimSettings = false,
  onOpenComfyUiSection,
  onShowAllSettings,
}: SettingsOverviewTabProps) {
  return (
    <>
      <ToolSection title="Get set up">
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ESSENTIAL_TASKS.map(task => {
            const content = (
              <>
                <p className="text-sm font-medium text-[var(--text-primary)]">{task.title}</p>
                <p className="mt-1 type-caption text-[var(--text-muted)]">{task.description}</p>
              </>
            );
            const className =
              'block rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgb(255_255_255_/0.03)] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.995]';

            if (task.section && onOpenComfyUiSection) {
              return (
                <button
                  key={task.title}
                  type="button"
                  className={className}
                  onClick={() => onOpenComfyUiSection(task.section!)}
                >
                  {content}
                </button>
              );
            }

            const href =
              task.href ??
              (task.section
                ? settingsComfyUiSectionHref(task.section)
                : settingsTabHref('overview'));
            return (
              <Link
                key={task.title}
                href={href}
                className={className}
                onClick={() => {
                  if (
                    slimSettings &&
                    (href === settingsTabHref('llm') || href === settingsTabHref('data'))
                  ) {
                    onShowAllSettings?.();
                  }
                }}
              >
                {content}
              </Link>
            );
          })}
        </div>

        {slimSettings && onShowAllSettings ? (
          <p className="mt-3 type-caption text-[var(--text-muted)]">
            Looking for automation, users, or sync?{' '}
            <button
              type="button"
              onClick={onShowAllSettings}
              className="text-[var(--accent-text)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Show all settings
            </button>
            .
          </p>
        ) : null}
      </ToolSection>

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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StorageHealthChip />
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
            {!slimSettings && health.diffusers ? (
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
            {!slimSettings && health.collab ? (
              <HealthCard
                title="Collab backend"
                ok={health.collab.redisConfigured ? health.collab.redisConnected : true}
                detail={[
                  health.collab.backend,
                  health.collab.redisConfigured
                    ? health.collab.redisConnected
                      ? 'Redis connected'
                      : 'Redis configured but unreachable'
                    : health.collab.filePersistence
                      ? 'file persistence'
                      : 'in-memory only',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : null}
          </div>
        )}

        {!slimSettings &&
        health?.comfyuiPool?.enabled &&
        health.comfyuiPool.endpoints.length > 0 ? (
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
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] shadow-inner shadow-[var(--shadow-surface)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:border-[var(--border-strong)]"
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
                className="mt-0.5 rounded border-[var(--border-default)] bg-[var(--bg-muted)] text-[var(--text-primary)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
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
                  className="w-full max-w-[8rem] rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)] px-3 py-2.5 text-sm text-[var(--text-primary)] shadow-inner shadow-[var(--shadow-surface)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:border-[var(--border-strong)]"
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

        {!slimSettings && health?.apiUsage ? (
          <ul className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
            <li>
              API usage (in-memory): {health.apiUsage.total} requests · {health.apiUsage.lastHour}{' '}
              last hour · {health.apiUsage.rateLimited} rate limited
            </li>
            <li>Server storage: {health.storage?.enabled ? 'enabled' : 'disabled'}</li>
          </ul>
        ) : null}

        {!slimSettings && health && (
          <ul className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
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
        slimSettings ? (
          <details className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] transition hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]">
              Server environment (.env.local)
            </summary>
            <div className="mt-4">
              <ServerEnvPanel
                groups={health.serverEnv.groups}
                llmOk={health.llm.ok}
                comfyOk={health.comfyui.ok}
                onRefreshHealth={() => void refreshHealth()}
                onStatus={setStatus}
              />
            </div>
          </details>
        ) : (
          <ServerEnvPanel
            groups={health.serverEnv.groups}
            llmOk={health.llm.ok}
            comfyOk={health.comfyui.ok}
            onRefreshHealth={() => void refreshHealth()}
            onStatus={setStatus}
          />
        )
      ) : null}
    </>
  );
}
