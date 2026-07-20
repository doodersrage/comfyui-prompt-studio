"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { StatCard, ToolActionRow } from "@/components/ui/ToolPageShell";
import { loadComfyGallery, COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery";
import { scheduleComfyGalleryPoll } from "@/lib/comfyui-gallery-poller";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

type ComfyHealth = {
  ok: boolean;
  url?: string;
  queuePending?: number;
  queueRunning?: number;
  vram?: { free?: number; total?: number };
  error?: string;
};

export default function QueueOrchestrationPanel(props: { compact?: boolean }) {
  const [health, setHealth] = useState<ComfyHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [galleryRevision, setGalleryRevision] = useState(0);

  const refreshHealth = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/health");
      const data = (await response.json()) as { comfyui?: ComfyHealth };
      setHealth(data.comfyui ?? null);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void refreshHealth();
    });
    const onGalleryUpdate = () => setGalleryRevision((value) => value + 1);
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdate);
    const interval = window.setInterval(() => void refreshHealth(), 30_000);
    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdate);
      window.clearInterval(interval);
    };
  }, [refreshHealth]);

  const localJobs = useMemo(() => {
    void galleryRevision;
    return loadComfyGallery();
  }, [galleryRevision]);

  const pendingLocal = useMemo(
    () => localJobs.filter((entry) => entry.status === "pending" || entry.status === "running"),
    [localJobs],
  );
  const runningLocal = useMemo(
    () => localJobs.filter((entry) => entry.status === "running"),
    [localJobs],
  );

  async function refreshPendingJobs() {
    setStatus(null);
    await Promise.all(
      pendingLocal.map((entry) =>
        scheduleComfyGalleryPoll(entry.promptId, { comfyUrl: entry.comfyUrl }),
      ),
    );
    setStatus(`Refreshed ${pendingLocal.length} tracked job(s).`);
    setGalleryRevision((value) => value + 1);
  }

  const vramLabel =
    health?.vram?.total != null
      ? `${Math.round((health.vram.free ?? 0) / 1e9)} / ${Math.round(health.vram.total / 1e9)} GB free`
      : null;

  return (
    <section className={`ui-meta-panel ${props.compact ? "p-4" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="type-heading">Queue orchestration</h3>
          <p className="type-caption">
            ComfyUI server queue plus locally tracked jobs from this app.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={loading}
          onClick={() => void refreshHealth()}
        >
          Refresh
        </Button>
      </div>

      <div
        className={`mt-4 grid gap-3 ${props.compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}
      >
        <StatCard
          label="ComfyUI server"
          value={health?.ok ? "Online" : "Offline"}
          detail={
            health?.ok
              ? [
                  health.queueRunning != null ? `${health.queueRunning} running` : null,
                  health.queuePending != null ? `${health.queuePending} pending` : null,
                  vramLabel,
                ]
                  .filter(Boolean)
                  .join(" · ") || health.url
              : health?.error ?? "Unreachable"
          }
          valueClassName={health?.ok === false ? "text-rose-300" : ""}
        />
        <StatCard
          label="Local tracked"
          value={String(pendingLocal.length)}
          detail={`${runningLocal.length} running · ${pendingLocal.length - runningLocal.length} pending`}
        />
        <StatCard
          label="Completed locally"
          value={String(localJobs.filter((entry) => entry.status === "completed").length)}
        />
        <StatCard
          label="Failed locally"
          value={String(localJobs.filter((entry) => entry.status === "error").length)}
          detail={
            localJobs.filter((entry) => entry.status === "error").length
              ? "Check Gallery for details"
              : undefined
          }
        />
      </div>

      <ToolActionRow className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={pendingLocal.length === 0}
          onClick={() => void refreshPendingJobs()}
        >
          Poll pending jobs
        </Button>
        <ButtonLink href="/gallery" size="sm">
          Open gallery
        </ButtonLink>
        <ButtonLink href="/studio?tab=experiments" size="sm">
          Experiments
        </ButtonLink>
      </ToolActionRow>

      {status ? <p className="mt-3 text-xs text-emerald-400">{status}</p> : null}
    </section>
  );
}
