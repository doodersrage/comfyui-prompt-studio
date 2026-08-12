'use client';

import dynamic from 'next/dynamic';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { IterationTreeNode } from '@/lib/prompt-iteration-tree';
import type { BranchDiffResult } from '@/lib/iteration-branch-diff';
import { downloadIterationForestJson } from '@/lib/iteration-tree-export';
import { buildRegenerateUrl } from '@/lib/regenerate-url';
import { buildUseAsHintsUrl } from '@/lib/use-as-hints-url';
import {
  requeueComfyJobFromHistory,
  requeueRefineFromGalleryEntry,
  requeueUpscaleFromGalleryEntry,
} from '@/lib/comfyui-requeue';
import { findGalleryEntryForHistory } from '@/lib/prompt-lineage';
import { studioHistoryUrl } from '@/lib/prompt-lineage';
import {
  startRefineFromHistoryEntry,
  startPromptEditorFromHistoryEntry,
} from '@/lib/improve-output';
import { formatPromptVersionLabel } from '@/lib/prompt-versioning';
import { toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import {
  ToolBlockGroup,
  ToolContentPanel,
  ToolMetaPanel,
  ToolSection,
} from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { Button } from '@/components/ui/Button';
import { EmptyState, StudioTabSkeleton } from '@/components/ui/ViewState';

const PromptTimelinePanel = dynamic(() => import('@/components/studio/PromptTimelinePanel'), {
  loading: () => <StudioTabSkeleton />,
});

export type StudioIterationTabProps = {
  accent: ToolAccent;
  entries: PromptHistoryEntry[];
  iterationForest: IterationTreeNode[];
  iterationEntries: PromptHistoryEntry[];
  iterationDiffLeftId: string;
  iterationDiffRightId: string;
  iterationDiff: BranchDiffResult | null;
  highlightHistoryId: string | null;
  onIterationDiffLeftIdChange: (id: string) => void;
  onIterationDiffRightIdChange: (id: string) => void;
  onHighlightHistoryIdChange: (id: string | null) => void;
  onBackupStatusChange: (status: string) => void;
  onDiffWithParent: (parentId: string, childId: string) => void;
};

function IterationTreeNodeCard({
  node,
  depth,
  onRequeueStatus,
  onDiffWithParent,
}: {
  node: IterationTreeNode;
  depth: number;
  onRequeueStatus: (message: string) => void;
  onDiffWithParent?: (parentId: string) => void;
}) {
  const regenerateUrl = buildRegenerateUrl(node.entry);
  const useAsHintsUrl = buildUseAsHintsUrl(node.entry);
  const linkedGalleryEntry = findGalleryEntryForHistory(node.entry);
  const parentHistoryId =
    typeof node.entry.metadata?.parentHistoryId === 'string'
      ? node.entry.metadata.parentHistoryId
      : undefined;

  function queueUpscale(qualityProfile: 'final' | 'max') {
    if (!linkedGalleryEntry) {
      onRequeueStatus(
        'No linked gallery output — queue from Gallery first, then upscale from the iteration tree.'
      );
      return;
    }
    onRequeueStatus(`Upscaling linked gallery output (${qualityProfile})…`);
    void requeueUpscaleFromGalleryEntry(linkedGalleryEntry, {
      qualityProfile,
      onStatus: onRequeueStatus,
    }).then(result => {
      if (!result.ok) {
        onRequeueStatus(result.error ?? 'Upscale failed.');
        toastQueueOutcome({ ok: false, text: result.error ?? 'Upscale failed.' });
        return;
      }
      if (result.held) {
        const message = 'Max upscale held until ComfyUI queue is idle';
        onRequeueStatus(message);
        toastHeldMax({ text: message });
        return;
      }
      const message = result.promptId ? `Upscale queued · ${result.promptId}` : 'Upscale queued';
      onRequeueStatus(message);
      toastQueueOutcome({ ok: true, text: message });
    });
  }

  function queueRefine() {
    if (!linkedGalleryEntry) {
      onRequeueStatus(
        'No linked gallery output — open Gallery and use Refine on the completed output.'
      );
      return;
    }
    onRequeueStatus('Queueing low-denoise refine from linked gallery output…');
    void requeueRefineFromGalleryEntry(linkedGalleryEntry, {
      onStatus: onRequeueStatus,
    }).then(result => {
      if (!result.ok) {
        onRequeueStatus(result.error ?? 'Refine failed.');
        toastQueueOutcome({ ok: false, text: result.error ?? 'Refine failed.' });
        return;
      }
      if (result.held) {
        const message = 'Max refine held until ComfyUI queue is idle';
        onRequeueStatus(message);
        toastHeldMax({ text: message });
        return;
      }
      const message = result.promptId ? `Refine queued · ${result.promptId}` : 'Refine queued';
      onRequeueStatus(message);
      toastQueueOutcome({ ok: true, text: message });
    });
  }

  return (
    <div className="space-y-3" style={{ marginLeft: depth * 16 }}>
      <ToolContentPanel className="ui-block-group">
        <p className="type-caption text-[var(--text-muted)]">
          {formatPromptVersionLabel(node.entry.promptVersion) ? (
            <span className="mr-1.5 inline-flex items-center rounded-md border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--tint-info-text)]">
              {formatPromptVersionLabel(node.entry.promptVersion)}
            </span>
          ) : null}
          {node.entry.tool} · {node.entry.model} · {new Date(node.entry.timestamp).toLocaleString()}
        </p>
        <pre className="type-code max-h-32 overflow-auto whitespace-pre-wrap text-[var(--text-secondary)]">
          {node.entry.prompt}
        </pre>
        <div className="flex flex-wrap gap-2">
          <a href={regenerateUrl} className="type-caption ui-text-link">
            Regenerate
          </a>
          <a href={useAsHintsUrl} className="type-caption ui-text-link">
            Use as hints
          </a>
          <button
            type="button"
            onClick={() => startRefineFromHistoryEntry(node.entry)}
            className="type-caption ui-text-link"
          >
            Edit & refine prompt
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(node.entry.prompt).then(
                () => {
                  startPromptEditorFromHistoryEntry(node.entry);
                },
                () => {
                  startPromptEditorFromHistoryEntry(node.entry);
                }
              );
            }}
            className="type-caption ui-text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Restore as current
          </button>
          {linkedGalleryEntry ? (
            <>
              <button
                type="button"
                onClick={() => queueUpscale('final')}
                className="type-caption ui-text-link"
              >
                Upscale (Final)
              </button>
              <button
                type="button"
                onClick={() => queueUpscale('max')}
                className="type-caption ui-text-link"
              >
                Upscale (Max)
              </button>
              <button type="button" onClick={queueRefine} className="type-caption ui-text-link">
                Refine (low denoise)
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onRequeueStatus('Re-queueing from iteration tree…');
              void requeueComfyJobFromHistory(node.entry, {
                newSeed: true,
                onStatus: onRequeueStatus,
              }).then(result => {
                if (!result.ok) {
                  onRequeueStatus(result.error ?? 'Re-queue failed.');
                  toastQueueOutcome({ ok: false, text: result.error ?? 'Re-queue failed.' });
                  return;
                }
                if (result.held) {
                  const message = 'Max re-queue held until ComfyUI queue is idle';
                  onRequeueStatus(message);
                  toastHeldMax({ text: message });
                  return;
                }
                onRequeueStatus(
                  [
                    'queued from iteration tree',
                    result.promptId ? `prompt_id ${result.promptId}` : null,
                    'new variation · new seed',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                );
              });
            }}
            className="type-caption ui-text-link"
          >
            New variation (new seed)
          </button>
          {parentHistoryId && onDiffWithParent ? (
            <button
              type="button"
              onClick={() => onDiffWithParent(parentHistoryId)}
              className="type-caption text-amber-300 hover:text-amber-200"
            >
              Diff vs parent
            </button>
          ) : null}
          <a
            href={studioHistoryUrl(node.entry.id)}
            className="type-caption text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Open in history
          </a>
        </div>
      </ToolContentPanel>
      {node.children.map(child => (
        <IterationTreeNodeCard
          key={child.entry.id}
          node={child}
          depth={depth + 1}
          onRequeueStatus={onRequeueStatus}
          onDiffWithParent={onDiffWithParent}
        />
      ))}
    </div>
  );
}

export default function StudioIterationTab({
  entries,
  iterationForest,
  iterationEntries,
  iterationDiffLeftId,
  iterationDiffRightId,
  iterationDiff,
  highlightHistoryId,
  onIterationDiffLeftIdChange,
  onIterationDiffRightIdChange,
  onHighlightHistoryIdChange,
  onBackupStatusChange,
  onDiffWithParent,
}: StudioIterationTabProps) {
  return (
    <ToolSection title="Prompt iteration tree">
      <p className="text-sm text-[var(--text-secondary)]">
        Branches built from saved history entries linked by parent history ids.
      </p>
      {iterationForest.length > 0 ? (
        <div className="mb-4">
          <p className="type-caption mb-2 text-[var(--text-muted)]">Timeline</p>
          <PromptTimelinePanel
            nodes={iterationForest}
            selectedId={highlightHistoryId ?? undefined}
            onSelect={historyId => onHighlightHistoryIdChange(historyId)}
          />
        </div>
      ) : null}
      {iterationEntries.length >= 2 ? (
        <ToolMetaPanel title="Branch diff" className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[var(--text-secondary)]">
              Left (older)
              <select
                value={iterationDiffLeftId}
                onChange={event => onIterationDiffLeftIdChange(event.target.value)}
                className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="">Select entry…</option>
                {iterationEntries.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.tool} · {entry.prompt.slice(0, 48)}…
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-[var(--text-secondary)]">
              Right (newer)
              <select
                value={iterationDiffRightId}
                onChange={event => onIterationDiffRightIdChange(event.target.value)}
                className="ui-input block px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="">Select entry…</option>
                {iterationEntries.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.tool} · {entry.prompt.slice(0, 48)}…
                  </option>
                ))}
              </select>
            </label>
          </div>
          {iterationDiff ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="type-caption text-[var(--text-muted)]">
                {iterationDiff.diff.beforeChars} → {iterationDiff.diff.afterChars} chars
                {iterationDiff.diff.changed ? '' : ' · identical'}
              </p>
              <p className="whitespace-pre-wrap">
                {iterationDiff.diff.segments.map((segment, index) => (
                  <span
                    key={`${segment.type}-${index}`}
                    className={
                      segment.type === 'add'
                        ? 'ui-status-success'
                        : segment.type === 'remove'
                          ? 'ui-status-danger line-through'
                          : 'text-[var(--text-secondary)]'
                    }
                  >
                    {segment.text}{' '}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
        </ToolMetaPanel>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={iterationForest.length === 0}
          onClick={() => {
            downloadIterationForestJson(entries);
            onBackupStatusChange('Exported iteration tree JSON.');
          }}
        >
          Export iteration tree JSON
        </Button>
      </div>
      {iterationForest.length === 0 ? (
        <EmptyState
          branded
          icon="diff"
          title="No iteration branches yet"
          description="Save refined prompts to history with lineage to see parent/child trees here."
        />
      ) : (
        <ToolBlockGroup className="mt-[var(--block-gap)]">
          {iterationForest.map(node => (
            <IterationTreeNodeCard
              key={node.entry.id}
              node={node}
              depth={0}
              onRequeueStatus={onBackupStatusChange}
              onDiffWithParent={parentId => onDiffWithParent(parentId, node.entry.id)}
            />
          ))}
        </ToolBlockGroup>
      )}
    </ToolSection>
  );
}
