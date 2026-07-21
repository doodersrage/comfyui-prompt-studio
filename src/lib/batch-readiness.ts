import type { ComfyImageModel } from "./comfy-models/client";
import type { DetailLevel } from "./detail-level";
import {
  DEFAULT_READINESS_MIN_SCORE,
  isReadinessQueueAllowed,
} from "./readiness-gate";
import { scorePromptReadiness, type PromptReadinessResult } from "./prompt-readiness";

export type BatchReadinessRow = {
  index: number;
  label?: string;
  prompt: string;
  hints?: string;
  score: number;
  grade: PromptReadinessResult["grade"];
  queueAllowed: boolean;
};

export function scoreBatchReadiness(options: {
  rows: Array<{ prompt: string; label?: string; hints?: string }>;
  model: ComfyImageModel;
  detail: DetailLevel;
  minScore?: number;
}): BatchReadinessRow[] {
  const minScore = options.minScore ?? DEFAULT_READINESS_MIN_SCORE;
  return options.rows
    .map((row, index) => {
      const result = scorePromptReadiness({
        prompt: row.prompt,
        hints: row.hints,
        model: options.model,
        detail: options.detail,
      });
      return {
        index,
        label: row.label,
        prompt: row.prompt,
        hints: row.hints,
        score: result.score,
        grade: result.grade,
        queueAllowed: isReadinessQueueAllowed(result.score, minScore),
      };
    })
    .filter((row) => row.prompt.trim().length > 0);
}

export function filterBatchByReadiness(
  prompts: string[],
  rows: BatchReadinessRow[],
): string[] {
  const blocked = new Set(
    rows.filter((row) => !row.queueAllowed).map((row) => row.index),
  );
  return prompts.filter((_, index) => !blocked.has(index));
}
