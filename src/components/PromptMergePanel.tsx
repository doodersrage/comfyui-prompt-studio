"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/Field";

export default function PromptMergePanel(props: {
  leftDefault?: string;
  rightDefault?: string;
}) {
  const [left, setLeft] = useState(props.leftDefault ?? "");
  const [right, setRight] = useState(props.rightDefault ?? "");
  const [merged, setMerged] = useState("");
  const [lintErrors, setLintErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function merge() {
    setLoading(true);
    try {
      const response = await fetch("/api/prompt/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left, right }),
      });
      const data = (await response.json()) as {
        merged?: string;
        lintErrors?: string[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Merge failed.");
      }
      setMerged(data.merged ?? "");
      setLintErrors(data.lintErrors ?? []);
    } catch (error) {
      setMerged(error instanceof Error ? error.message : "Merge failed.");
      setLintErrors([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
      <p className="text-sm font-medium text-zinc-200">Cherry-pick merge</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="merge-left">Left prompt</FieldLabel>
          <textarea
            id="merge-left"
            value={left}
            onChange={(event) => setLeft(event.target.value)}
            rows={4}
            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </div>
        <div>
          <FieldLabel htmlFor="merge-right">Right prompt</FieldLabel>
          <textarea
            id="merge-right"
            value={right}
            onChange={(event) => setRight(event.target.value)}
            rows={4}
            className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
          />
        </div>
      </div>
      <Button variant="secondary" loading={loading} onClick={() => void merge()}>
        Merge prompts
      </Button>
      {merged ? (
        <pre className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-200">
          {merged}
        </pre>
      ) : null}
      {lintErrors.length > 0 ? (
        <ul className="text-xs text-amber-400">
          {lintErrors.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
