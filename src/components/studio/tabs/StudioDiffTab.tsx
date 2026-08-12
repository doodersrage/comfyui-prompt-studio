'use client';

import dynamic from 'next/dynamic';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { StudioTabId } from '@/lib/studio-nav';
import { ToolContentPanel, ToolMetaPanel, ToolSection } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';
import { EmptyState, StudioTabSkeleton } from '@/components/ui/ViewState';
import type { PromptDiffSummary } from '@/lib/prompt-diff';

const PromptMergePanel = dynamic(() => import('@/components/PromptMergePanel'), {
  loading: () => <StudioTabSkeleton />,
});

export type StudioDiffTabProps = {
  entries: PromptHistoryEntry[];
  diffLeftId: string;
  diffRightId: string;
  onDiffLeftIdChange: (id: string) => void;
  onDiffRightIdChange: (id: string) => void;
  diffLeft: PromptHistoryEntry | null;
  diffRight: PromptHistoryEntry | null;
  promptDiff: PromptDiffSummary | null;
  onSelectTab: (tab: StudioTabId) => void;
};

export default function StudioDiffTab({
  entries,
  diffLeftId,
  diffRightId,
  onDiffLeftIdChange,
  onDiffRightIdChange,
  diffLeft,
  diffRight,
  promptDiff,
  onSelectTab,
}: StudioDiffTabProps) {
  return (
    <ToolSection title="Prompt diff">
      {entries.length === 0 ? (
        <EmptyState
          branded
          icon="diff"
          title="Save prompts before diffing"
          description="Diff compares two history entries word-by-word. Generate prompts elsewhere, save them to history, then pick left and right entries here."
          action={{ label: 'Open Character', href: '/character?mode=duo' }}
        />
      ) : (
        <>
          <ToolMetaPanel>
            <p className="type-body">
              Compare two saved prompts word-by-word. Pick entries from history or use the Diff A /
              Diff B buttons on history cards.
            </p>
          </ToolMetaPanel>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel htmlFor="diff-left">Left (before)</FieldLabel>
              <select
                id="diff-left"
                value={diffLeftId}
                onChange={event => onDiffLeftIdChange(event.target.value)}
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="">Select entry…</option>
                {entries.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.tool} · {entry.prompt.slice(0, 48)}…
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="diff-right">Right (after)</FieldLabel>
              <select
                id="diff-right"
                value={diffRightId}
                onChange={event => onDiffRightIdChange(event.target.value)}
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="">Select entry…</option>
                {entries.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.tool} · {entry.prompt.slice(0, 48)}…
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!promptDiff ? (
            <EmptyState
              compact
              icon="diff"
              title="Select two history entries"
              description="Choose a left and right prompt above to preview additions, removals, and unchanged text."
              action={{
                label: 'Browse history',
                onClick: () => onSelectTab('history'),
              }}
            />
          ) : (
            <>
              <p className="type-caption">
                {promptDiff.beforeChars} → {promptDiff.afterChars} chars
                {promptDiff.changed ? '' : ' · identical'}
              </p>
              <ToolContentPanel className="type-body-lg leading-relaxed">
                {promptDiff.segments.map((segment, index) => (
                  <span
                    key={`${index}-${segment.type}-${segment.text.slice(0, 12)}`}
                    className={
                      segment.type === 'remove'
                        ? 'bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)] line-through'
                        : segment.type === 'add'
                          ? 'bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]'
                          : 'text-[var(--text-secondary)]'
                    }
                  >
                    {segment.text}{' '}
                  </span>
                ))}
              </ToolContentPanel>
              <div className="grid gap-[var(--group-gap)] sm:grid-cols-2">
                <ToolContentPanel>
                  <pre className="type-code max-h-72 overflow-auto whitespace-pre-wrap !bg-transparent !p-0 !text-[var(--text-secondary)]">
                    {diffLeft?.prompt}
                  </pre>
                </ToolContentPanel>
                <ToolContentPanel>
                  <pre className="type-code max-h-72 overflow-auto whitespace-pre-wrap !bg-transparent !p-0 !text-[var(--tint-success-text)]">
                    {diffRight?.prompt}
                  </pre>
                </ToolContentPanel>
              </div>
              <PromptMergePanel leftDefault={diffLeft?.prompt} rightDefault={diffRight?.prompt} />
            </>
          )}
        </>
      )}
    </ToolSection>
  );
}
