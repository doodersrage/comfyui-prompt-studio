"use client";

import { useEffect, useState } from "react";
import { scorePromptReadiness, type PromptReadinessResult } from "@/lib/prompt-readiness";
import {
  DEFAULT_READINESS_MIN_SCORE,
  isReadinessQueueAllowed,
  readinessGateMessage,
} from "@/lib/readiness-gate";
import { planReadinessAutoFix } from "@/lib/readiness-auto-fix";
import type { ComfyImageModel } from "@/lib/comfy-models";
import type { DetailLevel } from "@/lib/detail-level";
import { Button } from "@/components/ui/Button";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

export default function ReadinessBadge(props: {
  prompt: string;
  hints?: string;
  model: ComfyImageModel | string;
  detail: DetailLevel | string;
  negativePrompt?: string;
  minScore?: number;
  onResult?: (result: PromptReadinessResult | null) => void;
  onCompact?: () => void | Promise<void>;
  onFixRules?: () => void | Promise<void>;
  onReformat?: () => void | Promise<void>;
}) {
  const [result, setResult] = useState<PromptReadinessResult | null>(null);
  const [fixing, setFixing] = useState(false);
  const minScore = props.minScore ?? DEFAULT_READINESS_MIN_SCORE;

  useEffect(() => {
    scheduleAfterCommit(() => {
      if (!props.prompt.trim()) {
        setResult(null);
        props.onResult?.(null);
        return;
      }
      void fetch("/api/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(props),
      })
        .then((response) => response.json())
        .then((data: PromptReadinessResult) => {
          setResult(data);
          props.onResult?.(data);
        })
        .catch(() => {
          const fallback = scorePromptReadiness({
            prompt: props.prompt,
            hints: props.hints,
            model: props.model as ComfyImageModel,
            detail: props.detail as DetailLevel,
            negativePrompt: props.negativePrompt,
          });
          setResult(fallback);
          props.onResult?.(fallback);
        });
    });
  }, [props.prompt, props.hints, props.model, props.detail, props.negativePrompt]);

  async function runAutoFix() {
    if (!result) {
      return;
    }
    setFixing(true);
    try {
      for (const action of planReadinessAutoFix(result)) {
        if (action === "compact") {
          await props.onCompact?.();
        } else if (action === "fix-rules") {
          await props.onFixRules?.();
        } else if (action === "reformat") {
          await props.onReformat?.();
        }
      }
    } finally {
      setFixing(false);
    }
  }

  if (!result) {
    return null;
  }

  const queueAllowed = isReadinessQueueAllowed(result.score, minScore);
  const failedChecks = result.checks.filter((check) => !check.passed);
  const canAutoFix =
    planReadinessAutoFix(result).length > 0 &&
    (props.onCompact || props.onFixRules || props.onReformat);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-zinc-100">
          Prompt readiness: {result.score}/100 ({result.grade})
        </p>
        {!queueAllowed ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
            Below queue threshold ({minScore})
          </span>
        ) : (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
            Ready to queue
          </span>
        )}
      </div>

      {!queueAllowed ? (
        <p className="mt-2 text-xs text-amber-200/90">{readinessGateMessage(result.score, minScore)}</p>
      ) : null}

      <ul className="mt-2 space-y-1 text-zinc-400">
        {result.checks.map((check) => (
          <li key={check.id}>
            {check.passed ? "✓" : "✗"} {check.label}
            {check.detail ? ` — ${check.detail}` : ""}
          </li>
        ))}
      </ul>

      {result.suggestions.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-zinc-500">
          {result.suggestions.map((suggestion) => (
            <li key={suggestion}>• {suggestion}</li>
          ))}
        </ul>
      ) : null}

      {canAutoFix ? (
        <Button variant="secondary" className="mt-3" loading={fixing} onClick={() => void runAutoFix()}>
          Fix readiness issues
        </Button>
      ) : null}

      {failedChecks.length === 0 ? null : (
        <p className="mt-2 text-[11px] text-zinc-600">
          {failedChecks.length} check(s) failed
          {canAutoFix ? " — use Fix readiness issues or queue anyway." : "."}
        </p>
      )}
    </div>
  );
}
