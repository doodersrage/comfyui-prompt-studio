import Link from "next/link";
import { ToolContentPanel } from "@/components/ui/ToolPageShell";
import { Button } from "@/components/ui/Button";

export type BatchPromptCrossLinks = {
  hintsForDuo?: string;
  hintsForCharacter?: string;
};

export function BatchPromptCard({
  index,
  prompt,
  crossLinks,
  copied = false,
  historySaved = false,
  pairCopied = false,
  onCopy,
  onQueueComfyUi,
  onSaveHistory,
  onCopyPair,
  onExportSidecar,
}: {
  index: number;
  prompt: string;
  crossLinks?: BatchPromptCrossLinks;
  copied?: boolean;
  historySaved?: boolean;
  pairCopied?: boolean;
  onCopy: () => void;
  onQueueComfyUi?: () => void;
  onSaveHistory?: () => void;
  onCopyPair?: () => void;
  onExportSidecar?: () => void;
}) {
  const duoHints = crossLinks?.hintsForDuo?.trim();
  const characterHints = crossLinks?.hintsForCharacter?.trim();

  return (
    <ToolContentPanel className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="type-overline text-[var(--text-muted)]">
          Prompt {String(index + 1).padStart(2, "0")}
        </p>
        <Button variant="ghost" className="!min-h-9 px-3 type-caption" onClick={onCopy}>
          {copied ? "Copied!" : "Copy prompt"}
        </Button>
      </div>

      <pre className="type-code max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-4 !text-[var(--tint-success-text)]">
        {prompt}
      </pre>

      <div className="flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/?input=${encodeURIComponent(prompt)}`}
            className="ui-btn-ghost !min-h-9 px-4 type-caption"
          >
            Generate
          </Link>
          {duoHints ? (
            <Link
              href={`/character?mode=duo&hints=${encodeURIComponent(duoHints)}`}
              className="ui-btn-ghost !min-h-9 px-4 type-caption"
            >
              Duo
            </Link>
          ) : null}
          {characterHints ? (
            <Link
              href={`/character?hints=${encodeURIComponent(characterHints)}`}
              className="ui-btn-ghost !min-h-9 px-4 type-caption"
            >
              Character
            </Link>
          ) : null}
        </div>

        {(onQueueComfyUi || onSaveHistory || onCopyPair || onExportSidecar) && (
          <div className="flex flex-wrap gap-2">
            {onQueueComfyUi ? (
              <Button
                variant="accent-outline"
                className="!min-h-9 px-4 type-caption"
                onClick={onQueueComfyUi}
              >
                Queue generate
              </Button>
            ) : null}
            {onSaveHistory ? (
              <Button
                variant="secondary"
                className="!min-h-9 px-4 type-caption"
                onClick={onSaveHistory}
              >
                {historySaved ? "Saved!" : "Save to history"}
              </Button>
            ) : null}
            {onCopyPair ? (
              <Button
                variant="secondary"
                className="!min-h-9 px-4 type-caption"
                onClick={onCopyPair}
              >
                {pairCopied ? "Pair copied!" : "Copy pair"}
              </Button>
            ) : null}
            {onExportSidecar ? (
              <Button
                variant="ghost"
                className="!min-h-9 px-4 type-caption"
                onClick={onExportSidecar}
              >
                Export sidecar
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </ToolContentPanel>
  );
}
