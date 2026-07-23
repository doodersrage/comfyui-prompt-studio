"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadComfyGallery, type ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import { galleryEntryThumbUrls } from "@/lib/comfyui-gallery";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/ViewState";
import { ToolLayout, ToolSection, ToolBadge } from "@/components/ui/ToolPageShell";
import { toastBulkQueueSummary, toastQueueOutcome } from "@/lib/app-toast";
import { resolveGenerateEmptyCta } from "@/lib/empty-cta";
import { requeueComfyJobFromEntry, requeueComfyJobs } from "@/lib/comfyui-requeue";
import { resolveRequeueImageUrlsFromEntry } from "@/lib/queue-requeue-images";
import { markOnboardingFirstQueue } from "@/lib/onboarding-hooks";
import SetupReadinessBanner from "@/components/SetupReadinessBanner";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { freeComfyUiMemory, interruptComfyUiQueue } from "@/lib/comfyui-queue-control";
import { cancelComfyGalleryJob } from "@/lib/comfyui-queue-cancel";
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from "@/lib/comfyui-live-preview-store";
import { comfyUiJobProgressPercent } from "@/lib/comfyui-job-status";

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
    getComfyLivePreviewUrl(entry.promptId, [entry.clientId]),
  );
  const percent = comfyUiJobProgressPercent(entry);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setPreviewUrl(getComfyLivePreviewUrl(entry.promptId, [entry.clientId]));
    });
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
    <li className="ui-list-row items-start">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-md object-cover border border-zinc-700/70"
        />
      ) : null}
      <div className="ui-list-primary min-w-0 space-y-1">
        <p className="truncate text-sm text-zinc-200">{entry.prompt}</p>
        <p className="type-caption">
          {entry.status}
          {entry.queuePosition ? ` · #${entry.queuePosition}` : ""}
          {percent != null ? ` · ${percent}%` : ""}
          {entry.model ? ` · ${entry.model}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
  const [entries, setEntries] = useState<ComfyGalleryEntry[]>([]);
  const [queueHealth, setQueueHealth] = useState<ComfyQueueHealth | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refreshEntries = useCallback(() => {
    setEntries(loadComfyGallery());
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health");
      const data = (await response.json()) as {
        comfyui?: ComfyQueueHealth;
      };
      setQueueHealth(data.comfyui ?? null);
    } catch {
      setQueueHealth(null);
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
    () =>
      entries.filter(
        (entry) => entry.status === "pending" || entry.status === "running",
      ),
    [entries],
  );
  const failed = useMemo(
    () => entries.filter((entry) => entry.status === "error").slice(0, 30),
    [entries],
  );
  const recent = useMemo(
    () =>
      entries
        .filter((entry) => entry.status === "completed")
        .slice(0, 20),
    [entries],
  );

  async function interruptComfyQueue() {
    setStatus("Sending interrupt to ComfyUI…");
    const result = await interruptComfyUiQueue(queueHealth?.url);
    if (!result.ok) {
      setStatus(result.error ?? "Interrupt failed.");
      return;
    }
    setStatus("ComfyUI interrupt sent.");
    void refreshHealth();
  }

  async function freeComfyVram() {
    setStatus("Freeing ComfyUI VRAM…");
    const result = await freeComfyUiMemory(queueHealth?.url);
    if (!result.ok) {
      setStatus(result.error ?? "Free VRAM failed.");
      return;
    }
    setStatus("ComfyUI VRAM freed.");
    void refreshHealth();
  }

  async function cancelJob(entry: ComfyGalleryEntry) {
    setStatus(`Cancelling ${entry.promptId || "job"}…`);
    const result = await cancelComfyGalleryJob(entry);
    setStatus(result.ok ? "Job cancelled." : result.error ?? "Cancel failed.");
    refreshEntries();
  }

  async function retryFailed() {
    if (failed.length === 0) {
      return;
    }
    setStatus(`Retrying ${failed.length} failed job(s)…`);
    const results = await requeueComfyJobs(
      failed.map((entry) => {
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
      }),
    );
    markOnboardingFirstQueue();
    setStatus(`Retried ${results.queued}/${failed.length}.`);
    toastBulkQueueSummary({
      label: "Retry failed finished",
      queued: results.queued,
      failed: results.failed,
    });
    refreshEntries();
  }

  const generateCta = resolveGenerateEmptyCta();

  return (
    <ToolLayout
      accent="violet"
      badge={<ToolBadge accent="violet">Queue</ToolBadge>}
      title="ComfyUI job queue"
      description="Pending and running jobs across gallery entries. Live ComfyUI queue stats refresh every few seconds."
    >
      <SetupReadinessBanner toolLabel="Queue" />
      {queueHealth?.ok ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-400">
            ComfyUI queue: {queueHealth.queueRunning ?? 0} running · {queueHealth.queuePending ?? 0} pending
          </p>
          {(queueHealth.queueRunning ?? 0) + (queueHealth.queuePending ?? 0) > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => void interruptComfyQueue()}>
              Interrupt queue
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => void freeComfyVram()}>
            Free VRAM
          </Button>
        </div>
      ) : (
        <ErrorState
          compact
          title="ComfyUI health unavailable"
          description="The queue stats endpoint did not respond. Use Settings → Heal & ready, or check your ComfyUI URL under Connection."
          action={{ label: "Heal & ready", href: "/settings" }}
        />
      )}

      <ToolSection title={`Active (${pending.length})`}>
        {pending.length === 0 ? (
          entries.length === 0 ? (
            <EmptyState
              compact
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
            {pending.map((entry) => (
              <QueueActiveJobRow
                key={entry.id}
                entry={entry}
                onRetry={() => {
                  void requeueComfyJobFromEntry(entry).then((result) => {
                    if (result.ok) {
                      markOnboardingFirstQueue();
                      toastQueueOutcome({
                        ok: true,
                        text: result.promptId
                          ? `Retry queued · ${result.promptId}`
                          : "Retry queued",
                      });
                    } else {
                      toastQueueOutcome({
                        ok: false,
                        text: result.error ?? "Retry failed.",
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
                : { label: "Open Gallery", href: "/gallery" }
            }
          />
        ) : (
          <>
            <Button variant="secondary" className="mb-3" onClick={() => void retryFailed()}>
              Retry all failed
            </Button>
            <ul className="ui-list">
              {failed.map((entry) => (
                <li key={entry.id} className="ui-list-row items-start">
                  <div className="ui-list-primary min-w-0 space-y-1">
                    <p className="truncate text-sm text-zinc-200">{entry.prompt}</p>
                    <p className="type-caption text-rose-300/80">
                      {entry.statusMessage ?? entry.status} · {entry.model}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => void requeueComfyJobFromEntry(entry)}>
                    Retry
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </ToolSection>

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
            {recent.map((entry) => {
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
                    <p className="truncate text-sm text-zinc-300">{entry.prompt}</p>
                    <p className="type-caption">{entry.status} · {entry.model}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ToolSection>

      {status ? <p className="text-sm text-emerald-400">{status}</p> : null}
    </ToolLayout>
  );
}
