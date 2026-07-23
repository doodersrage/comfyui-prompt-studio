"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Field";
import { loadComfyUiSettings } from "@/lib/comfyui-settings";
import { loadSettingsCache } from "@/lib/settings-cache";
import { fetchComfyObjectInfoCached } from "@/lib/comfyui-object-info-cache";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import {
  COMFY_ASSET_KIND_LABELS,
  COMFY_ASSET_KIND_ORDER,
  type ComfyAssetKind,
} from "@/lib/comfy-asset-kinds";

type AssetRow = {
  id: string;
  label: string;
  kind: ComfyAssetKind | string;
  filename: string;
  modelIds: string[];
  status: "installed" | "missing" | "docs-only" | "root-missing";
  downloadable: boolean;
  onDisk: boolean;
  inInventory: boolean;
  notes?: string;
  urlHost?: string;
  requiresHfToken?: boolean;
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
  rootWritable?: boolean;
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
  const [rootWritable, setRootWritable] = useState(true);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootHint, setRootHint] = useState<string | undefined>();
  const [filterCurrentModel, setFilterCurrentModel] = useState(false);
  const [kindFilter, setKindFilter] = useState<"all" | ComfyAssetKind>("all");
  const [missingOnly, setMissingOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const jobsRef = useRef<AssetJob[]>([]);
  const loadRef = useRef<(forceRefresh?: boolean) => Promise<void>>(async () => {});
  const onInstalledRef = useRef(onInstalled);
  const pollInFlightRef = useRef(false);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const settings = loadComfyUiSettings();
      const modelId = filterCurrentModel
        ? loadSettingsCache().shared.model
        : undefined;
      const params = new URLSearchParams();
      const apiUrl = settings.apiUrl?.trim() ?? "";
      if (apiUrl) {
        params.set("comfyUrl", apiUrl);
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
      setRootWritable(data.rootWritable !== false);
      setRootPath(data.rootPath ?? null);
      setRootHint(data.rootHint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load model assets.");
    } finally {
      setLoading(false);
    }
  }, [filterCurrentModel]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    onInstalledRef.current = onInstalled;
  }, [onInstalled]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void load();
    });
  }, [load]);

  // Stable poller — do not depend on `jobs` or each tick tears down the
  // in-flight fetch and the progress counter appears frozen.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled || pollInFlightRef.current) {
        return;
      }
      const active = jobsRef.current.filter(
        (job) =>
          job.status === "queued" ||
          job.status === "downloading" ||
          job.status === "verifying",
      );
      if (active.length === 0) {
        return;
      }
      pollInFlightRef.current = true;
      const activeIds = active.map((job) => job.id);
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
          await loadRef.current(true);
          if (nextJobs.some((job) => job.status === "complete")) {
            void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
            onInstalledRef.current?.();
          }
        }
      } catch {
        // keep polling
      } finally {
        pollInFlightRef.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 750);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

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

  const jobFor = (assetId: string) =>
    jobs.find((job) => job.assetId === assetId);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (kindFilter !== "all" && row.kind !== kindFilter) {
        return false;
      }
      if (missingOnly && row.status === "installed") {
        return false;
      }
      return true;
    });
  }, [rows, kindFilter, missingOnly]);

  const groupedRows = useMemo(() => {
    const groups: Array<{ kind: ComfyAssetKind | string; rows: AssetRow[] }> = [];
    const byKind = new Map<string, AssetRow[]>();
    for (const row of visibleRows) {
      const list = byKind.get(row.kind) ?? [];
      list.push(row);
      byKind.set(row.kind, list);
    }
    for (const kind of COMFY_ASSET_KIND_ORDER) {
      const list = byKind.get(kind);
      if (list?.length) {
        groups.push({ kind, rows: list });
        byKind.delete(kind);
      }
    }
    for (const [kind, list] of byKind) {
      groups.push({ kind, rows: list });
    }
    return groups;
  }, [visibleRows]);

  const downloadableMissing = visibleRows.filter(
    (row) => row.status === "missing" && row.downloadable,
  ).length;

  const installMissingForModel = useCallback(async () => {
    const missing = visibleRows.filter(
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
  }, [install, load, onInstalled, onStatus, visibleRows, waitForJob]);

  return (
    <div className="space-y-3">
      <p className="type-caption text-[var(--text-muted)]">
        Curated same-machine installs for supported workflows — checkpoints, UNETs, VAEs,
        text encoders / CLIP, LoRAs, upscalers, and ControlNets — into{" "}
        <code className="rounded bg-zinc-800 px-1 text-violet-300">COMFYUI_ROOT/models/…</code>.
        Only allowlisted Hugging Face URLs run; gated or third-party rows stay manual. Custom
        nodes are not included. Optional{" "}
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
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(event) => setMissingOnly(event.target.checked)}
          />
          Missing / manual only
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
          disabled={
            loading ||
            !rootConfigured ||
            !rootWritable ||
            downloadableMissing === 0
          }
          onClick={() => void installMissingForModel()}
        >
          Install missing
          {filterCurrentModel ? " for model" : ""}
          {downloadableMissing > 0 ? ` (${downloadableMissing})` : ""}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <ChipButton
          active={kindFilter === "all"}
          onClick={() => setKindFilter("all")}
        >
          All kinds
        </ChipButton>
        {COMFY_ASSET_KIND_ORDER.map((kind) => {
          const count = rows.filter((row) => row.kind === kind).length;
          if (count === 0) {
            return null;
          }
          return (
            <ChipButton
              key={kind}
              active={kindFilter === kind}
              onClick={() => setKindFilter(kind)}
            >
              {COMFY_ASSET_KIND_LABELS[kind]}
              <span className="opacity-60"> {count}</span>
            </ChipButton>
          );
        })}
      </div>

      <p className="type-caption text-[var(--text-muted)]">
        {rootConfigured ? (
          <>
            Root:{" "}
            <code className="rounded bg-zinc-800 px-1 text-emerald-200/90">
              {rootPath}
            </code>
            {!rootWritable ? (
              <span className="mt-1 block text-amber-300/90">
                {rootHint ??
                  "Not writable by this app process — Install cannot save files until COMFYUI_ROOT/models allows write access."}
              </span>
            ) : null}
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
      ) : visibleRows.length === 0 ? (
        <p className="type-caption text-[var(--text-muted)]">
          No assets match this filter.
        </p>
      ) : (
        <div className="space-y-4">
          {groupedRows.map((group) => (
            <section key={group.kind} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {COMFY_ASSET_KIND_LABELS[group.kind as ComfyAssetKind] ??
                  group.kind}
              </h3>
              <ul className="space-y-2">
                {group.rows.map((row) => {
                  const job = jobFor(row.id);
                  const installing =
                    job &&
                    (job.status === "queued" ||
                      job.status === "downloading" ||
                      job.status === "verifying");
                  return (
                    <li
                      key={row.id}
                      className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 px-3 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {row.label}
                          </p>
                          <p className="font-mono text-[11px] text-emerald-200/80">
                            {row.filename}
                          </p>
                          <p className="type-caption text-[var(--text-muted)]">
                            {statusLabel(row.status)}
                            {row.inInventory ? " · in Comfy inventory" : ""}
                            {row.onDisk ? " · on disk" : ""}
                            {row.urlHost ? ` · ${row.urlHost}` : ""}
                            {row.requiresHfToken ? " · needs HF_TOKEN" : ""}
                          </p>
                          {row.notes ? (
                            <p className="type-caption text-[var(--text-muted)]">
                              {row.notes}
                            </p>
                          ) : null}
                          {job && installing ? (
                            <p className="type-caption text-sky-200/90">
                              {job.status}
                              {job.attempt && job.attempt > 1
                                ? ` · try ${job.attempt}`
                                : ""}
                              {" · "}
                              {job.bytesTotal &&
                              job.bytesReceived <= job.bytesTotal * 1.02
                                ? `${Math.round(job.progress * 100)}% · ${formatBytes(job.bytesReceived)} / ${formatBytes(job.bytesTotal)}`
                                : job.bytesReceived
                                  ? `${formatBytes(job.bytesReceived)} received`
                                  : `${Math.round(job.progress * 100)}%`}
                              {job.error ? ` · ${job.error}` : ""}
                            </p>
                          ) : null}
                          {job?.status === "error" ? (
                            <p className="type-caption text-rose-300/90">
                              {job.error}
                            </p>
                          ) : null}
                        </div>
                        {row.downloadable && row.status !== "installed" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={
                              !rootConfigured ||
                              !rootWritable ||
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
