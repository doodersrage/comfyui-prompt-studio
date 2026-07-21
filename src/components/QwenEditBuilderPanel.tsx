"use client";

import type { ComfyImageModel } from "@/lib/comfy-models/client";
import {
  buildQwenEditPrompt,
  qwenEditTemplate,
  type QwenEditSegment,
} from "@/lib/qwen-edit-builder";
import { useMemo, useState } from "react";
import { FieldLabel, TextArea } from "@/components/ui/Field";

type QwenEditBuilderPanelProps = {
  model: ComfyImageModel | string;
  onApply: (prompt: string) => void;
};

export default function QwenEditBuilderPanel({
  model,
  onApply,
}: QwenEditBuilderPanelProps) {
  const [raw, setRaw] = useState(qwenEditTemplate());
  const segments = useMemo(() => {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(keep|replace|add|remove)\s*:\s*(.+)$/i);
        if (!match) {
          return { kind: "add" as const, text: line };
        }
        return {
          kind: match[1].toLowerCase() as QwenEditSegment["kind"],
          text: match[2].trim(),
        };
      });
  }, [raw]);

  const preview = useMemo(() => buildQwenEditPrompt(segments), [segments]);

  if (!String(model).includes("qwen") || !String(model).includes("edit")) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <FieldLabel
        htmlFor="qwen-edit-builder"
        hint="One segment per line: keep:, replace:, add:, remove:"
      >
        Qwen Edit instruction builder
      </FieldLabel>
      <TextArea
        id="qwen-edit-builder"
        rows={5}
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        className="font-mono text-xs"
      />
      {preview ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 text-xs text-zinc-300">
          {preview}
        </p>
      ) : null}
      <button
        type="button"
        className="rounded-lg border border-violet-700/50 bg-violet-950/40 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-900/40"
        onClick={() => onApply(preview)}
        disabled={!preview.trim()}
      >
        Apply edit prompt
      </button>
    </div>
  );
}
