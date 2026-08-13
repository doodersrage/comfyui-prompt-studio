'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadComfyGallery, type ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { galleryEntryThumbUrls } from '@/lib/comfyui-gallery';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/ViewState';
import {
  CollapsibleSection,
  ToolLayout,
  ToolSection,
  ToolBadge,
} from '@/components/ui/ToolPageShell';
import { toastBulkQueueSummary, toastQueueOutcome } from '@/lib/app-toast';
import { resolveGenerateEmptyCta } from '@/lib/empty-cta';
import { requeueComfyJobFromEntry, requeueComfyJobs } from '@/lib/comfyui-requeue';
import { resolveRequeueImageUrlsFromEntry } from '@/lib/queue-requeue-images';
import { markOnboardingFirstQueue } from '@/lib/onboarding-hooks';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  cancelComfyUiJob,
  freeComfyUiMemory,
  interruptComfyUiQueue,
  restartComfyUi,
} from '@/lib/comfyui-queue-control';
import type { ComfyJobListItem } from '@/lib/comfyui-jobs';
import { cancelComfyGalleryJob } from '@/lib/comfyui-queue-cancel';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { comfyUiJobProgressPercent } from '@/lib/comfyui-job-status';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useHubPageDescription } from '@/hooks/useToolPageDescription';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

const ACCENT = 'violet' as const;

type ComfyQueueHealth = {
  queueRunning?: number;
  queuePending?: number;
  ok?: boolean;
  url?: string;
};

function QueueActiveJobRow({
  entry,
  onRetry,
  onCancel,
}: {
  entry: ComfyGalleryEntry;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    getComfyLivePreviewUrl(entry.promptId, [entry.clientId])
  );
  const percent = comfyUiJobProgressPercent(entry);

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
    return () => {
      window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    };
  }, [entry.promptId, entry.clientId]);

  return (
    <li className="ui-list-row flex-col items-stretch gap-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-md border border-[var(--border-default)] object-cover"
          />
        ) : null}
        <div className="ui-list-primary min-w-0 space-y-1">
          <p className="truncate text-sm text-[var(--text-primary)]">{entry.prompt}</p>
          <p className="type-caption">
            {entry.status}
            {entry.queuePosition ? ` · #${entry.queuePosition}` : ''}
            {percent != null ? ` · ${percent}%` : ''}
            {entry.model ? ` · ${entry.model}` : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
        <Button size="sm" variant="danger" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </li>
  );
}

export default function QueueTool() {
  const workspaceMode = useWorkspaceMode();
  const isSimple = workspaceMode === 'simple';
  const description = useHubPageDescription('queue');
  const [entries, setEntries] = useState<ComfyGalleryEntry[]>([]);
  const [queueHealth, setQueueHealth] = useState<ComfyQueueHealth | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hostJobs, setHostJobs] = useState<ComfyJobListItem[]>([]);

  const refreshEntries = useCallback(() => {
    setEntries(loadComfyGallery());
  }, []);

  const refreshHealth = useCallback(async () => {
    let healthUrl: string | undefined;
    try {
      const response = await fetch('/api/health');
      const data = (await response.json()) as {
        comfyui?: ComfyQueueHealth;
      };
      setQueueHealth(data.comfyui ?? null);
      healthUrl = data.comfyui?.url?.trim() || undefined;
    } catch {
      setQueueHealth(null);
    }
    try {
      const params = new URLSearchParams({ status: 'pending,in_progress', limit: '40' });
      if (healthUrl) {
        params.set('comfyUrl', healthUrl);
      }
      const response = await fetch(`/api/comfyui/jobs?${params.toString()}`);
      if (!response.ok) {
        setHostJobs([]);
        return;
      }
      const data = (await response.json()) as { jobs?: ComfyJobListItem[] };
      setHostJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      setHostJobs([]);
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refreshEntries();
      void refreshHealth();
    });
    const interval = window.setInterval(() => {
      refreshEntries();
      void refreshHealth();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [refreshEntries, refreshHealth]);

  const pending = useMemo(
    () => entries.filter(entry => entry.status === 'pending' || entry.status === 'running'),
    [entries]
  );
  const failed = useMemo(
    () => entries.filter(entry => entry.status === 'error').slice(0, 30),
    [entries]
  );
  const recent = useMemo(
    () => entries.filter(entry => entry.status === 'completed').slice(0, 20),
    [entries]
  );
  const galleryPromptIds = useMemo(
    () => new Set(entries.map(entry => entry.promptId).filter(Boolean)),
    [entries]
  );
  const orphanHostJobs = useMemo(
    () => hostJobs.filter(job => !galleryPromptIds.has(job.id)),
    [galleryPromptIds, hostJobs]
  );

  async function interruptComfyQueue() {
    setStatus('Sending interrupt to ComfyUI…');
    const result = await interruptComfyUiQueue(queueHealth?.url);
    if (!result.ok) {
      setStatus(result.error ?? 'Interrupt failed.');
      return;
    }
    setStatus('ComfyUI interrupt sent.');
    void refreshHealth();
  }

  async function freeComfyVram() {
    setStatus('Freeing ComfyUI VRAM…');
    const result = await freeComfyUiMemory(queueHealth?.url);
    if (!result.ok) {
      setStatus(result.error ?? 'Free VRAM failed.');
      return;
    }
    setStatus('ComfyUI VRAM freed.');
    void refreshHealth();
  }

  async function restartComfy() {
    setStatus('Sending ComfyUI restart…');
    const result = await restartComfyUi(queueHealth?.url);
    if (!result.ok) {
      setStatus(result.error ?? 'Restart failed.');
      return;
    }
    setStatus('ComfyUI restart requested. Wait a few seconds, then refresh.');
    window.setTimeout(() => {
      void refreshHealth();
    }, 4000);
  }

  async function cancelJob(entry: ComfyGalleryEntry) {
    setStatus(`Cancelling ${entry.promptId || 'job'}…`);
    const result = await cancelComfyGalleryJob(entry);
    setStatus(result.ok ? 'Job cancelled.' : (result.error ?? 'Cancel failed.'));
    refreshEntries();
    void refreshHealth();
  }

  async function cancelHostJob(job: ComfyJobListItem) {
    setStatus(`Cancelling ${job.id}…`);
    const result = await cancelComfyUiJob({
      promptId: job.id,
      comfyUrl: queueHealth?.url,
      deleteHistory: true,
    });
    setStatus(result.ok ? 'Job cancelled.' : (result.error ?? 'Cancel failed.'));
    refreshEntries();
    void refreshHealth();
  }

  async function retryFailed() {
    if (failed.length === 0) {
      return;
    }
    setStatus(`Retrying ${failed.length} failed job(s)…`);
    const results = await requeueComfyJobs(
      failed.map(entry => {
        const urls = resolveRequeueImageUrlsFromEntry(entry);
        return {
          prompt: entry.prompt,
          negativePrompt: entry.negativePrompt,
          tool: entry.tool,
          model: entry.model,
          queueParams: entry.queueParams,
          sourceImageUrl: urls.sourceImageUrl,
          maskImageUrl: urls.maskImageUrl,
        };
      })
    );
    markOnboardingFirstQueue();
    setStatus(`Retried ${results.queued}/${failed.length}.`);
    toastBulkQueueSummary({
      label: 'Retry failed finished',
      queued: results.queued,
      failed: results.failed,
    });
    refreshEntries();
  }

  const generateCta = resolveGenerateEmptyCta();

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Queue</ToolBadge>}
      title="ComfyUI job queue"
      description={description}
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.queue} />
      {queueHealth?.ok ? (
        <div className="ui-queue-strip">
          <p className="text-sm text-[var(--text-muted)]">
            ComfyUI queue: {queueHealth.queueRunning ?? 0} running · {queueHealth.queuePending ?? 0}{' '}
            pending
          </p>
          {(queueHealth.queueRunning ?? 0) + (queueHealth.queuePending ?? 0) > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => void interruptComfyQueue()}>
              Interrupt queue
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => void freeComfyVram()}>
            Free VRAM
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void restartComfy()}>
            Restart ComfyUI
          </Button>
        </div>
      ) : (
        <ErrorState
          compact
          title="ComfyUI health unavailable"
          description="The queue stats endpoint did not respond. Use Settings → Heal & ready, or check your ComfyUI URL under Connection."
          action={{ label: 'Heal & ready', href: '/settings' }}
        />
      )}

      <ToolSection title={`Active (${pending.length})`}>
        {pending.length === 0 ? (
          orphanHostJobs.length > 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              No gallery jobs are active. Host jobs that are not in this gallery are listed below.
            </p>
          ) : entries.length === 0 ? (
            <EmptyState
              compact
              branded
              icon="inbox"
              title="Queue is empty"
              description="Send a prompt to ComfyUI from Generate. If nothing queues, use Settings → Heal & ready (system workflows + Comfy connection)."
              action={generateCta}
            />
          ) : (
            <EmptyState
              compact
              icon="inbox"
              title="No pending jobs"
              description="Nothing is running right now. Queue another prompt or browse completed outputs."
              action={generateCta}
            />
          )
        ) : (
          <ul className="ui-list">
            {pending.map(entry => (
              <QueueActiveJobRow
                key={entry.id}
                entry={entry}
                onRetry={() => {
                  void requeueComfyJobFromEntry(entry).then(result => {
                    if (result.ok) {
                      markOnboardingFirstQueue();
                      toastQueueOutcome({
                        ok: true,
                        text: result.promptId
                          ? `Retry queued · ${result.promptId}`
                          : 'Retry queued',
                      });
                    } else {
                      toastQueueOutcome({
                        ok: false,
                        text: result.error ?? 'Retry failed.',
                      });
                    }
                    refreshEntries();
                  });
                }}
                onCancel={() => void cancelJob(entry)}
              />
            ))}
          </ul>
        )}
      </ToolSection>

      {orphanHostJobs.length > 0 ? (
        <ToolSection title={`On ComfyUI (${orphanHostJobs.length})`}>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Running or queued on the host, but not in this gallery. Cancel one without interrupting
            the rest of the queue.
          </p>
          <ul className="ui-list">
            {orphanHostJobs.map(job => (
              <li
                key={job.id}
                className="ui-list-row flex-col items-stretch gap-2 sm:flex-row sm:items-start"
              >
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="truncate font-mono text-sm text-[var(--text-primary)]">{job.id}</p>
                  <p className="type-caption">
                    {job.status}
                    {job.statusMessage ? ` · ${job.statusMessage}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  className="shrink-0 self-start"
                  onClick={() => void cancelHostJob(job)}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </ToolSection>
      ) : null}

      {isSimple ? (
        <CollapsibleSection
          title={`Failed (${failed.length})`}
          summary={
            failed.length > 0 ? 'Retry jobs that errored in ComfyUI.' : 'No failures right now.'
          }
          defaultOpen={failed.length > 0}
          persistKey="queue-failed"
        >
          {failed.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No failed jobs"
              description="Failed gallery jobs will appear here so you can retry them in one place."
              action={
                pending.length === 0 && recent.length === 0
                  ? generateCta
                  : { label: 'Open Gallery', href: '/gallery' }
              }
            />
          ) : (
            <>
              <Button variant="secondary" className="mb-3" onClick={() => void retryFailed()}>
                Retry all failed
              </Button>
              <ul className="ui-list ui-scroll-region max-h-[min(24rem,50vh)] overflow-y-auto">
                {failed.map(entry => (
                  <li
                    key={entry.id}
                    className="ui-list-row flex-col items-stretch gap-2 sm:flex-row sm:items-start"
                  >
                    <div className="ui-list-primary min-w-0 space-y-1">
                      <p className="truncate text-sm text-[var(--text-primary)]">{entry.prompt}</p>
                      <p className="type-caption ui-status-danger">
                        {entry.statusMessage ?? entry.status} · {entry.model}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0 self-start"
                      onClick={() => void requeueComfyJobFromEntry(entry)}
                    >
                      Retry
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CollapsibleSection>
      ) : (
        <ToolSection title={`Failed (${failed.length})`}>
          {failed.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No failed jobs"
              description="Failed gallery jobs will appear here so you can retry them in one place."
              action={
                pending.length === 0 && recent.length === 0
                  ? generateCta
                  : { label: 'Open Gallery', href: '/gallery' }
              }
            />
          ) : (
            <>
              <Button variant="secondary" className="mb-3" onClick={() => void retryFailed()}>
                Retry all failed
              </Button>
              <ul className="ui-list">
                {failed.map(entry => (
                  <li key={entry.id} className="ui-list-row items-start">
                    <div className="ui-list-primary min-w-0 space-y-1">
                      <p className="truncate text-sm text-[var(--text-primary)]">{entry.prompt}</p>
                      <p className="type-caption ui-status-danger">
                        {entry.statusMessage ?? entry.status} · {entry.model}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void requeueComfyJobFromEntry(entry)}
                    >
                      Retry
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ToolSection>
      )}

      {isSimple ? (
        <CollapsibleSection
          title="Recent completed"
          summary={`${recent.length} finished job${recent.length === 1 ? '' : 's'} in gallery.`}
          defaultOpen={false}
          persistKey="queue-recent"
        >
          {recent.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No completed jobs yet"
              description="Finished outputs land in Gallery — start from a prompt tool to queue your first run."
              action={generateCta}
            />
          ) : (
            <ul className="ui-list ui-scroll-region max-h-[min(24rem,50vh)] overflow-y-auto">
              {recent.map(entry => {
                const url = galleryEntryThumbUrls(entry)[0];
                return (
                  <li key={entry.id} className="ui-list-row items-center gap-3">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : null}
                    <div className="ui-list-primary min-w-0">
                      <p className="truncate text-sm text-[var(--text-secondary)]">
                        {entry.prompt}
                      </p>
                      <p className="type-caption">
                        {entry.status} · {entry.model}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CollapsibleSection>
      ) : (
        <ToolSection title="Recent completed">
          {recent.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No completed jobs yet"
              description="Finished outputs land in Gallery — start from a prompt tool to queue your first run."
              action={generateCta}
            />
          ) : (
            <ul className="ui-list">
              {recent.map(entry => {
                const url = galleryEntryThumbUrls(entry)[0];
                return (
                  <li key={entry.id} className="ui-list-row items-center gap-3">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : null}
                    <div className="ui-list-primary min-w-0">
                      <p className="truncate text-sm text-[var(--text-secondary)]">
                        {entry.prompt}
                      </p>
                      <p className="type-caption">
                        {entry.status} · {entry.model}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ToolSection>
      )}

      {status ? <p className="text-sm ui-status-success">{status}</p> : null}
    </ToolLayout>
  );
}
