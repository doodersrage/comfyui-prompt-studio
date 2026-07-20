"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadComfyGallery, type ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import { galleryEntryViewUrls } from "@/lib/comfyui-gallery";
import { Button } from "@/components/ui/Button";
import { ToolLayout, ToolSection, ToolBadge } from "@/components/ui/ToolPageShell";
import { requeueComfyJob, requeueComfyJobs } from "@/lib/comfyui-requeue";
import { markOnboardingFirstQueue } from "@/lib/onboarding-hooks";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

type ComfyQueueHealth = {
  queueRunning?: number;
  queuePending?: number;
  ok?: boolean;
};

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
    try {
      const response = await fetch("/api/comfyui/interrupt", { method: "POST" });
      const data = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok) {
        throw new Error(data.error ?? "Interrupt failed.");
      }
      setStatus("ComfyUI interrupt sent.");
      void refreshHealth();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Interrupt failed.");
    }
  }

  async function retryFailed() {
    if (failed.length === 0) {
      return;
    }
    setStatus(`Retrying ${failed.length} failed job(s)…`);
    const results = await requeueComfyJobs(
      failed.map((entry) => ({
        prompt: entry.prompt,
        negativePrompt: entry.negativePrompt,
        tool: entry.tool,
        model: entry.model,
        queueParams: entry.queueParams,
      })),
    );
    markOnboardingFirstQueue();
    setStatus(`Retried ${results.queued}/${failed.length}.`);
    refreshEntries();
  }

  return (
    <ToolLayout
      accent="violet"
      badge={<ToolBadge accent="violet">Queue</ToolBadge>}
      title="ComfyUI job queue"
      description="Pending and running jobs across gallery entries. Live ComfyUI queue stats refresh every few seconds."
    >
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
        </div>
      ) : (
        <p className="text-sm text-zinc-500">ComfyUI health unavailable — check Settings.</p>
      )}

      <ToolSection title={`Active (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending jobs.</p>
        ) : (
          <ul className="ui-list">
            {pending.map((entry) => (
              <li key={entry.id} className="ui-list-row items-start">
                <div className="ui-list-primary min-w-0 space-y-1">
                  <p className="truncate text-sm text-zinc-200">{entry.prompt}</p>
                  <p className="type-caption">
                    {entry.status}
                    {entry.queuePosition ? ` · #${entry.queuePosition}` : ""} · {entry.model}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void requeueComfyJob(entry).then((result) => {
                      if (result.ok) {
                        markOnboardingFirstQueue();
                      }
                      refreshEntries();
                    });
                  }}
                >
                  Retry
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ToolSection>

      <ToolSection title={`Failed (${failed.length})`}>
        {failed.length === 0 ? (
          <p className="text-sm text-zinc-500">No failed jobs in gallery.</p>
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
                  <Button size="sm" variant="secondary" onClick={() => void requeueComfyJob(entry)}>
                    Retry
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </ToolSection>

      <ToolSection title="Recent completed">
        <ul className="ui-list">
          {recent.map((entry) => {
            const url = galleryEntryViewUrls(entry)[0];
            return (
              <li key={entry.id} className="ui-list-row items-center gap-3">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
                ) : null}
                <div className="ui-list-primary min-w-0">
                  <p className="truncate text-sm text-zinc-300">{entry.prompt}</p>
                  <p className="type-caption">{entry.status} · {entry.model}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </ToolSection>

      {status ? <p className="text-sm text-emerald-400">{status}</p> : null}
    </ToolLayout>
  );
}
