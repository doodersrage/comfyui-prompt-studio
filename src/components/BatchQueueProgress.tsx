"use client";

export type BatchQueuePhase = "idle" | "preflight" | "queueing" | "done" | "error";

export type BatchQueueProgressState = {
  phase: BatchQueuePhase;
  current: number;
  total: number;
  message?: string;
  failures?: Array<{ label: string; message: string }>;
};

export default function BatchQueueProgress({
  progress,
}: {
  progress: BatchQueueProgressState | null;
}) {
  if (!progress || progress.phase === "idle") {
    return null;
  }

  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : progress.phase === "done"
        ? 100
        : 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-medium text-zinc-100">
          {progress.phase === "preflight"
            ? "Pre-flight checks…"
            : progress.phase === "queueing"
              ? `Queueing ${progress.current}/${progress.total}`
              : progress.phase === "done"
                ? "Batch queue complete"
                : progress.phase === "error"
                  ? "Batch queue failed"
                  : "Processing…"}
        </p>
        <span className="text-xs text-zinc-500">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all duration-300 ${
            progress.phase === "error" ? "bg-rose-500/80" : "bg-violet-500/80"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.message ? (
        <p className="mt-2 text-xs text-zinc-400">{progress.message}</p>
      ) : null}
      {progress.failures && progress.failures.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-rose-200/90">
          {progress.failures.slice(0, 6).map((failure) => (
            <li key={`${failure.label}-${failure.message}`}>
              {failure.label}: {failure.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
