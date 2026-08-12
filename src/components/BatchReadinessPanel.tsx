'use client';

import { useMemo, useState } from 'react';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { DetailLevel } from '@/lib/detail-level';
import {
  filterBatchByReadiness,
  scoreBatchReadiness,
  type BatchReadinessRow,
} from '@/lib/batch-readiness';
import { DEFAULT_READINESS_MIN_SCORE } from '@/lib/readiness-gate';
import { ChipButton } from '@/components/ui/Field';

function gradeClass(grade: BatchReadinessRow['grade']): string {
  if (grade === 'A' || grade === 'B') {
    return 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]';
  }
  if (grade === 'C') {
    return 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]';
  }
  return 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]';
}

export default function BatchReadinessPanel(props: {
  rows: Array<{ prompt: string; label?: string; hints?: string }>;
  model: ComfyImageModel;
  detail: DetailLevel;
  minScore?: number;
  onFilterReadyOnlyChange?: (readyOnly: boolean) => void;
}) {
  const minScore = props.minScore ?? DEFAULT_READINESS_MIN_SCORE;
  const [readyOnly, setReadyOnly] = useState(false);

  const scored = useMemo(
    () =>
      scoreBatchReadiness({
        rows: props.rows,
        model: props.model,
        detail: props.detail,
        minScore,
      }),
    [props.detail, props.model, props.rows, minScore]
  );

  if (scored.length === 0) {
    return null;
  }

  const blocked = scored.filter(row => !row.queueAllowed).length;
  const avg = scored.reduce((sum, row) => sum + row.score, 0) / Math.max(1, scored.length);

  return (
    <div className="ui-panel-accent px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="type-caption text-[var(--accent-text)]">Batch readiness</p>
          <p className="text-xs text-[var(--text-muted)]">
            Avg {Math.round(avg)}/100 · {blocked} below {minScore}
          </p>
        </div>
        <ChipButton
          active={readyOnly}
          onClick={() => {
            const next = !readyOnly;
            setReadyOnly(next);
            props.onFilterReadyOnlyChange?.(next);
          }}
        >
          Ready only (≥{minScore})
        </ChipButton>
      </div>
      <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-xs">
        {scored.map(row => (
          <li
            key={row.index}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 px-2.5 py-1.5"
          >
            <span
              className={`rounded-full border px-2 py-0.5 font-medium ${gradeClass(row.grade)}`}
            >
              {row.score}
            </span>
            <span className="text-[var(--text-secondary)]">
              {row.label?.trim() || `Row ${row.index + 1}`}
            </span>
            {!row.queueAllowed ? (
              <span className="text-[var(--tint-warning-text)]">Below threshold</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function applyReadinessFilterToPrompts(
  prompts: string[],
  rows: Array<{ prompt: string; label?: string; hints?: string }>,
  model: ComfyImageModel,
  detail: DetailLevel,
  readyOnly: boolean,
  minScore = DEFAULT_READINESS_MIN_SCORE
): string[] {
  if (!readyOnly) {
    return prompts;
  }
  const scored = scoreBatchReadiness({ rows, model, detail, minScore });
  return filterBatchByReadiness(prompts, scored);
}
