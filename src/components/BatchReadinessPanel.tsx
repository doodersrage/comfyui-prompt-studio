"use client";

import { useMemo, useState } from "react";
import type { ComfyImageModel } from "@/lib/comfy-models";
import type { DetailLevel } from "@/lib/detail-level";
import {
  filterBatchByReadiness,
  scoreBatchReadiness,
  type BatchReadinessRow,
} from "@/lib/batch-readiness";
import {
  DEFAULT_READINESS_MIN_SCORE,
} from "@/lib/readiness-gate";
import { ChipButton } from "@/components/ui/Field";

function gradeClass(grade: BatchReadinessRow["grade"]): string {
  if (grade === "A" || grade === "B") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  }
  if (grade === "C") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-100";
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
    [props.detail, props.model, props.rows, minScore],
  );

  if (scored.length === 0) {
    return null;
  }

  const blocked = scored.filter((row) => !row.queueAllowed).length;
  const avg =
    scored.reduce((sum, row) => sum + row.score, 0) / Math.max(1, scored.length);

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="type-caption text-violet-200/90">Batch readiness</p>
          <p className="text-xs text-zinc-400">
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
        {scored.map((row) => (
          <li
            key={row.index}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2.5 py-1.5"
          >
            <span
              className={`rounded-full border px-2 py-0.5 font-medium ${gradeClass(row.grade)}`}
            >
              {row.score}
            </span>
            <span className="text-zinc-300">
              {row.label?.trim() || `Row ${row.index + 1}`}
            </span>
            {!row.queueAllowed ? (
              <span className="text-amber-300/90">Below threshold</span>
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
  minScore = DEFAULT_READINESS_MIN_SCORE,
): string[] {
  if (!readyOnly) {
    return prompts;
  }
  const scored = scoreBatchReadiness({ rows, model, detail, minScore });
  return filterBatchByReadiness(prompts, scored);
}
