'use client';

import VirtualizedVariationResults, {
  shouldVirtualizeVariationResults,
} from '@/components/VirtualizedVariationResults';
import ToolPrimarySection from '@/components/ui/ToolPrimarySection';
import { downloadMatrixCsv } from '@/lib/matrix-export-formats';
import { Button } from '@/components/ui/Button';
import type { useVariationGridOrchestration } from '@/hooks/useVariationGridOrchestration';

type Props = Pick<
  ReturnType<typeof useVariationGridOrchestration>,
  'results' | 'gridMode' | 'readinessByIndex'
>;

export function VariationGridResultsSection({ results, gridMode, readinessByIndex }: Props) {
  if (results.length === 0) {
    return null;
  }

  return (
    <ToolPrimarySection title="Rolled prompts">
      {gridMode === 'matrix' ? (
        <div className="mb-3">
          <Button
            variant="secondary"
            onClick={() =>
              downloadMatrixCsv(
                results.map(entry => ({
                  rowLabel: entry.rowLabel,
                  colLabel: entry.colLabel,
                  prompt: entry.prompt,
                  seed: entry.seed,
                  error: entry.error,
                }))
              )
            }
          >
            Export matrix CSV
          </Button>
        </div>
      ) : null}
      {shouldVirtualizeVariationResults(results.length) ? (
        <VirtualizedVariationResults
          items={results}
          getKey={(entry, index) => `${index}-${entry.prompt.slice(0, 24)}`}
          renderItem={(entry, index) => (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {entry.rowLabel && entry.colLabel
                  ? `${entry.rowLabel} × ${entry.colLabel}`
                  : `Variation ${index + 1}`}
                {entry.seed ? ` · seed ${entry.seed.slice(0, 48)}` : ''}
                {readinessByIndex.get(index)
                  ? ` · readiness ${readinessByIndex.get(index)!.score}/100`
                  : ''}
              </p>
              {entry.error ? (
                <p className="mt-2 text-sm ui-status-danger">{entry.error}</p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {entry.prompt}
                </p>
              )}
            </div>
          )}
        />
      ) : (
        <ol className="space-y-3">
          {results.map((entry, index) => (
            <li
              key={`${index}-${entry.prompt.slice(0, 24)}`}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/50 p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {entry.rowLabel && entry.colLabel
                  ? `${entry.rowLabel} × ${entry.colLabel}`
                  : `Variation ${index + 1}`}
                {entry.seed ? ` · seed ${entry.seed.slice(0, 48)}` : ''}
                {readinessByIndex.get(index)
                  ? ` · readiness ${readinessByIndex.get(index)!.score}/100`
                  : ''}
              </p>
              {entry.error ? (
                <p className="mt-2 text-sm ui-status-danger">{entry.error}</p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {entry.prompt}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </ToolPrimarySection>
  );
}
