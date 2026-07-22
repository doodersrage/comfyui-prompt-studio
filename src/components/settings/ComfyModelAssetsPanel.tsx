"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { loadComfyUiSettings } from "@/lib/comfyui-settings";
import { loadSettingsCache } from "@/lib/settings-cache";
import { fetchComfyObjectInfoCached } from "@/lib/comfyui-object-info-cache";

type AssetRow = {
  id: string;
  label: string;
  kind: string;
  filename: string;
  modelIds: string[];
  status: "installed" | "missing" | "docs-only" | "root-missing";
  downloadable: boolean;
  onDisk: boolean;
  inInventory: boolean;
  notes?: string;
  urlHost?: string;
};

type AssetJob = {
  id: string;
  assetId: string;
  label: string;
  filename: string;
  status: string;
  progress: number;
  bytesReceived: number;
  bytesTotal: number | null;
  error?: string;
  attempt?: number;
};

type AssetsResponse = {
  ok?: boolean;
  rootConfigured?: boolean;
  rootPath?: string | null;
  rootHint?: string;
  rows?: AssetRow[];
  jobs?: AssetJob[];
  error?: string;
};

type ComfyModelAssetsPanelProps = {
  onStatus?: (message: string) => void;
  onInstalled?: () => void;
};

function statusLabel(status: AssetRow["status"]): string {
  switch (status) {
    case "installed":
      return "Installed";
    case "missing":
      return "Missing";
    case "root-missing":
      return "Needs COMFYUI_ROOT";
    case "docs-only":
      return "Manual only";
    default:
      return status;
  }
}

function formatBytes(value: number | null | undefined): string {
  if (value == null || value <= 0) {
    return "";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ComfyModelAssetsPanel({
  onStatus,
  onInstalled,
}: ComfyModelAssetsPanelProps) {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [jobs, setJobs] = useState<AssetJob[]>([]);
  const [rootConfigured, setRootConfigured] = useState(false);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootHint, setRootHint] = useState<string | undefined>();
  const [filterCurrentModel, setFilterCurrentModel] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const settings = loadComfyUiSettings();
      const modelId = filterCurrentModel
        ? loadSettingsCache().shared.model
        : undefined;
      const params = new URLSearchParams();
      if (settings.apiUrl.trim()) {
        params.set("comfyUrl", settings.apiUrl.trim());
      }
      if (modelId) {
        params.set("modelId", modelId);
      }
      if (forceRefresh) {
        params.set("forceRefresh", "1");
      }
      const response = await fetch(
        `/api/comfyui/assets${params.size ? `?${params}` : ""}`,
      );
      const data = (await response.json()) as AssetsResponse;
      if (!response.ok) {
        throw new Error(data.error || "Could not load model assets.");
      }
      setRows(data.rows ?? []);
      setJobs(data.jobs ?? []);
      setRootConfigured(Boolean(data.rootConfigured));
      setRootPath(data.rootPath ?? null);
      setRootHint(data.rootHint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load model assets.");
    } finally {
      setLoading(false);
    }
  }, [filterCurrentModel]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const activeIds = jobs
      .filter(
        (job) =>
          job.status === "queued" ||
          job.status === "downloading" ||
          job.status === "verifying",
      )
      .map((job) => job.id);
    if (activeIds.length === 0) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/comfyui/assets?jobId=${encodeURIComponent(activeIds[0]!)}`,
        );
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (cancelled || !response.ok) {
          return;
        }
        const nextJobs = data.jobs ?? (data.job ? [data.job] : []);
        setJobs(nextJobs);
        const justFinished = nextJobs.some(
          (job) =>
            activeIds.includes(job.id) &&
            (job.status === "complete" || job.status === "error"),
        );
        if (justFinished) {
          const failed = nextJobs.find(
            (job) => activeIds.includes(job.id) && job.status === "error",
          );
          if (failed?.error) {
            setError(failed.error);
          }
          await load(true);
          if (nextJobs.some((job) => job.status === "complete")) {
            void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
            onInstalled?.();
          }
        }
      } catch {
        // keep polling
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobs, load, onInstalled]);

  const install = useCallback(
    async (assetId: string): Promise<AssetJob | null> => {
      setBusyId(assetId);
      setError(null);
      try {
        const response = await fetch("/api/comfyui/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId }),
        });
        const data = (await response.json()) as AssetsResponse & {
          job?: AssetJob;
        };
        if (!response.ok || !data.job) {
          throw new Error(data.error || "Install failed to start.");
        }
        setJobs((prev) => {
          const without = prev.filter((job) => job.id !== data.job!.id);
          return [data.job!, ...without];
        });
        onStatus?.(
          data.job.status === "complete"
            ? `Already present: ${data.job.filename}`
            : `Downloading ${data.job.label}…`,
        );
        if (data.job.status === "complete") {
          await load(true);
          void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
          onInstalled?.();
        }
        return data.job;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Install failed.");
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [load, onInstalled, onStatus],
  );

  const waitForJob = useCallback(async (jobId: string) => {
    for (let i = 0; i < 60 * 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const response = await fetch(
          `/api/comfyui/assets?jobId=${encodeURIComponent(jobId)}`,
        );
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (!response.ok) {
          return null;
        }
        const job = data.job;
        if (!job) {
          return null;
        }
        setJobs(data.jobs ?? [job]);
        if (job.status === "complete" || job.status === "error") {
          return job;
        }
      } catch {
        // keep waiting
      }
    }
    return null;
  }, []);

  const installMissingForModel = useCallback(async () => {
    const missing = rows.filter(
      (row) => row.status === "missing" && row.downloadable,
    );
    if (missing.length === 0) {
      onStatus?.("No curated downloadable weights missing for this filter.");
      return;
    }
    onStatus?.(
      `Queuing ${missing.length} download${missing.length === 1 ? "" : "s"} one at a time…`,
    );
    for (const row of missing) {
      const started = await install(row.id);
      if (!started) {
        continue;
      }
      if (started.status === "complete" || started.status === "error") {
        continue;
      }
      const finished = await waitForJob(started.id);
      if (finished?.status === "error" && finished.error) {
        setError(finished.error);
      }
    }
    await load(true);
    void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
    onInstalled?.();
  }, [install, load, onInstalled, onStatus, rows, waitForJob]);

  const jobFor = (assetId: string) =>
    jobs.find((job) => job.assetId === assetId);

  return (
    <div className="space-y-3">
      <p className="type-caption text-[var(--text-muted)]">
        Curated same-machine installs into{" "}
        <code className="rounded bg-zinc-800 px-1 text-violet-300">COMFYUI_ROOT/models/…</code>.
        Only allowlisted Hugging Face URLs run; other rows show the expected filename for manual
        install. Custom nodes are not included. Optional{" "}
        <code className="rounded bg-zinc-800 px-1 text-violet-300">HF_TOKEN</code> helps with
        gated repos / 403s.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={filterCurrentModel}
            onChange={(event) => setFilterCurrentModel(event.target.checked)}
          />
          Current model only
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void load(true)}
        >
          Refresh
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading || !rootConfigured}
          onClick={() => void installMissingForModel()}
        >
          Install missing{filterCurrentModel ? " for model" : ""}
        </Button>
      </div>

      <p className="type-caption text-[var(--text-muted)]">
        {rootConfigured ? (
          <>
            Root:{" "}
            <code className="rounded bg-zinc-800 px-1 text-emerald-200/90">
              {rootPath}
            </code>
          </>
        ) : (
          <>{rootHint ?? "Set COMFYUI_ROOT to enable Install."}</>
        )}
      </p>

      {error ? (
        <p className="type-caption text-rose-300/90">{error}</p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">Loading assets…</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const job = jobFor(row.id);
            const installing =
              job &&
              (job.status === "queued" ||
                job.status === "downloading" ||
                job.status === "verifying");
            return (
              <li
                key={row.id}
                className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {row.label}{" "}
                      <span className="font-normal text-[var(--text-muted)]">
                        ({row.kind})
                      </span>
                    </p>
                    <p className="font-mono text-[11px] text-emerald-200/80">
                      {row.filename}
                    </p>
                    <p className="type-caption text-[var(--text-muted)]">
                      {statusLabel(row.status)}
                      {row.inInventory ? " · in Comfy inventory" : ""}
                      {row.onDisk ? " · on disk" : ""}
                      {row.urlHost ? ` · ${row.urlHost}` : ""}
                    </p>
                    {row.notes ? (
                      <p className="type-caption text-[var(--text-muted)]">{row.notes}</p>
                    ) : null}
                    {job && installing ? (
                      <p className="type-caption text-sky-200/90">
                        {job.status}
                        {job.attempt && job.attempt > 1 ? ` · try ${job.attempt}` : ""}
                        {" · "}
                        {Math.round(job.progress * 100)}%
                        {job.bytesTotal
                          ? ` · ${formatBytes(job.bytesReceived)} / ${formatBytes(job.bytesTotal)}`
                          : job.bytesReceived
                            ? ` · ${formatBytes(job.bytesReceived)}`
                            : ""}
                        {job.error ? ` · ${job.error}` : ""}
                      </p>
                    ) : null}
                    {job?.status === "error" ? (
                      <p className="type-caption text-rose-300/90">{job.error}</p>
                    ) : null}
                  </div>
                  {row.downloadable && row.status !== "installed" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={
                        !rootConfigured ||
                        busyId === row.id ||
                        Boolean(installing) ||
                        row.status === "root-missing"
                      }
                      onClick={() => void install(row.id)}
                    >
                      {installing
                        ? "Downloading…"
                        : busyId === row.id
                          ? "Starting…"
                          : "Install"}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
