'use client';

import type { BatchLintSummary } from '@/lib/batch-lint-gate';
import { Button } from '@/components/ui/Button';

type BatchLintGatePanelProps = {
  summary: BatchLintSummary | null;
  loading?: boolean;
  onFixAll?: () => void;
  onContinue?: () => void;
  onCancel?: () => void;
};

export default function BatchLintGatePanel({
  summary,
  loading,
  onFixAll,
  onContinue,
  onCancel,
}: BatchLintGatePanelProps) {
  if (!summary && !loading) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] p-3">
      <p className="text-sm font-medium text-[var(--tint-warning-text)]">
        {loading
          ? 'Linting batch…'
          : `Batch lint: ${summary?.totalErrors ?? 0} errors, ${summary?.totalWarnings ?? 0} warnings`}
      </p>
      {summary && summary.blockedIndexes.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--tint-warning-text)]">
          {summary.items
            .filter(item => item.errorCount > 0)
            .slice(0, 8)
            .map(item => (
              <li key={item.index}>
                #{item.index + 1}
                {item.topic ? ` · ${item.topic}` : ''}: {item.errorCount} error(s)
              </li>
            ))}
        </ul>
      ) : summary ? (
        <p className="text-xs text-[var(--tint-success-text)]">No blocking lint errors found.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {onFixAll ? (
          <Button variant="secondary" className="!min-h-8" onClick={onFixAll}>
            Fix all (rules)
          </Button>
        ) : null}
        {onContinue ? (
          <Button className="!min-h-8" onClick={onContinue}>
            Continue queue
          </Button>
        ) : null}
        {onCancel ? (
          <Button variant="ghost" className="!min-h-8" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
