'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import {
  comfyUiJobProgressPercent,
  comfyUiJobStatusLabel,
  formatComfyUiJobProgressLabel,
} from '@/lib/comfyui-job-status';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import {
  useSystemTrayState,
  type SystemTrayAssetJob,
  type SystemTrayPrimary,
} from '@/hooks/useSystemTrayState';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

function TrayProgressBar({
  percent,
  label,
  compact = false,
}: {
  percent: number;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div
        className={`overflow-hidden rounded-full bg-zinc-800/80 ${compact ? 'h-1' : 'h-1.5'}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label ?? `Progress ${percent}%`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500/85 to-violet-400/90 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      {label && !compact ? (
        <p className="type-caption text-[var(--text-tertiary)]">{label}</p>
      ) : null}
    </div>
  );
}

function assetStatusLabel(job: SystemTrayAssetJob): string {
  if (job.status === 'verifying') {
    return 'Verifying model';
  }
  if (job.status === 'queued') {
    return 'Queued download';
  }
  const percent = Math.round(job.progress * 100);
  return `Downloading · ${percent}%`;
}

function primaryTitle(primary: SystemTrayPrimary): string {
  switch (primary.kind) {
    case 'gallery':
      return primary.entry.prompt.trim() || primary.entry.model || 'Generation job';
    case 'asset':
      return primary.job.label;
    case 'held':
      return `${primary.count} held Max job${primary.count === 1 ? '' : 's'}`;
    case 'queue':
      return `${primary.running} running · ${primary.pending} queued on ComfyUI`;
  }
}

function primarySubtitle(primary: SystemTrayPrimary): string | null {
  switch (primary.kind) {
    case 'gallery':
      return comfyUiJobStatusLabel({
        promptId: primary.entry.promptId,
        status: primary.entry.status,
        queuePosition: primary.entry.queuePosition,
        progressValue: primary.entry.progressValue,
        progressMax: primary.entry.progressMax,
        progressNode: primary.entry.progressNode,
      });
    case 'asset':
      return assetStatusLabel(primary.job);
    case 'held':
      return primary.label;
    case 'queue':
      return 'ComfyUI server queue';
  }
}

function primaryPercent(primary: SystemTrayPrimary): number | null {
  if (primary.kind === 'gallery') {
    return primary.percent;
  }
  if (primary.kind === 'asset') {
    return Math.round(primary.job.progress * 100);
  }
  return null;
}

function GalleryTrayRow({ entry }: { entry: ComfyGalleryEntry }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    getComfyLivePreviewUrl(entry.promptId, [entry.clientId])
  );
  const percent = comfyUiJobProgressPercent(entry);
  const progressLabel = formatComfyUiJobProgressLabel(entry);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPreviewUrl(getComfyLivePreviewUrl(entry.promptId, [entry.clientId]));
    });
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ promptId?: string; keys?: string[] }>).detail;
      const keys = detail?.keys ?? (detail?.promptId ? [detail.promptId] : []);
      const ours = [entry.promptId, entry.clientId].filter(Boolean) as string[];
      if (keys.length > 0 && ours.length > 0 && !keys.some(key => ours.includes(key))) {
        return;
      }
      setPreviewUrl(getComfyLivePreviewUrl(entry.promptId, [entry.clientId]));
    };
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    return () => window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
  }, [entry.promptId, entry.clientId]);

  return (
    <li className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/80 px-3 py-2.5">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-lg border border-zinc-700/60 object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-300">
          <span className="text-xs font-semibold">{entry.status === 'running' ? '▶' : '◷'}</span>
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm text-[var(--text-primary)]">
          {entry.prompt.trim() || entry.model || 'Generation job'}
        </p>
        <p className="type-caption text-[var(--text-tertiary)]">
          {comfyUiJobStatusLabel({
            promptId: entry.promptId,
            status: entry.status,
            queuePosition: entry.queuePosition,
            progressValue: entry.progressValue,
            progressMax: entry.progressMax,
            progressNode: entry.progressNode,
          })}
          {entry.model ? ` · ${entry.model}` : ''}
        </p>
        {percent != null ? (
          <TrayProgressBar percent={percent} label={progressLabel ?? undefined} />
        ) : null}
      </div>
    </li>
  );
}

function AssetTrayRow({ job }: { job: SystemTrayAssetJob }) {
  const percent = Math.round(job.progress * 100);
  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/80 px-3 py-2.5">
      <p className="truncate text-sm text-[var(--text-primary)]">{job.label}</p>
      <p className="mt-1 type-caption text-[var(--text-tertiary)]">{assetStatusLabel(job)}</p>
      {job.status === 'downloading' ? (
        <div className="mt-2">
          <TrayProgressBar percent={percent} />
        </div>
      ) : null}
    </li>
  );
}

export default function SystemTray() {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const {
    activeGalleryJobs,
    heldJobs,
    assetJobs,
    queueHealth,
    primary,
    totalActiveCount,
    hasActivity,
  } = useSystemTrayState();

  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  if (!hasActivity || !primary) {
    return null;
  }

  const percent = primaryPercent(primary);
  const subtitle = primarySubtitle(primary);
  const extraCount = Math.max(0, totalActiveCount - 1);
  const downloadAlsoRunning =
    assetJobs.length > 0 && primary.kind !== 'asset' && primary.kind !== 'held';
  const downloadHint =
    downloadAlsoRunning && assetJobs.length === 1
      ? `1 download also running`
      : downloadAlsoRunning
        ? `${assetJobs.length} downloads also running`
        : null;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-4 left-4 z-[88] w-[min(22rem,calc(100vw-2rem))] lg:left-[calc(var(--sidebar-width)+1rem)]"
      data-testid="system-tray"
    >
      <div
        className={`pointer-events-auto overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)]/95 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-[box-shadow,transform] duration-200 ${
          expanded ? 'ring-1 ring-[var(--accent-ring)]' : ''
        }`}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          data-testid="system-tray-toggle"
          onClick={() => setExpanded(value => !value)}
          className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)] active:scale-[0.995]"
        >
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/15 to-sky-500/10 text-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            {primary.kind === 'asset' ? (
              <span className="text-[11px] font-semibold">↓</span>
            ) : primary.kind === 'held' ? (
              <span className="text-[11px] font-semibold">⏸</span>
            ) : (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400/50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-400" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {primaryTitle(primary)}
                </p>
                {subtitle ? (
                  <p className="mt-0.5 truncate type-caption text-[var(--text-tertiary)]">
                    {subtitle}
                  </p>
                ) : null}
                {downloadHint ? (
                  <p className="mt-0.5 truncate type-caption text-sky-300/80">{downloadHint}</p>
                ) : null}
              </div>
              {extraCount > 0 ? (
                <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-violet-200">
                  +{extraCount}
                </span>
              ) : null}
            </div>
            {percent != null && !expanded ? <TrayProgressBar percent={percent} compact /> : null}
          </div>

          <span
            aria-hidden
            className={`mt-1 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          >
            ▾
          </span>
        </button>

        {expanded ? (
          <div
            id={panelId}
            className="max-h-[min(24rem,50vh)] overflow-y-auto border-t border-[var(--border-subtle)] px-3.5 py-3"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Activity
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href="/queue"
                  className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  onClick={() => setExpanded(false)}
                >
                  Queue
                </Link>
                <Link
                  href="/gallery"
                  className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  onClick={() => setExpanded(false)}
                >
                  Gallery
                </Link>
              </div>
            </div>

            {queueHealth && (queueHealth.queuePending > 0 || queueHealth.queueRunning > 0) ? (
              <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3 py-2">
                <p className="text-xs text-[var(--text-secondary)]">
                  ComfyUI server · {queueHealth.queueRunning} running · {queueHealth.queuePending}{' '}
                  pending
                </p>
              </div>
            ) : null}

            {activeGalleryJobs.length > 0 ? (
              <section className="mb-3 space-y-2">
                <h3 className="type-caption font-medium text-[var(--text-muted)]">
                  Generations ({activeGalleryJobs.length})
                </h3>
                <ul className="space-y-2">
                  {activeGalleryJobs.slice(0, 6).map(entry => (
                    <GalleryTrayRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              </section>
            ) : null}

            {heldJobs.length > 0 ? (
              <section className="mb-3 space-y-2">
                <h3 className="type-caption font-medium text-[var(--text-muted)]">
                  Held Max ({heldJobs.length})
                </h3>
                <ul className="space-y-1.5">
                  {heldJobs.slice(0, 5).map(job => (
                    <li
                      key={job.id}
                      className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90"
                    >
                      <span className="font-medium">{job.label}</span>
                      <span className="text-amber-200/70"> · waiting for idle queue</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {assetJobs.length > 0 ? (
              <section className="space-y-2">
                <h3 className="type-caption font-medium text-[var(--text-muted)]">
                  Downloads ({assetJobs.length})
                </h3>
                <ul className="space-y-2">
                  {assetJobs.map(job => (
                    <AssetTrayRow key={job.id} job={job} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
