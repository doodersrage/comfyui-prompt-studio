'use client';

import type { ImageLightboxJobChrome } from '@/components/ui/image-lightbox/types';

export type ImageLightboxJobBadgeProps = {
  compact?: boolean;
  job?: ImageLightboxJobChrome | null;
};

export default function ImageLightboxJobBadge({
  compact = false,
  job,
}: ImageLightboxJobBadgeProps) {
  if (!job || (job.status !== 'pending' && job.status !== 'running' && job.status !== 'error')) {
    return null;
  }

  return (
    <div
      className="ui-lightbox-pill flex items-center gap-2"
      data-immersive={compact ? 'true' : undefined}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          job.status === 'error'
            ? 'bg-rose-400'
            : job.status === 'running'
              ? 'animate-pulse bg-amber-300'
              : 'bg-sky-300'
        }`}
      />
      <span>{job.label}</span>
      {job.percent != null ? (
        <span className={compact ? 'text-white/55' : 'text-[var(--text-muted)]'}>
          {job.percent}%
        </span>
      ) : null}
    </div>
  );
}
