"use client";

import { useEffect, useState } from "react";
import { scorePromptReadiness, type PromptReadinessResult } from "@/lib/prompt-readiness";
import type { ComfyImageModel } from "@/lib/comfy-models";
import type { DetailLevel } from "@/lib/detail-level";

export default function ReadinessBadge(props: {
  prompt: string;
  hints?: string;
  model: ComfyImageModel | string;
  detail: DetailLevel | string;
  negativePrompt?: string;
}) {
  const [result, setResult] = useState<PromptReadinessResult | null>(null);

  useEffect(() => {
    if (!props.prompt.trim()) {
      setResult(null);
      return;
    }
    void fetch("/api/readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(props),
    })
      .then((response) => response.json())
      .then((data: PromptReadinessResult) => setResult(data))
      .catch(() => {
        setResult(
          scorePromptReadiness({
            prompt: props.prompt,
            hints: props.hints,
            model: props.model as ComfyImageModel,
            detail: props.detail as DetailLevel,
            negativePrompt: props.negativePrompt,
          }),
        );
      });
  }, [props.prompt, props.hints, props.model, props.detail, props.negativePrompt]);

  if (!result) {
    return null;
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm">
      <p className="font-medium text-zinc-100">
        Prompt readiness: {result.score}/100 ({result.grade})
      </p>
      <ul className="mt-2 space-y-1 text-zinc-400">
        {result.checks.map((check) => (
          <li key={check.id}>
            {check.passed ? "✓" : "✗"} {check.label}
            {check.detail ? ` — ${check.detail}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
