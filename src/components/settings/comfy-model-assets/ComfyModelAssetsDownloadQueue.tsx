'use client';

import { Button } from '@/components/ui/Button';
import { formatBytes } from '@/components/settings/comfy-model-assets/comfy-model-assets-utils';
import type { ComfyModelAssetsViewModel } from '@/components/settings/comfy-model-assets/useComfyModelAssets';

type Props = Pick<
  ComfyModelAssetsViewModel,
  'queueJobs' | 'activeQueueCount' | 'busyId' | 'rootConfigured' | 'rootWritable' | 'jobAction'
>;

export function ComfyModelAssetsDownloadQueue({
  queueJobs,
  activeQueueCount,
  busyId,
  rootConfigured,
  rootWritable,
  jobAction,
}: Props) {
  if (queueJobs.length === 0) {
    return null;
  }

  return (
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
            job.status === 'queued' || job.status === 'downloading' || job.status === 'verifying';
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
  );
}
