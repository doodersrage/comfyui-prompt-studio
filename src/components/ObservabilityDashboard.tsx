"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ToolSection } from "@/components/ui/ToolPageShell";

type UsageEntry = {
  at: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  rateLimited?: boolean;
};

type UsageResponse = {
  summary?: {
    total: number;
    lastHour: number;
    rateLimited: number;
    avgDurationMs: number;
  };
  entries?: UsageEntry[];
};

export default function ObservabilityDashboard() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/usage");
      setData((await response.json()) as UsageResponse);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const recentErrors = useMemo(
    () => (data?.entries ?? []).filter((entry) => entry.status >= 400).slice(0, 8),
    [data?.entries],
  );
  const slowest = useMemo(
    () =>
      [...(data?.entries ?? [])]
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, 6),
    [data?.entries],
  );

  return (
    <ToolSection title="Observability">
      <p className="text-sm text-zinc-400">
        In-memory API usage from the proxy layer: volume, rate limits, slow routes, and recent errors.
      </p>
      <Button variant="secondary" className="mt-3" loading={loading} onClick={() => void refresh()}>
        Refresh metrics
      </Button>

      {data?.summary ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total requests" value={String(data.summary.total)} />
          <Metric label="Last hour" value={String(data.summary.lastHour)} />
          <Metric label="Rate limited" value={String(data.summary.rateLimited)} />
          <Metric label="Avg duration" value={`${data.summary.avgDurationMs}ms`} />
        </div>
      ) : null}

      {recentErrors.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recent errors</p>
          <ul className="mt-2 space-y-1 text-xs text-rose-300">
            {recentErrors.map((entry, index) => (
              <li key={`${entry.path}-${entry.at}-${index}`}>
                {entry.status} {entry.method} {entry.path} · {entry.durationMs}ms
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {slowest.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Slowest routes</p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {slowest.map((entry, index) => (
              <li key={`slow-${entry.path}-${index}`}>
                {entry.path} · {entry.durationMs}ms · {entry.status}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ToolSection>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{props.label}</p>
      <p className="mt-1 text-base font-semibold text-zinc-100">{props.value}</p>
    </div>
  );
}
