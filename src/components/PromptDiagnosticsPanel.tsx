'use client';

import type { PromptDiagnostics } from '@/lib/prompt-diagnostics';
import { summarizeDiagnostics } from '@/lib/generation-diagnostics';

type PromptDiagnosticsPanelProps = {
  diagnostics: PromptDiagnostics | null;
  loading?: boolean;
};

const severityStyles = {
  error: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
} as const;

export default function PromptDiagnosticsPanel({
  diagnostics,
  loading = false,
}: PromptDiagnosticsPanelProps) {
  if (loading) {
    return (
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-500">
        Analyzing prompt…
      </section>
    );
  }

  if (!diagnostics) {
    return null;
  }

  const summary = summarizeDiagnostics(diagnostics);

  return (
    <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-200">Diagnostics</h3>
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
          {summary}
        </span>
      </div>

      <dl className="grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
        {diagnostics.inferred.sport && (
          <>
            <dt>Sport</dt>
            <dd className="text-zinc-200">{diagnostics.inferred.sport}</dd>
          </>
        )}
        {diagnostics.inferred.cyclingDiscipline && (
          <>
            <dt>Discipline</dt>
            <dd className="text-zinc-200">{diagnostics.inferred.cyclingDiscipline}</dd>
          </>
        )}
        {diagnostics.inferred.peopleCount && (
          <>
            <dt>People</dt>
            <dd className="text-zinc-200">{diagnostics.inferred.peopleCount}</dd>
          </>
        )}
        {diagnostics.inferred.athleticCompetition && (
          <>
            <dt>Competition kit</dt>
            <dd className="text-zinc-200">shared race kit</dd>
          </>
        )}
      </dl>

      {diagnostics.issues.length > 0 && (
        <ul className="space-y-2">
          {diagnostics.issues.map(issue => (
            <li
              key={issue.code}
              className={`rounded-lg border px-3 py-2 text-xs ${severityStyles[issue.severity]}`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {diagnostics.suggestions.length > 0 && (
        <ul className="space-y-1 text-xs text-zinc-500">
          {diagnostics.suggestions.map(suggestion => (
            <li key={suggestion}>• {suggestion}</li>
          ))}
        </ul>
      )}

      {diagnostics.issues.length === 0 && diagnostics.suggestions.length === 0 && (
        <p className="text-xs text-emerald-400/90">No issues detected.</p>
      )}
    </section>
  );
}
