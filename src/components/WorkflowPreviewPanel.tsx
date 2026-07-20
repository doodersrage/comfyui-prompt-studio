"use client";

import { Skeleton, Spinner } from "@/components/ui/Button";

type WorkflowPreviewPanelProps = {
  loading?: boolean;
  error?: string | null;
  preview?: {
    workflowSource?: string;
    replacements?: {
      positive: number;
      negative: number;
      params?: Record<string, number>;
      custom?: Record<string, number>;
    };
    resolvedParams?: {
      seed: string;
      width: string;
      height: string;
      cfg: string;
      steps: string;
    };
    snippets?: Array<{ path: string; value: string }>;
    workflowJson?: string;
    truncated?: boolean;
    preflightIssues?: Array<{ severity: "error" | "warn"; message: string }>;
    queueOptimizeChanges?: string[];
  } | null;
};

export default function WorkflowPreviewPanel({
  loading,
  error,
  preview,
}: WorkflowPreviewPanelProps) {
  if (loading) {
    return (
      <div
        className="ui-surface space-y-3 p-4"
        role="status"
        aria-label="Building workflow preview"
      >
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <Skeleton className="ui-skeleton-title flex-1" />
        </div>
        <Skeleton className="ui-skeleton-row w-full" />
        <Skeleton className="ui-skeleton-row w-5/6" />
        <Skeleton className="ui-skeleton-block w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="ui-alert-danger type-caption">{error}</p>;
  }

  if (!preview) {
    return null;
  }

  return (
    <div className="ui-surface space-y-3 p-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 type-caption">
        <span>
          Source:{" "}
          <span className="text-[var(--text-primary)]">
            {preview.workflowSource ?? "unknown"}
          </span>
        </span>
        {preview.replacements && (
          <span>
            Replacements:{" "}
            <span className="text-[var(--text-primary)]">
              {preview.replacements.positive} positive
              {preview.replacements.negative > 0
                ? ` · ${preview.replacements.negative} negative`
                : ""}
              {preview.replacements.params &&
              Object.keys(preview.replacements.params).length > 0
                ? ` · params ${Object.entries(preview.replacements.params)
                    .map(([key, count]) => `${key}:${count}`)
                    .join(", ")}`
                : ""}
              {preview.replacements.custom &&
              Object.keys(preview.replacements.custom).length > 0
                ? ` · custom ${Object.entries(preview.replacements.custom)
                    .map(([token, count]) => `${token}:${count}`)
                    .join(", ")}`
                : ""}
            </span>
          </span>
        )}
        {preview.resolvedParams && (
          <span>
            Params:{" "}
            <span className="type-code !bg-transparent !p-0 text-[var(--tint-info-text)]">
              seed={preview.resolvedParams.seed} · {preview.resolvedParams.width}×
              {preview.resolvedParams.height} · cfg {preview.resolvedParams.cfg} · steps{" "}
              {preview.resolvedParams.steps}
            </span>
          </span>
        )}
      </div>

      {preview.queueOptimizeChanges && preview.queueOptimizeChanges.length > 0 ? (
        <ul className="space-y-1.5">
          <p className="type-caption text-[var(--text-muted)]">Queue graph enrich</p>
          {preview.queueOptimizeChanges.map((message) => (
            <li
              key={message}
              className="type-caption rounded-[var(--radius-md)] border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-violet-100/90"
            >
              {message}
            </li>
          ))}
        </ul>
      ) : null}

      {preview.preflightIssues && preview.preflightIssues.length > 0 ? (
        <ul className="space-y-1.5">
          {preview.preflightIssues.map((issue) => (
            <li
              key={issue.message}
              className={
                issue.severity === "error"
                  ? "type-caption rounded-[var(--radius-md)] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200"
                  : "type-caption rounded-[var(--radius-md)] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-100/90"
              }
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {preview.snippets && preview.snippets.length > 0 && (
        <ul className="space-y-1 type-caption">
          {preview.snippets.map((snippet) => (
            <li key={`${snippet.path}-${snippet.value.slice(0, 24)}`}>
              <span className="type-code text-[var(--accent-text)]">{snippet.path}</span>
              <span className="text-[var(--text-muted)]"> → </span>
              <span className="type-code !bg-transparent !p-0 text-[var(--tint-success-text)]">
                {snippet.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {preview.workflowJson && (
        <pre className="type-code max-h-72 overflow-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-3 !text-[var(--text-secondary)]">
          {preview.workflowJson}
          {preview.truncated ? "\n… (truncated)" : ""}
        </pre>
      )}
    </div>
  );
}
