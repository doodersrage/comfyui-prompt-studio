'use client';

import { useEffect, useMemo, useState } from 'react';
import { classifyDiffusersWorkflow } from '@/lib/diffusers-client';
import { formatDiffusersClassifyHint } from '@/lib/diffusers-workflow-support';

type DiffusersWorkflowSupportHintProps = {
  workflowJson?: string | null;
  className?: string;
};

export default function DiffusersWorkflowSupportHint({
  workflowJson,
  className,
}: DiffusersWorkflowSupportHintProps) {
  const emptyHint = useMemo(() => formatDiffusersClassifyHint(null), []);
  const [hint, setHint] = useState(emptyHint);

  useEffect(() => {
    if (!workflowJson?.trim()) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const parsed = JSON.parse(workflowJson) as Record<string, unknown>;
          const result = await classifyDiffusersWorkflow(parsed);
          if (!cancelled) {
            setHint(formatDiffusersClassifyHint(result));
          }
        } catch {
          if (!cancelled) {
            setHint({
              mode: 'unknown',
              label: 'Invalid workflow JSON',
              detail: 'Could not parse workflow for Diffusers classify.',
            });
          }
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workflowJson]);

  const displayHint = workflowJson?.trim() ? hint : emptyHint;

  const tone =
    displayHint.mode === 'native'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
      : displayHint.mode === 'fallback'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
        : 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 text-[var(--text-secondary)]';

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tone} ${className ?? ''}`}>
      <p className="font-medium">{displayHint.label}</p>
      <p className="mt-1 opacity-90">{displayHint.detail}</p>
    </div>
  );
}
