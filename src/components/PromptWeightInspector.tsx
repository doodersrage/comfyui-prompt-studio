"use client";

import { inspectPromptWeights } from "@/lib/prompt-weight-inspector";
import type { ComfyImageModel } from "@/lib/comfy-models";
import TagAssistToolbar from "@/components/TagAssistToolbar";

export default function PromptWeightInspector(props: {
  prompt: string;
  model: ComfyImageModel | string;
  onChange?: (value: string) => void;
  textareaId?: string;
}) {
  const inspection = inspectPromptWeights(props.prompt, props.model);

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-zinc-100">Token / weight inspector</p>
        <p className={`text-xs ${inspection.overLimit ? "text-amber-300" : "text-zinc-500"}`}>
          ~{inspection.estimatedTokens}/{inspection.tokenLimit} tokens
        </p>
      </div>

      {props.onChange ? (
        <TagAssistToolbar
          value={props.prompt}
          onChange={props.onChange}
          textareaId={props.textareaId}
        />
      ) : null}

      {inspection.weightedTokens.length > 0 ? (
        <ul className="space-y-1 text-xs text-zinc-400">
          {inspection.weightedTokens.map((token) => (
            <li key={token.raw}>
              {token.raw} → weight {token.weight}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">
          {inspection.supportsWeights
            ? "No explicit (tag:1.2) weights detected yet."
            : "Selected model uses natural-language prompts; weight syntax is mainly for SD-family tag models."}
        </p>
      )}

      {inspection.suggestions.length > 0 ? (
        <ul className="space-y-1 text-xs text-amber-200/90">
          {inspection.suggestions.map((suggestion) => (
            <li key={suggestion}>• {suggestion}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
