'use client';

import { useState } from 'react';
import Link from 'next/link';
import ServerEnvPanel from '@/components/settings/ServerEnvPanel';
import StorageHealthChip from '@/components/StorageHealthChip';
import { ToolSection, HealthCard } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import ReportBugLink from '@/components/ReportBugLink';
import type { SharedToolSettings } from '@/lib/settings-cache';
import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import { settingsTabHref } from '@/lib/settings-nav';
import type { HealthResponse } from '@/components/settings/tabs/settings-tool-shared';
import { formatPoolQueueStrip, summarizePoolQueueDepth } from '@/lib/comfyui-host-ready';

export type SettingsOverviewTabProps = {
  health: HealthResponse | null;
  loading: boolean;
  healBusy: boolean;
  healProgress?: string | null;
  handleHealAndReady: () => void | Promise<void>;
  refreshHealth: () => void | Promise<void>;
  sharedSettings: SharedToolSettings;
  updateSharedSettings: (patch: Partial<SharedToolSettings>) => void;
  setStatus: (status: string | null) => void;
  slimSettings?: boolean;
  onOpenComfyUiSection?: (section: ComfyUiSettingsSectionId) => void;
  onShowAllSettings?: () => void;
  handleImport: (file: File) => void | Promise<void>;
  handleExportBackup: () => void;
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
  healProgress,
  handleHealAndReady,
  refreshHealth,
  sharedSettings,
  setStatus,
  slimSettings = false,
  onOpenComfyUiSection,
  onShowAllSettings,
  handleImport,
  handleExportBackup,
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
                adapt from ComfyUI inventory, install missing Manager packs on each pool host, wait
                for restart, and refresh health.
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
          {healBusy && healProgress ? (
            <p className="mt-2 type-caption text-[var(--accent-text)]">{healProgress}</p>
          ) : null}
          {health ? (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {(
                [
                  {
                    ok: health.llm.ok,
                    label: 'LLM',
                    detail: health.llm.enabled ? (health.llm.model ?? 'connected') : 'disabled',
                  },
                  {
                    ok: health.comfyui.ok,
                    label: 'ComfyUI',
                    detail: health.comfyui.error ?? health.comfyui.url,
                  },
                  ...(health.comfyuiPool?.enabled
                    ? [
                        {
                          ok: health.comfyuiPool.endpoints.some(endpoint => endpoint.ok),
                          label: 'Cluster',
                          detail: (() => {
                            const pool = summarizePoolQueueDepth(health.comfyuiPool.endpoints);
                            return `${health.comfyuiPool.endpoints.filter(endpoint => endpoint.ok).length}/${health.comfyuiPool.endpoints.length} hosts up · ${pool.totalRunning} running · ${pool.totalPending} pending`;
                          })(),
                        },
                      ]
                    : []),
                  {
                    ok: Boolean(health.config.visionModel?.trim()),
                    label: 'Vision model',
                    detail: health.config.visionModel?.trim() || 'unset — vision tools will fail',
                  },
                  {
                    ok: Boolean(health.storage?.enabled),
                    label: 'PROMPT_DATA_DIR',
                    detail: health.storage?.enabled ? 'server sync on' : 'browser-only',
                  },
                  {
                    ok: Boolean(health.auth?.enabled),
                    label: 'Auth',
                    detail: health.auth?.enabled ? 'accounts on' : 'off',
                  },
                  {
                    ok: Boolean(health.email?.configured),
                    label: 'SMTP',
                    detail: health.email?.configured ? 'mail configured' : 'not configured',
                  },
                ] as Array<{ ok: boolean; label: string; detail: string }>
              ).map(item => (
                <li
                  key={item.label}
                  className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"
                >
                  <span
                    className="ui-health-dot mt-0.5"
                    data-status={item.ok ? 'ok' : 'error'}
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium text-[var(--text-primary)]">{item.label}</span>
                    {' · '}
                    {item.detail}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Move to a new machine
              </p>
              <p className="type-caption text-[var(--text-secondary)]">
                Export history, settings, gallery, and extras (including gallery ELO). Import the
                JSON on the other browser, then reload.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={handleExportBackup}>
                Export backup
              </Button>
              <label className="ui-btn ui-btn-ghost ui-btn-sm cursor-pointer">
                Import backup
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleImport(file);
                    }
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
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
                health.comfyui.version ? `ComfyUI ${health.comfyui.version}` : null,
                health.comfyui.deviceName,
                health.comfyuiPool?.enabled && health.comfyuiPool.endpoints.length > 0
                  ? formatPoolQueueStrip(summarizePoolQueueDepth(health.comfyuiPool.endpoints))
                  : health.comfyui.queuePending != null
                    ? `queue ${health.comfyui.queueRunning ?? 0} running · ${health.comfyui.queuePending} pending`
                    : null,
                health.comfyui.vram?.total
                  ? `VRAM ${Math.round((health.comfyui.vram.free ?? 0) / 1e9)} / ${Math.round(health.comfyui.vram.total / 1e9)} GB free`
                  : null,
                health.comfyui.ram?.total
                  ? `RAM ${Math.round((health.comfyui.ram.free ?? 0) / 1e9)} / ${Math.round(health.comfyui.ram.total / 1e9)} GB free`
                  : null,
                health.comfyui.extensionPacks
                  ? `${health.comfyui.extensionPacks} custom node pack${health.comfyui.extensionPacks === 1 ? '' : 's'}`
                  : null,
                health.comfyui.embeddingCount
                  ? `${health.comfyui.embeddingCount} embedding${health.comfyui.embeddingCount === 1 ? '' : 's'}`
                  : null,
                health.comfyui.features?.length ? health.comfyui.features.join(', ') : null,
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
                      ? 'sqlite persistence'
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
                    endpoint.version ? `ComfyUI ${endpoint.version}` : null,
                    endpoint.deviceName,
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
            <p className="text-xs text-[var(--text-muted)]">
              Add, test, and prefer hosts in{' '}
              <Link
                href={settingsComfyUiSectionHref('connection')}
                className="text-[var(--accent-text)]"
              >
                ComfyUI → Connection
              </Link>
              . Env pool members stay in <code className="ui-inline-code">COMFYUI_POOL</code>.
            </p>
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
          <>
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
            <ComfyLogsSnippet comfyUrl={health.comfyui.url} />
          </>
        )}
      </ToolSection>

      <ToolSection title="Feedback">
        <p className="text-sm text-[var(--text-secondary)]">
          File an issue on GitHub if something in Prompt Studio is broken or confusing.
        </p>
        <div className="mt-3">
          <ReportBugLink variant="button" />
        </div>
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

function ComfyLogsSnippet({ comfyUrl }: { comfyUrl?: string }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (comfyUrl?.trim()) {
        params.set('comfyUrl', comfyUrl.trim());
      }
      const response = await fetch(`/api/comfyui/logs?${params.toString()}`);
      const data = (await response.json()) as {
        lines?: string[];
        error?: string;
        unsupported?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? 'Could not load ComfyUI logs.');
        setLines([]);
        return;
      }
      if (data.unsupported) {
        setError('This ComfyUI build does not expose /internal/logs.');
        setLines([]);
        return;
      }
      setLines(data.lines ?? []);
    } catch {
      setError('Could not load ComfyUI logs.');
      setLines([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">ComfyUI logs</p>
        <Button size="sm" variant="secondary" loading={loading} onClick={() => void loadLogs()}>
          {lines ? 'Refresh logs' : 'Load logs'}
        </Button>
      </div>
      {error ? <p className="text-xs ui-status-danger">{error}</p> : null}
      {lines && lines.length === 0 && !error ? (
        <p className="text-xs text-[var(--text-muted)]">No recent log lines.</p>
      ) : null}
      {lines && lines.length > 0 ? (
        <pre className="ui-scroll-region max-h-48 overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]">
          {lines.join('\n')}
        </pre>
      ) : null}
    </div>
  );
}
