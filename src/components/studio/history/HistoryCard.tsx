'use client';

import dynamic from 'next/dynamic';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { HistoryDensity } from '@/lib/history-density';
import { buildRegenerateUrl } from '@/lib/regenerate-url';
import { buildUseAsHintsUrl } from '@/lib/use-as-hints-url';
import { studioHistoryUrl } from '@/lib/prompt-lineage';
import { startPromptEditorFromHistoryEntry } from '@/lib/improve-output';
import { ToolContentPanel, ToolMetaPanel } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';

const PromptDiagnosticsPanel = dynamic(() => import('@/components/PromptDiagnosticsPanel'), {
  loading: () => null,
});

export type HistoryCardProps = {
  entry: PromptHistoryEntry;
  highlighted?: boolean;
  density?: HistoryDensity;
  onCopy: () => void;
  onToggleFavorite: () => void;
  onRate: (rating: PromptHistoryEntry['rating']) => void;
  onAddTag: (tag: string) => void;
  onExportSidecar: () => void;
  onRemove: () => void;
  onDiffLeft: () => void;
  onDiffRight: () => void;
  onSaveTemplate: () => void;
  onRequeue: (newSeed: boolean) => void;
  onUpscale?: (qualityProfile: 'final' | 'max') => void;
  onRefine?: () => void;
  onOpenLinkedEdit?: (
    target:
      | 'refine'
      | 'inpaint'
      | 'outpaint'
      | 'compose'
      | 'video'
      | 'controlnet'
      | 'background'
      | 'imagePrompt'
  ) => void;
  onRequeueBatch?: () => void;
  batchPromptCount?: number;
  onPreview?: () => void;
};

function readHistoryBatchPrompts(entry: PromptHistoryEntry): string[] {
  const raw = entry.metadata?.batchPrompts;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export default function HistoryCard({
  entry,
  highlighted,
  density = 'comfortable',
  onCopy,
  onToggleFavorite,
  onRate,
  onAddTag,
  onExportSidecar,
  onRemove,
  onDiffLeft,
  onDiffRight,
  onSaveTemplate,
  onRequeue,
  onUpscale,
  onRefine,
  onOpenLinkedEdit,
  onRequeueBatch,
  batchPromptCount = 0,
  onPreview,
}: {
  entry: PromptHistoryEntry;
  highlighted?: boolean;
  density?: HistoryDensity;
  onCopy: () => void;
  onToggleFavorite: () => void;
  onRate: (rating: PromptHistoryEntry['rating']) => void;
  onAddTag: (tag: string) => void;
  onExportSidecar: () => void;
  onRemove: () => void;
  onDiffLeft: () => void;
  onDiffRight: () => void;
  onSaveTemplate: () => void;
  onRequeue: (newSeed: boolean) => void;
  onUpscale?: (qualityProfile: 'final' | 'max') => void;
  onRefine?: () => void;
  /** Open linked gallery output in an edit/media tool. */
  onOpenLinkedEdit?: (
    target:
      | 'refine'
      | 'inpaint'
      | 'outpaint'
      | 'compose'
      | 'video'
      | 'controlnet'
      | 'background'
      | 'imagePrompt'
  ) => void;
  onRequeueBatch?: () => void;
  batchPromptCount?: number;
  onPreview?: () => void;
}) {
  const regenerateUrl = buildRegenerateUrl(entry);
  const useAsHintsUrl = buildUseAsHintsUrl(entry);
  const showHintDiff =
    entry.hints?.trim() &&
    entry.prompt.trim() &&
    !entry.prompt.toLowerCase().includes(entry.hints.trim().slice(0, 40).toLowerCase());
  const compact = density === 'compact';

  return (
    <ToolContentPanel
      className={`ui-block-group min-w-0 ${highlighted ? 'ring-2 ring-[var(--accent-ring)]' : ''} ${
        compact ? '!gap-2' : ''
      }`}
    >
      <pre
        className={`type-code overflow-auto whitespace-pre-wrap border border-[var(--border-subtle)] bg-[var(--bg-muted)] !text-[var(--tint-success-text)] ${
          compact ? 'max-h-28 p-3 text-xs' : 'max-h-56 p-5'
        }`}
      >
        {entry.prompt}
      </pre>

      <ToolMetaPanel>
        <div className={`flex min-w-0 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
          <p className="type-caption min-w-0 break-words text-[var(--text-muted)]">
            {entry.tool} · {entry.model} · {new Date(entry.timestamp).toLocaleString()}
          </p>
          <div className={`ui-list-actions w-full justify-start ${compact ? 'gap-1.5' : ''}`}>
            <a href={regenerateUrl} className="ui-btn-ghost ui-btn-sm type-caption">
              Regenerate
            </a>
            <a href={useAsHintsUrl} className="ui-btn-ghost ui-btn-sm type-caption">
              Use as hints
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="type-caption"
              onClick={() => startPromptEditorFromHistoryEntry(entry)}
            >
              Edit prompt
            </Button>
            <a href={studioHistoryUrl(entry.id)} className="ui-btn-ghost ui-btn-sm type-caption">
              Link
            </a>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onToggleFavorite}>
              {entry.favorite ? '★' : '☆'}
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onCopy}>
              Copy
            </Button>
            {onPreview ? (
              <Button variant="ghost" size="sm" className="type-caption" onClick={onPreview}>
                Preview
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="type-caption" onClick={onExportSidecar}>
              Sidecar
            </Button>
            <Button
              variant="accent-outline"
              size="sm"
              className="type-caption"
              onClick={() => onRequeue(false)}
            >
              Re-queue
            </Button>
            <Button
              variant="accent-outline"
              size="sm"
              className="type-caption"
              onClick={() => onRequeue(true)}
            >
              New variation (new seed)
            </Button>
            {onUpscale ? (
              <>
                <Button
                  variant="accent-outline"
                  size="sm"
                  className="type-caption"
                  onClick={() => onUpscale('final')}
                >
                  Upscale (Final)
                </Button>
                <Button
                  variant="accent-outline"
                  size="sm"
                  className="type-caption"
                  onClick={() => onUpscale('max')}
                >
                  Upscale (Max)
                </Button>
              </>
            ) : null}
            {onRefine ? (
              <Button
                variant="accent-outline"
                size="sm"
                className="type-caption"
                onClick={onRefine}
              >
                Refine (low denoise)
              </Button>
            ) : null}
            {onOpenLinkedEdit ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => onOpenLinkedEdit('refine')}
                >
                  Open Refine
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => onOpenLinkedEdit('inpaint')}
                >
                  Open Inpaint
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => onOpenLinkedEdit('outpaint')}
                >
                  Open Outpaint
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => onOpenLinkedEdit('compose')}
                >
                  Open Compose
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => onOpenLinkedEdit('video')}
                >
                  Open Video
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => onOpenLinkedEdit('controlnet')}
                >
                  Open ControlNet
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => onOpenLinkedEdit('background')}
                >
                  Open Background
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="type-caption"
                  onClick={() => onOpenLinkedEdit('imagePrompt')}
                >
                  Open Image → Prompt
                </Button>
              </>
            ) : null}
            {batchPromptCount > 1 && onRequeueBatch ? (
              <Button
                variant="accent-outline"
                size="sm"
                className="type-caption"
                onClick={onRequeueBatch}
              >
                Re-queue batch ({batchPromptCount})
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="type-caption"
              onClick={() => {
                const tag = window.prompt('Add tag');
                if (tag?.trim()) {
                  onAddTag(tag.trim());
                }
              }}
            >
              Tag
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onDiffLeft}>
              Diff A
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onDiffRight}>
              Diff B
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onSaveTemplate}>
              Template
            </Button>
            <Button variant="danger" size="sm" className="type-caption" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>

        {entry.hints?.trim() && (
          <p className="type-caption ui-truncate-2">
            Hints: <span className="text-[var(--text-secondary)]">{entry.hints}</span>
          </p>
        )}

        {(entry.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {entry.tags!.map(tag => (
              <span
                key={tag}
                className="type-overline rounded-[var(--radius-full)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2.5 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {showHintDiff && (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Prompt expanded beyond the saved hints — use Regenerate to roll again with the same
            inputs.
          </p>
        )}

        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onRate(value as PromptHistoryEntry['rating'])}
              className={`ui-chip !min-h-8 !min-w-8 justify-center px-0 ${
                entry.rating === value ? '' : ''
              }`}
              data-active={entry.rating === value ? 'true' : 'false'}
            >
              {value}
            </button>
          ))}
        </div>

        {entry.diagnostics && <PromptDiagnosticsPanel diagnostics={entry.diagnostics} />}
      </ToolMetaPanel>
    </ToolContentPanel>
  );
}
