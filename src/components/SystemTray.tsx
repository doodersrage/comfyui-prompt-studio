'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { APP_TOAST_EVENT, dismissAppToast, getAppToasts, type AppToast } from '@/lib/app-toast';
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
import { RETRY_LAST_FAILED_QUEUE_EVENT, retryLastFailedQueue } from '@/lib/last-failed-queue';
import { dismissSystemTrayMessage, type SystemTrayMessage } from '@/lib/system-tray-messages';
import { toastQueueOutcome } from '@/lib/app-toast';
import {
  useSystemTrayState,
  type SystemTrayAssetJob,
  type SystemTrayPrimary,
} from '@/hooks/useSystemTrayState';
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from '@/lib/comfy-asset-events';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import UiIcon from '@/components/ui/UiIcon';

type TrayNoticeTone = AppToast['tone'];

const NOTICE_TONE_CLASS: Record<TrayNoticeTone, string> = {
  neutral: 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
  success:
    'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]',
  warning:
    'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]',
  danger:
    'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]',
  info: 'border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)]',
};

function TrayNotice({
  text,
  tone,
  href,
  actionLabel,
  actionEvent,
  onDismiss,
}: {
  text: string;
  tone: TrayNoticeTone;
  href?: string;
  actionLabel?: string;
  actionEvent?: string;
  onDismiss: () => void;
}) {
  return (
    <div role="status" className={`pointer-events-auto ui-tray-notice ${NOTICE_TONE_CLASS[tone]}`}>
      <div className="flex items-start gap-3">
        <p className="type-caption min-w-0 flex-1 leading-relaxed">{text}</p>
        <div className="flex shrink-0 items-center gap-2">
          {href ? (
            <Link
              href={href}
              className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              onClick={() => {
                if (/settings|workflow-map|model-assets|lora|connection/i.test(href)) {
                  void import('@/lib/local-observability').then(
                    ({ notePlaybookCtaClickMetric }) => {
                      notePlaybookCtaClickMetric();
                    }
                  );
                  void Promise.all([
                    import('@/lib/last-failed-queue'),
                    import('@/lib/system-tray-messages'),
                  ]).then(
                    ([
                      { loadLastFailedQueue, RETRY_LAST_FAILED_QUEUE_EVENT },
                      { pushSystemTrayMessage },
                    ]) => {
                      if (!loadLastFailedQueue()) {
                        return;
                      }
                      pushSystemTrayMessage({
                        text: 'Settings opened — retry the last failed queue when ready.',
                        tone: 'info',
                        actionLabel: 'Retry',
                        actionEvent: RETRY_LAST_FAILED_QUEUE_EVENT,
                        ttlMs: 20_000,
                      });
                    }
                  );
                }
                onDismiss();
              }}
            >
              Open
            </Link>
          ) : null}
          {actionLabel && actionEvent ? (
            <button
              type="button"
              className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              onClick={() => {
                window.dispatchEvent(new Event(actionEvent));
                onDismiss();
              }}
            >
              {actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss"
            className="type-caption text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            onClick={onDismiss}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

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
        className={`ui-progress-track ${compact ? '!h-1' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label ?? `Progress ${percent}%`}
      >
        <div className="ui-progress-fill" style={{ width: `${percent}%` }} />
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
          className="h-11 w-11 shrink-0 rounded-lg border border-[var(--border-default)]/60 object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]">
          <span className="inline-flex text-[var(--accent-text)]">
            <UiIcon name={entry.status === 'running' ? 'play' : 'pending'} size={14} />
          </span>
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

function AssetTrayRow({
  job,
  onCancel,
}: {
  job: SystemTrayAssetJob;
  onCancel: (jobId: string) => void;
}) {
  const percent = Math.round(job.progress * 100);
  return (
    <li className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/80 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--text-primary)]">{job.label}</p>
          <p className="mt-1 type-caption text-[var(--text-tertiary)]">{assetStatusLabel(job)}</p>
        </div>
        <button
          type="button"
          onClick={() => onCancel(job.id)}
          className="shrink-0 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.98]"
        >
          Cancel
        </button>
      </div>
      {job.status === 'downloading' || job.status === 'verifying' ? (
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
  const [appToasts, setAppToasts] = useState<AppToast[]>([]);
  const {
    activeGalleryJobs,
    heldJobs,
    assetJobs,
    queueHealth,
    primary,
    totalActiveCount,
    hasActivity,
    trayMessages,
    refresh,
  } = useSystemTrayState();

  const cancelAssetJob = (jobId: string) => {
    void fetch('/api/comfyui/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', jobId }),
    })
      .then(() => {
        window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
        refresh();
      })
      .catch(() => {
        // tray cancel is best-effort
      });
  };

  useEffect(() => {
    const onRetryLastFailed = () => {
      void retryLastFailedQueue().then(result => {
        toastQueueOutcome({
          ok: result.ok,
          text: result.message,
          href: result.ok ? '/gallery' : '/queue',
        });
      });
    };
    window.addEventListener(RETRY_LAST_FAILED_QUEUE_EVENT, onRetryLastFailed);
    return () => window.removeEventListener(RETRY_LAST_FAILED_QUEUE_EVENT, onRetryLastFailed);
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setAppToasts(getAppToasts());
    });
    const onAppToast = (event: Event) => {
      const detail = (event as CustomEvent<AppToast[]>).detail;
      setAppToasts(Array.isArray(detail) ? detail : getAppToasts());
    };
    window.addEventListener(APP_TOAST_EVENT, onAppToast);
    return () => window.removeEventListener(APP_TOAST_EVENT, onAppToast);
  }, []);

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

  if (!hasActivity && trayMessages.length === 0 && appToasts.length === 0) {
    return null;
  }

  const showActivityCard = hasActivity && primary;

  const percent = showActivityCard ? primaryPercent(primary) : null;
  const subtitle = showActivityCard ? primarySubtitle(primary) : null;
  const extraCount = showActivityCard ? Math.max(0, totalActiveCount - 1) : 0;
  const downloadAlsoRunning =
    showActivityCard && assetJobs.length > 0 && primary.kind !== 'asset' && primary.kind !== 'held';
  const downloadHint =
    downloadAlsoRunning && assetJobs.length === 1
      ? `1 download also running`
      : downloadAlsoRunning
        ? `${assetJobs.length} downloads also running`
        : null;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col ui-tray-stack md:bottom-4"
      data-testid="system-tray"
      aria-live="polite"
    >
      {appToasts.map(toast => (
        <TrayNotice
          key={toast.id}
          text={toast.text}
          tone={toast.tone}
          href={toast.href}
          onDismiss={() => dismissAppToast(toast.id)}
        />
      ))}
      {trayMessages.map((message: SystemTrayMessage) => (
        <TrayNotice
          key={message.id}
          text={message.text}
          tone={message.tone}
          href={message.href}
          actionLabel={message.actionLabel}
          actionEvent={message.actionEvent}
          onDismiss={() => dismissSystemTrayMessage(message.id)}
        />
      ))}

      {showActivityCard ? (
        <div
          className={`pointer-events-auto ui-tray-card overflow-hidden transition-[box-shadow] duration-200 ${
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
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-border)] bg-gradient-to-br from-[var(--accent-muted)] to-[var(--tint-info-bg)] text-[var(--accent-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              {primary.kind === 'asset' ? (
                <UiIcon name="download" size={14} />
              ) : primary.kind === 'held' ? (
                <UiIcon name="pause" size={14} />
              ) : (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)]/50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
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
                    <p className="mt-0.5 truncate type-caption text-[var(--tint-info-text)]/80">
                      {downloadHint}
                    </p>
                  ) : null}
                </div>
                {extraCount > 0 ? (
                  <span className="shrink-0 rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--accent-text)]">
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
                  {assetJobs.length > 0 ? (
                    <Link
                      href={settingsComfyUiSectionHref('model-assets')}
                      className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      onClick={() => setExpanded(false)}
                    >
                      Assets
                    </Link>
                  ) : null}
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
                        className="rounded-lg border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2 text-xs text-[var(--tint-warning-text)]"
                      >
                        <span className="font-medium">{job.label}</span>
                        <span className="text-[var(--tint-warning-text)]/70">
                          {' '}
                          · waiting for idle queue
                        </span>
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
                      <AssetTrayRow key={job.id} job={job} onCancel={cancelAssetJob} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
