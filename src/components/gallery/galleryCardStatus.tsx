'use client';

import { comfyUiJobProgressPercent } from '@/lib/comfyui-job-status';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';

export function statusLabel(
  status: ComfyGalleryEntry['status'],
  entry?: ComfyGalleryEntry
): string {
  if (status === 'completed') return 'Done';
  if (status === 'running') {
    const percent = entry ? comfyUiJobProgressPercent(entry) : null;
    return percent != null ? `Running · ${percent}%` : 'Running';
  }
  if (status === 'pending') return 'Queued';
  return 'Error';
}

export function statusTone(status: ComfyGalleryEntry['status']): string {
  if (status === 'completed') {
    return 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]';
  }
  if (status === 'error') {
    return 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';
  }
  if (status === 'running') {
    return 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]';
  }
  return 'border-[var(--border-default)]/40 bg-[var(--bg-muted)]/60 text-[var(--text-secondary)]';
}

export function CustomGroupBadge(props: {
  name: string;
  onClick?: (group: string) => void;
  pointerEvents?: boolean;
}) {
  const className = `${
    props.pointerEvents ? 'pointer-events-auto ' : ''
  }max-w-[10rem] truncate rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] backdrop-blur-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`;
  if (!props.onClick) {
    return (
      <span className={className} data-testid="gallery-card-custom-group" title={props.name}>
        {props.name}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-testid="gallery-card-custom-group"
      title={`Show group ${props.name}`}
      className={className}
      onClick={event => {
        event.stopPropagation();
        props.onClick?.(props.name);
      }}
    >
      {props.name}
    </button>
  );
}
