"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  comfyUiJobProgressPercent,
  comfyUiJobStatusLabel,
  formatComfyUiJobProgressLabel,
  isComfyUiJobProcessing,
  type ComfyUiJobTrackerState,
} from "@/lib/comfyui-job-status";
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from "@/lib/comfyui-live-preview-store";

type ComfyUiJobStatusPanelProps = {
  job: ComfyUiJobTrackerState;
  compact?: boolean;
};

function statusTone(job: ComfyUiJobTrackerState): string {
  if (job.status === "running") {
    return "text-[var(--tint-info-text)] border-[var(--tint-info-border)] bg-[var(--tint-info-bg)]";
  }
  if (job.status === "pending") {
    return "text-[var(--accent-text)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]";
  }
  if (job.status === "error") {
    return "text-[var(--tint-danger-text)] border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)]";
  }
  return "text-[var(--tint-success-text)] border-[var(--tint-success-border)] bg-[var(--tint-success-bg)]";
}

function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label?: string | null;
}) {
  return (
    <div className="space-y-1.5 pt-1">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-zinc-800/80"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label ?? `Generation progress ${percent}%`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500/80 to-violet-400/90 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      {label ? (
        <p className="type-caption text-[var(--text-tertiary)]">{label}</p>
      ) : null}
    </div>
  );
}

export default function ComfyUiJobStatusPanel({
  job,
  compact = false,
}: ComfyUiJobStatusPanelProps) {
  const processing = isComfyUiJobProcessing(job);
  const label = comfyUiJobStatusLabel(job);
  const percent = comfyUiJobProgressPercent(job);
  const progressLabel = formatComfyUiJobProgressLabel(job);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    () => job.previewUrl ?? getComfyLivePreviewUrl(job.promptId),
  );

  useEffect(() => {
    setPreviewUrl(job.previewUrl ?? getComfyLivePreviewUrl(job.promptId));
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ promptId?: string; keys?: string[] }>)
        .detail;
      const keys = detail?.keys ?? (detail?.promptId ? [detail.promptId] : []);
      if (keys.length > 0 && !keys.includes(job.promptId)) {
        return;
      }
      setPreviewUrl(job.previewUrl ?? getComfyLivePreviewUrl(job.promptId));
    };
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    return () => {
      window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, onPreview);
    };
  }, [job.previewUrl, job.promptId]);

  return (
    <div
      className={`ui-card overflow-hidden border ${statusTone(job)}`}
      role="status"
      aria-live="polite"
      aria-busy={processing}
    >
      <div className={`flex items-start gap-3 ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
        {processing && !previewUrl ? (
          <span className="ui-spinner ui-spinner-sm mt-0.5 shrink-0" aria-hidden />
        ) : !processing ? (
          <span
            className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
              job.status === "error" ? "bg-[var(--tint-danger)]" : "bg-[var(--tint-success)]"
            }`}
            aria-hidden
          />
        ) : null}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-medium ${compact ? "type-caption" : "type-body-sm"}`}>
              {job.status === "running"
                ? "ComfyUI is generating"
                : job.status === "pending"
                  ? "ComfyUI job queued"
                  : job.status === "error"
                    ? "ComfyUI job failed"
                    : "ComfyUI job finished"}
            </p>
            <span className="rounded-full border border-current/20 px-2 py-0.5 type-overline opacity-90">
              {label}
            </span>
            {percent != null ? (
              <span className="rounded-full border border-current/20 px-2 py-0.5 type-caption tabular-nums">
                {percent}%
              </span>
            ) : null}
          </div>

          {processing && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Live ComfyUI preview"
              className="mt-1 max-h-56 w-full rounded-lg border border-zinc-600/50 object-contain bg-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            />
          ) : null}

          {job.statusMessage?.trim() &&
          job.statusMessage.trim() !== progressLabel ? (
            <p className="type-caption text-[var(--text-secondary)]">{job.statusMessage}</p>
          ) : null}

          {percent != null ? (
            <ProgressBar percent={percent} label={progressLabel} />
          ) : null}

          <p className="type-caption text-[var(--text-tertiary)]">
            <span className="font-mono">{job.promptId}</span>
            {job.comfyUrl ? (
              <>
                {" · "}
                <span className="break-all">{job.comfyUrl}</span>
              </>
            ) : null}
          </p>

          {!compact ? (
            <div className="pt-1">
              <Link
                href="/gallery"
                className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                Open gallery
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ComfyUiGalleryJobPlaceholder({
  entry,
}: {
  entry: {
    promptId?: string;
    clientId?: string;
    status: ComfyUiJobTrackerState["status"];
    statusMessage?: string;
    queuePosition?: number | null;
    progressValue?: number;
    progressMax?: number;
    progressNode?: string | null;
  };
}) {
  const processing = entry.status === "pending" || entry.status === "running";
  const percent = comfyUiJobProgressPercent(entry);
  const progressLabel = formatComfyUiJobProgressLabel(entry);
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    getComfyLivePreviewUrl(entry.promptId, [entry.clientId]),
  );

  useEffect(() => {
    setPreviewUrl(getComfyLivePreviewUrl(entry.promptId, [entry.clientId]));
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ promptId?: string; keys?: string[] }>)
        .detail;
      const keys = detail?.keys ?? (detail?.promptId ? [detail.promptId] : []);
      const ours = [entry.promptId, entry.clientId].filter(Boolean) as string[];
      if (keys.length > 0 && ours.length > 0 && !keys.some((key) => ours.includes(key))) {
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
    <div
      className="relative flex h-full flex-col items-center justify-center gap-3 bg-zinc-950/80 px-4 text-center"
      role="status"
      aria-live="polite"
      aria-busy={processing}
    >
      {processing && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Latent render preview"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {processing && !previewUrl ? (
        <span className="ui-spinner ui-spinner-lg" aria-hidden />
      ) : null}

      <div className="relative z-10 w-full max-w-[14rem] space-y-2 rounded-xl bg-zinc-950/55 px-3 py-2 backdrop-blur-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-violet-200">
          {previewUrl ? "Latent · " : ""}
          {entry.status === "running"
            ? "Rendering"
            : entry.status === "pending"
              ? "Queued"
              : "Waiting"}
        </p>
        {entry.queuePosition != null && entry.queuePosition > 0 ? (
          <p className="text-[11px] text-zinc-400">
            Position {entry.queuePosition} in queue
          </p>
        ) : entry.status === "running" && percent == null ? (
          <p className="text-[11px] text-zinc-400">
            {previewUrl ? "Receiving latent frames…" : "Executing workflow…"}
          </p>
        ) : null}
        {percent != null ? (
          <div className="space-y-1.5">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-zinc-800/90"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500/80 to-violet-400/90 transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            {progressLabel ? (
              <p className="text-[11px] text-zinc-400">{progressLabel}</p>
            ) : null}
          </div>
        ) : entry.statusMessage?.trim() ? (
          <p className="text-[11px] text-zinc-500">{entry.statusMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
