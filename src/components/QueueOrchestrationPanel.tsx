"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadComfyGallery, COMFYUI_GALLERY_UPDATED_EVENT } from "@/lib/comfyui-gallery";
import { scheduleComfyGalleryPoll } from "@/lib/comfyui-gallery-poller";

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
    void refreshHealth();
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
    <section
      className={`rounded-2xl border border-zinc-800 bg-zinc-950/50 ${props.compact ? "p-4" : "p-5"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Queue orchestration</h3>
          <p className="text-xs text-zinc-500">
            ComfyUI server queue plus locally tracked jobs from this app.
          </p>
        </div>
        <Button
          variant="ghost"
          className="!min-h-8 px-2 text-xs"
          loading={loading}
          onClick={() => void refreshHealth()}
        >
          Refresh
        </Button>
      </div>

      <div className={`mt-4 grid gap-3 ${props.compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <Metric
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
          ok={health?.ok}
        />
        <Metric
          label="Local tracked"
          value={String(pendingLocal.length)}
          detail={`${runningLocal.length} running · ${pendingLocal.length - runningLocal.length} pending`}
        />
        <Metric label="Completed locally" value={String(localJobs.filter((e) => e.status === "completed").length)} />
        <Metric
          label="Failed locally"
          value={String(localJobs.filter((e) => e.status === "error").length)}
          detail={localJobs.filter((e) => e.status === "error").length ? "Check Gallery for details" : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" className="!min-h-9" disabled={pendingLocal.length === 0} onClick={() => void refreshPendingJobs()}>
          Poll pending jobs
        </Button>
        <Link href="/gallery" className="ui-btn-secondary !min-h-9 px-4 text-sm">
          Open gallery
        </Link>
        <Link href="/studio?tab=experiments" className="ui-btn-secondary !min-h-9 px-4 text-sm">
          Experiments
        </Link>
      </div>

      {status ? <p className="mt-3 text-xs text-emerald-400">{status}</p> : null}
    </section>
  );
}

function Metric(props: {
  label: string;
  value: string;
  detail?: string;
  ok?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{props.label}</p>
      <p className={`mt-1 text-base font-semibold ${props.ok === false ? "text-rose-300" : "text-zinc-100"}`}>
        {props.value}
      </p>
      {props.detail ? <p className="mt-1 text-[11px] text-zinc-500">{props.detail}</p> : null}
    </div>
  );
}
