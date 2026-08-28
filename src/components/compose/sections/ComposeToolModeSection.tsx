'use client';

import { FieldLabel } from '@/components/ui/Field';

type Props = {
  mode: 'transfer' | 'modify';
  setMode: (mode: 'transfer' | 'modify') => void;
  showPoseUnlockHint: boolean;
  booguEditModel: boolean;
  identityLock: boolean;
};

export function ComposeToolModeSection({
  mode,
  setMode,
  showPoseUnlockHint,
  booguEditModel,
  identityLock,
}: Props) {
  return (
    <>
      <FieldLabel>Mode</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'transfer' as const, label: 'Transfer', hint: '≥2 images' },
            { id: 'modify' as const, label: 'Modify', hint: 'Image 1 only' },
          ] as const
        ).map(entry => {
          const active = mode === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMode(entry.id)}
              className={[
                'rounded-xl border px-3.5 py-2 text-sm transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                active
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/60 hover:text-[var(--text-primary)]',
              ].join(' ')}
            >
              <span className="font-medium">{entry.label}</span>
              <span className="ml-2 text-xs opacity-70">{entry.hint}</span>
            </button>
          );
        })}
      </div>

      {showPoseUnlockHint ? (
        <div className="rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3.5 py-3 text-xs leading-relaxed text-[var(--tint-warning-text)]">
          <p className="font-medium text-[var(--tint-warning-text)]/95">
            {booguEditModel ? 'Boogu Edit' : 'Qwen Edit'} locks Image 1 pose
          </p>
          <p className="mt-1.5 text-[var(--tint-warning-text)]/80">
            ReferenceLatent + vision encoding anchor Image 1&apos;s body pose and framing — denoise
            1 is correct and won&apos;t unlock a sitting subject by itself.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-[var(--tint-warning-text)]/75">
            <li>
              <strong className="font-medium text-[var(--tint-warning-text)]/90">
                Pose changes:
              </strong>{' '}
              use <strong className="font-medium">Transfer</strong> — Image 1 = face, Image 2 =
              standing/action reference photo.
            </li>
            <li>
              <strong className="font-medium text-[var(--tint-warning-text)]/90">Modify</strong>{' '}
              works best for relight, wardrobe, and background swaps on the existing pose.
            </li>
            {identityLock ? (
              <li>
                Turn off <strong className="font-medium">identity lock</strong> if enabled — it adds
                extra appearance anchoring.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </>
  );
}
