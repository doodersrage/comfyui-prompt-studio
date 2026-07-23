"use client";

import { ToolSection } from "@/components/ui/ToolPageShell";
import { Button } from "@/components/ui/Button";
import { MonoTextArea } from "@/components/ui/Field";

type PromptResultPanelProps = {
  output: string;
  provider: "llm" | "template" | "rules" | null;
  comfyNode?: string;
  limits?: {
    minChars?: number;
    maxChars: number;
  };
  copied: boolean;
  onCopy: () => void;
  extraMeta?: string;
  /** When set, the generated prompt is editable (queues/copy use the edited text). */
  onOutputChange?: (value: string) => void;
};

export default function PromptResultPanel({
  output,
  provider,
  comfyNode,
  limits,
  copied,
  onCopy,
  extraMeta,
  onOutputChange,
}: PromptResultPanelProps) {
  if (!output && !onOutputChange) {
    return null;
  }

  return (
    <ToolSection>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="type-heading">Generated prompt</h2>
          {(provider || onOutputChange) && (
            <p className="type-caption mt-1">
              {provider
                ? `via ${provider === "llm" ? "LLM" : provider === "rules" ? "rules" : "template"}`
                : null}
              {provider && limits
                ? ` · ${limits.minChars ? `${limits.minChars}–` : ""}${limits.maxChars} char limit`
                : null}
              {` · ${output.length} chars`}
              {onOutputChange ? " · editable" : ""}
              {extraMeta ? ` · ${extraMeta}` : ""}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={onCopy} disabled={!output.trim()}>
          {copied ? "Copied!" : "Copy for ComfyUI"}
        </Button>
      </div>

      {onOutputChange ? (
        <MonoTextArea
          id="generated-prompt-editor"
          value={output}
          onChange={(event) => onOutputChange(event.target.value)}
          rows={Math.min(18, Math.max(6, output.split("\n").length + 2))}
          spellCheck={false}
          className="mt-1 !text-[var(--tint-success-text)]"
          aria-label="Generated prompt"
        />
      ) : (
        <pre className="type-code overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-5 !text-[var(--tint-success-text)]">
          {output}
        </pre>
      )}

      {comfyNode && (
        <p className="type-caption">
          Paste into <code className="type-code">{comfyNode}</code>
        </p>
      )}
    </ToolSection>
  );
}
