'use client';

import { useEffect, useState } from 'react';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import { comfyUiJobProgressPercent } from '@/lib/comfyui-job-status';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { Button } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';

export default function QueueActiveJobRow({
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
