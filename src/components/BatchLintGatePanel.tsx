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
    <div className="space-y-3 rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
      <p className="text-sm font-medium text-amber-100">
        {loading
          ? 'Linting batch…'
          : `Batch lint: ${summary?.totalErrors ?? 0} errors, ${summary?.totalWarnings ?? 0} warnings`}
      </p>
      {summary && summary.blockedIndexes.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-amber-100/90">
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
        <p className="text-xs text-emerald-200">No blocking lint errors found.</p>
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
