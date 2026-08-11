'use client';

import { useMemo, useState } from 'react';
import type { StorageNamespaceConflict, MergeChoice } from '@/lib/storage-merge';
import type { StorageNamespace } from '@/lib/storage-namespaces';
import { previewMergeChoices } from '@/lib/storage-merge-preview';
import { Button } from '@/components/ui/Button';

type Props = {
  conflicts: StorageNamespaceConflict[];
  initialChoices?: Partial<Record<StorageNamespace, MergeChoice>>;
  onResolve: (choices: Partial<Record<StorageNamespace, MergeChoice>>) => void;
  onDismiss: () => void;
};

export default function StorageSyncConflictModal({
  conflicts,
  initialChoices,
  onResolve,
  onDismiss,
}: Props) {
  const [choices, setChoices] = useState<Partial<Record<StorageNamespace, MergeChoice>>>(
    () => initialChoices ?? {}
  );
  const dryRun = useMemo(() => previewMergeChoices(conflicts, choices), [choices, conflicts]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-[var(--border-default)]/80 bg-[var(--bg-base)]/95 p-6 shadow-2xl">
        <div>
          <h2 className="type-heading text-[var(--text-primary)]">Storage sync conflict</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Browser and server data differ. Choose how to merge each namespace. Preview below is a
            dry-run from counts (no write yet).
          </p>
        </div>
        <ul className="space-y-3">
          {conflicts.map(conflict => (
            <li
              key={conflict.namespace}
              className="rounded-xl border border-[var(--border-subtle)] p-3"
            >
              <p className="text-sm font-medium text-[var(--text-primary)]">{conflict.namespace}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Local: {conflict.localCount ?? 0} · Server: {conflict.serverCount ?? 0}
                {conflict.detail ? ` · ${conflict.detail}` : ''}
              </p>
              {conflict.mapDiffKeys?.length ? (
                <div className="mt-1 space-y-1.5 text-xs text-amber-200/90">
                  <p>
                    Diverging maps: {conflict.mapDiffKeys.join(', ')}. Choose{' '}
                    <span className="font-medium">Keep local</span> /{' '}
                    <span className="font-medium">Prefer server</span>, or{' '}
                    <span className="font-medium">Merge</span> to union keys (local wins on
                    overlap).
                  </p>
                  {conflict.mapDiffSamples?.length ? (
                    <ul className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 font-mono text-[10px] text-amber-100/90">
                      {conflict.mapDiffSamples.map(sample => (
                        <li key={`${sample.mapKey}:${sample.entryKey}`}>
                          <span className="text-amber-200/70">{sample.mapKey}</span>.
                          {sample.entryKey}
                          <br />
                          local: {sample.localValue}
                          <br />
                          server: {sample.serverValue}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {(['local', 'server', 'merge'] as MergeChoice[]).map(choice => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() =>
                      setChoices(prev => ({
                        ...prev,
                        [conflict.namespace as StorageNamespace]: choice,
                      }))
                    }
                    className={`rounded-full px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                      choices[conflict.namespace as StorageNamespace] === choice
                        ? 'bg-[color-mix(in_oklab,var(--accent)_78%,#1a1028)] text-white'
                        : 'border border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--accent)]/40'
                    }`}
                  >
                    {choice === 'local'
                      ? 'Keep local'
                      : choice === 'server'
                        ? 'Prefer server'
                        : 'Merge / Diff union'}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {dryRun.length > 0 ? (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] p-3">
            <p className="text-xs font-medium text-[var(--text-secondary)]">Dry-run preview</p>
            <ul className="mt-2 space-y-1.5 text-xs text-[var(--text-muted)]">
              {dryRun.map(row => (
                <li key={row.namespace}>
                  <span className="text-[var(--text-secondary)]">{row.namespace}</span>
                  {' · '}
                  {row.summary}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => onResolve(choices)}
            disabled={conflicts.some(c => !choices[c.namespace as StorageNamespace])}
          >
            Apply merge
          </Button>
          <Button variant="ghost" onClick={onDismiss}>
            Decide later
          </Button>
        </div>
      </div>
    </div>
  );
}
