'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { loadSettingsCache } from '@/lib/settings-cache';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from '@/lib/comfy-asset-events';
import { celebrateSystemTray } from '@/lib/system-tray-celebrate';
import {
  COMFY_ASSET_KIND_LABELS,
  COMFY_ASSET_KIND_ORDER,
  type ComfyAssetKind,
} from '@/lib/comfy-asset-kinds';

type AssetRow = {
  id: string;
  label: string;
  kind: ComfyAssetKind | string;
  filename: string;
  modelIds: string[];
  status: 'installed' | 'missing' | 'docs-only' | 'root-missing';
  downloadable: boolean;
  onDisk: boolean;
  inInventory: boolean;
  notes?: string;
  urlHost?: string;
  requiresHfToken?: boolean;
};

type AssetJob = {
  id: string;
  assetId: string;
  label: string;
  filename: string;
  status: string;
  progress: number;
  bytesReceived: number;
  bytesTotal: number | null;
  error?: string;
  attempt?: number;
  runAttempt?: number;
};

type AssetsResponse = {
  ok?: boolean;
  rootConfigured?: boolean;
  rootWritable?: boolean;
  rootPath?: string | null;
  rootHint?: string;
  rows?: AssetRow[];
  jobs?: AssetJob[];
  error?: string;
};

type ComfyModelAssetsPanelProps = {
  onStatus?: (message: string) => void;
  onInstalled?: () => void;
  /** When set, only show assets for this model and hide the current-model toggle. */
  modelId?: string;
  /** Tighter layout for embedding on a tool page. */
  compact?: boolean;
};

function statusLabel(status: AssetRow['status']): string {
  switch (status) {
    case 'installed':
      return 'Installed';
    case 'missing':
      return 'Missing';
    case 'root-missing':
      return 'Needs COMFYUI_ROOT';
    case 'docs-only':
      return 'Manual only';
    default:
      return status;
  }
}

function formatBytes(value: number | null | undefined): string {
  if (value == null || value <= 0) {
    return '';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ComfyModelAssetsPanel({
  onStatus,
  onInstalled,
  modelId: forcedModelId,
  compact = false,
}: ComfyModelAssetsPanelProps) {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [jobs, setJobs] = useState<AssetJob[]>([]);
  const [rootConfigured, setRootConfigured] = useState(false);
  const [rootWritable, setRootWritable] = useState(true);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootHint, setRootHint] = useState<string | undefined>();
  const [filterCurrentModel, setFilterCurrentModel] = useState(Boolean(forcedModelId));
  const [kindFilter, setKindFilter] = useState<'all' | ComfyAssetKind>('all');
  const [missingOnly, setMissingOnly] = useState(compact);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const jobsRef = useRef<AssetJob[]>([]);
  const loadRef = useRef<(forceRefresh?: boolean) => Promise<void>>(async () => {});
  const onInstalledRef = useRef(onInstalled);
  const pollInFlightRef = useRef(false);

  const load = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const settings = loadComfyUiSettings();
        const modelId =
          forcedModelId?.trim() ||
          (filterCurrentModel ? loadSettingsCache().shared.model : undefined);
        const params = new URLSearchParams();
        const apiUrl = settings.apiUrl?.trim() ?? '';
        if (apiUrl) {
          params.set('comfyUrl', apiUrl);
        }
        if (modelId) {
          params.set('modelId', modelId);
        }
        if (forceRefresh) {
          params.set('forceRefresh', '1');
        }
        const response = await fetch(`/api/comfyui/assets${params.size ? `?${params}` : ''}`);
        const data = (await response.json()) as AssetsResponse;
        if (!response.ok) {
          throw new Error(data.error || 'Could not load model assets.');
        }
        setRows(data.rows ?? []);
        setJobs(data.jobs ?? []);
        setRootConfigured(Boolean(data.rootConfigured));
        setRootWritable(data.rootWritable !== false);
        setRootPath(data.rootPath ?? null);
        setRootHint(data.rootHint);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load model assets.');
      } finally {
        setLoading(false);
      }
    },
    [filterCurrentModel, forcedModelId]
  );

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    onInstalledRef.current = onInstalled;
  }, [onInstalled]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void load();
    });
  }, [load]);

  // Stable poller — do not depend on `jobs` or each tick tears down the
  // in-flight fetch and the progress counter appears frozen.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled || pollInFlightRef.current) {
        return;
      }
      const active = jobsRef.current.filter(
        job => job.status === 'queued' || job.status === 'downloading' || job.status === 'verifying'
      );
      if (active.length === 0) {
        return;
      }
      pollInFlightRef.current = true;
      const activeIds = active.map(job => job.id);
      try {
        const response = await fetch(
          `/api/comfyui/assets?jobId=${encodeURIComponent(activeIds[0]!)}`
        );
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (cancelled || !response.ok) {
          return;
        }
        const nextJobs = data.jobs ?? (data.job ? [data.job] : []);
        setJobs(nextJobs);
        const justFinished = nextJobs.some(
          job =>
            activeIds.includes(job.id) &&
            (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled')
        );
        if (justFinished) {
          const failed = nextJobs.find(job => activeIds.includes(job.id) && job.status === 'error');
          if (failed?.error) {
            setError(failed.error);
          }
          await loadRef.current(true);
          if (nextJobs.some(job => job.status === 'complete')) {
            void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
            onInstalledRef.current?.();
            celebrateSystemTray('download');
          }
        }
      } catch {
        // keep polling
      } finally {
        pollInFlightRef.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 750);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (jobs.some(job => ['queued', 'downloading', 'verifying'].includes(job.status))) {
      window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
    }
  }, [jobs]);

  const install = useCallback(
    async (assetId: string): Promise<AssetJob | null> => {
      setBusyId(assetId);
      setError(null);
      try {
        const response = await fetch('/api/comfyui/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId }),
        });
        const data = (await response.json()) as AssetsResponse & {
          job?: AssetJob;
        };
        if (!response.ok || !data.job) {
          throw new Error(data.error || 'Install failed to start.');
        }
        setJobs(prev => {
          const without = prev.filter(job => job.id !== data.job!.id);
          return [data.job!, ...without];
        });
        onStatus?.(
          data.job.status === 'complete'
            ? `Already present: ${data.job.filename}`
            : `Downloading ${data.job.label}…`
        );
        if (data.job.status === 'complete') {
          await load(true);
          void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
          onInstalled?.();
          celebrateSystemTray('download');
        }
        window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
        return data.job;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Install failed.');
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [load, onInstalled, onStatus]
  );

  const jobAction = useCallback(
    async (jobId: string, action: 'cancel' | 'retry') => {
      setBusyId(jobId);
      setError(null);
      try {
        const response = await fetch('/api/comfyui/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, jobId }),
        });
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (!response.ok || !data.job) {
          throw new Error(data.error || `Could not ${action} download.`);
        }
        if (data.jobs) {
          setJobs(data.jobs);
        } else {
          setJobs(prev => {
            const without = prev.filter(job => job.id !== data.job!.id);
            return [data.job!, ...without];
          });
        }
        onStatus?.(
          action === 'cancel'
            ? `Cancelled ${data.job.label} (partial kept for resume).`
            : `Retrying ${data.job.label}…`
        );
        window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not ${action} download.`);
      } finally {
        setBusyId(null);
      }
    },
    [onStatus]
  );

  const waitForJob = useCallback(async (jobId: string) => {
    for (let i = 0; i < 60 * 60; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const response = await fetch(`/api/comfyui/assets?jobId=${encodeURIComponent(jobId)}`);
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (!response.ok) {
          return null;
        }
        const job = data.job;
        if (!job) {
          return null;
        }
        setJobs(data.jobs ?? [job]);
        if (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled') {
          return job;
        }
      } catch {
        // keep waiting
      }
    }
    return null;
  }, []);

  const jobFor = (assetId: string) => jobs.find(job => job.assetId === assetId);

  const visibleRows = useMemo(() => {
    return rows.filter(row => {
      if (compact && (row.kind === 'controlnet' || row.kind === 'upscale')) {
        return false;
      }
      if (kindFilter !== 'all' && row.kind !== kindFilter) {
        return false;
      }
      if (missingOnly && row.status === 'installed') {
        return false;
      }
      return true;
    });
  }, [compact, rows, kindFilter, missingOnly]);

  const groupedRows = useMemo(() => {
    const groups: Array<{ kind: ComfyAssetKind | string; rows: AssetRow[] }> = [];
    const byKind = new Map<string, AssetRow[]>();
    for (const row of visibleRows) {
      const list = byKind.get(row.kind) ?? [];
      list.push(row);
      byKind.set(row.kind, list);
    }
    for (const kind of COMFY_ASSET_KIND_ORDER) {
      const list = byKind.get(kind);
      if (list?.length) {
        groups.push({ kind, rows: list });
        byKind.delete(kind);
      }
    }
    for (const [kind, list] of byKind) {
      groups.push({ kind, rows: list });
    }
    return groups;
  }, [visibleRows]);

  const downloadableMissing = visibleRows.filter(
    row => row.status === 'missing' && row.downloadable
  ).length;

  const queueJobs = useMemo(
    () =>
      jobs.filter(job =>
        ['queued', 'downloading', 'verifying', 'error', 'cancelled'].includes(job.status)
      ),
    [jobs]
  );
  const activeQueueCount = queueJobs.filter(job =>
    ['queued', 'downloading', 'verifying'].includes(job.status)
  ).length;

  const installMissingForModel = useCallback(async () => {
    const missing = visibleRows.filter(row => row.status === 'missing' && row.downloadable);
    if (missing.length === 0) {
      onStatus?.('No curated downloadable weights missing for this filter.');
      return;
    }
    onStatus?.(
      `Queuing ${missing.length} download${missing.length === 1 ? '' : 's'} one at a time…`
    );
    for (const row of missing) {
      const started = await install(row.id);
      if (!started) {
        continue;
      }
      if (started.status === 'complete' || started.status === 'error') {
        continue;
      }
      const finished = await waitForJob(started.id);
      if (finished?.status === 'error' && finished.error) {
        setError(finished.error);
      }
    }
    await load(true);
    void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
    onInstalled?.();
  }, [install, load, onInstalled, onStatus, visibleRows, waitForJob]);

  return (
    <div className="space-y-3">
      <p className="type-caption text-[var(--text-muted)]">
        {compact
          ? 'Install this video model and its support files (VAE, text encoder, Lightning LoRA) into COMFYUI_ROOT/models. Downloads run one at a time and resume if cancelled.'
          : 'Curated same-machine installs for supported workflows — checkpoints, UNETs, VAEs, text encoders / CLIP, LoRAs, upscalers, and ControlNets — into COMFYUI_ROOT/models/…. Downloads run one at a time, resume from .partial after cancel or stall, and show up in the system tray. Only allowlisted Hugging Face URLs run; gated or third-party rows stay manual. Optional HF_TOKEN helps with gated repos / 403s.'}
      </p>

      {queueJobs.length > 0 ? (
        <section className="ui-panel-accent space-y-2 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--tint-info-text)]/90">
                Download queue
              </p>
              <p className="type-caption text-[var(--text-muted)]">
                {activeQueueCount > 0
                  ? `${activeQueueCount} active · serial · resume-safe`
                  : 'Idle · retry cancelled or failed jobs below'}
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {queueJobs.map(job => {
              const active =
                job.status === 'queued' ||
                job.status === 'downloading' ||
                job.status === 'verifying';
              return (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/50 px-3 py-2"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm text-[var(--text-primary)]">{job.label}</p>
                    <p className="type-caption text-[var(--text-muted)]">
                      {job.status}
                      {job.runAttempt && job.runAttempt > 1 ? ` · run ${job.runAttempt}` : ''}
                      {' · '}
                      {job.bytesTotal && job.bytesReceived <= job.bytesTotal * 1.02
                        ? `${Math.round(job.progress * 100)}% · ${formatBytes(job.bytesReceived)} / ${formatBytes(job.bytesTotal)}`
                        : job.bytesReceived
                          ? `${formatBytes(job.bytesReceived)} received`
                          : `${Math.round(job.progress * 100)}%`}
                      {job.error ? ` · ${job.error}` : ''}
                    </p>
                    {active && job.bytesTotal && job.bytesTotal > 0 ? (
                      <div className="ui-progress-track mt-1.5">
                        <div
                          className="ui-progress-fill"
                          style={{ width: `${Math.min(100, Math.round(job.progress * 100))}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {active ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busyId === job.id}
                        onClick={() => void jobAction(job.id, 'cancel')}
                      >
                        {busyId === job.id ? 'Cancelling…' : 'Cancel'}
                      </Button>
                    ) : null}
                    {job.status === 'error' || job.status === 'cancelled' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busyId === job.id || !rootConfigured || !rootWritable}
                        onClick={() => void jobAction(job.id, 'retry')}
                      >
                        {busyId === job.id ? 'Retrying…' : 'Resume'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {forcedModelId ? null : (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={filterCurrentModel}
              onChange={event => setFilterCurrentModel(event.target.checked)}
            />
            Current model only
          </label>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={event => setMissingOnly(event.target.checked)}
          />
          Missing / manual only
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void load(true)}
        >
          Refresh
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading || !rootConfigured || !rootWritable || downloadableMissing === 0}
          onClick={() => void installMissingForModel()}
        >
          Install missing
          {forcedModelId || filterCurrentModel ? ' for model' : ''}
          {downloadableMissing > 0 ? ` (${downloadableMissing})` : ''}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <ChipButton active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
          All kinds
        </ChipButton>
        {COMFY_ASSET_KIND_ORDER.map(kind => {
          const count = rows.filter(row => row.kind === kind).length;
          if (count === 0) {
            return null;
          }
          return (
            <ChipButton key={kind} active={kindFilter === kind} onClick={() => setKindFilter(kind)}>
              {COMFY_ASSET_KIND_LABELS[kind]}
              <span className="opacity-60"> {count}</span>
            </ChipButton>
          );
        })}
      </div>

      <p className="type-caption text-[var(--text-muted)]">
        {rootConfigured ? (
          <>
            Root:{' '}
            <code className="rounded bg-[var(--bg-muted)] px-1 text-[var(--tint-success-text)]">
              {rootPath}
            </code>
            {!rootWritable ? (
              <span className="mt-1 block text-[var(--tint-warning-text)]">
                {rootHint ??
                  'Not writable by this app process — Install cannot save files until COMFYUI_ROOT/models allows write access.'}
              </span>
            ) : null}
          </>
        ) : (
          <>{rootHint ?? 'Set COMFYUI_ROOT to enable Install.'}</>
        )}
      </p>

      {error ? <p className="type-caption ui-status-danger">{error}</p> : null}

      {loading && rows.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">Loading assets…</p>
      ) : visibleRows.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">No assets match this filter.</p>
      ) : (
        <div className="space-y-4">
          {groupedRows.map(group => (
            <section key={group.kind} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {COMFY_ASSET_KIND_LABELS[group.kind as ComfyAssetKind] ?? group.kind}
              </h3>
              <ul className="space-y-2">
                {group.rows.map(row => {
                  const job = jobFor(row.id);
                  const installing =
                    job &&
                    (job.status === 'queued' ||
                      job.status === 'downloading' ||
                      job.status === 'verifying');
                  return (
                    <li
                      key={row.id}
                      className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 px-3 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {row.label}
                          </p>
                          <p className="font-mono text-[11px] text-[var(--tint-success-text)]">
                            {row.filename}
                          </p>
                          <p className="type-caption text-[var(--text-muted)]">
                            {statusLabel(row.status)}
                            {row.inInventory ? ' · in Comfy inventory' : ''}
                            {row.onDisk ? ' · on disk' : ''}
                            {row.urlHost ? ` · ${row.urlHost}` : ''}
                            {row.requiresHfToken ? ' · needs HF_TOKEN' : ''}
                          </p>
                          {row.notes ? (
                            <p className="type-caption text-[var(--text-muted)]">{row.notes}</p>
                          ) : null}
                          {job && (installing || job.status === 'queued') ? (
                            <p className="type-caption text-[var(--tint-info-text)]/90">
                              {job.status}
                              {job.runAttempt && job.runAttempt > 1
                                ? ` · run ${job.runAttempt}`
                                : null}
                              {job.attempt && job.attempt > 1 ? ` · try ${job.attempt}` : ''}
                              {' · '}
                              {job.bytesTotal && job.bytesReceived <= job.bytesTotal * 1.02
                                ? `${Math.round(job.progress * 100)}% · ${formatBytes(job.bytesReceived)} / ${formatBytes(job.bytesTotal)}`
                                : job.bytesReceived
                                  ? `${formatBytes(job.bytesReceived)} received`
                                  : `${Math.round(job.progress * 100)}%`}
                              {job.error ? ` · ${job.error}` : ''}
                            </p>
                          ) : null}
                          {job?.status === 'error' || job?.status === 'cancelled' ? (
                            <p className="type-caption ui-status-danger">
                              {job.error ?? (job.status === 'cancelled' ? 'Cancelled.' : null)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          {installing && job ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={busyId === job.id}
                              onClick={() => void jobAction(job.id, 'cancel')}
                            >
                              {busyId === job.id ? 'Cancelling…' : 'Cancel'}
                            </Button>
                          ) : null}
                          {row.downloadable && row.status !== 'installed' ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={
                                !rootConfigured ||
                                !rootWritable ||
                                busyId === row.id ||
                                Boolean(installing) ||
                                row.status === 'root-missing'
                              }
                              onClick={() =>
                                job && (job.status === 'error' || job.status === 'cancelled')
                                  ? void jobAction(job.id, 'retry')
                                  : void install(row.id)
                              }
                            >
                              {installing
                                ? 'Downloading…'
                                : job?.status === 'error' || job?.status === 'cancelled'
                                  ? busyId === row.id || busyId === job.id
                                    ? 'Resuming…'
                                    : 'Resume'
                                  : busyId === row.id
                                    ? 'Starting…'
                                    : 'Install'}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
