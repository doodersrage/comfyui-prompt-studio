'use client';

import { Button } from '@/components/ui/Button';
import { ChipButton, FieldError } from '@/components/ui/Field';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';
import type { RoleplayScene, RoleplayStoryPhase } from '@/lib/roleplay';

const ACCENT = 'amber' as const;

export type RoleplayBeatOutputProgress = {
  phase: RoleplayStoryPhase;
  heading: string;
  hint: string;
  rollLabel: string;
  rerollLabel: string;
};

export type RoleplayBeatOutputSectionProps = {
  storyProgress: RoleplayBeatOutputProgress;
  beatOutput: RoleplayBeatOutput;
  autoQueue: boolean;
  busy: boolean;
  bioPresent: boolean;
  scenesLoading: boolean;
  scenes: RoleplayScene[];
  playingId: string | null;
  error: string | null;
  filmError: string | null | undefined;
  onRestartStory: () => void;
  onBeatOutputChange: (beatOutput: RoleplayBeatOutput) => void;
  onAutoQueueChange: (autoQueue: boolean) => void;
  onRollScenes: () => void;
  onPlayScene: (scene: RoleplayScene) => void;
};

export default function RoleplayBeatOutputSection({
  storyProgress,
  beatOutput,
  autoQueue,
  busy,
  bioPresent,
  scenesLoading,
  scenes,
  playingId,
  error,
  filmError,
  onRestartStory,
  onBeatOutputChange,
  onAutoQueueChange,
  onRollScenes,
  onPlayScene,
}: RoleplayBeatOutputSectionProps) {
  return (
    <ToolSection title={storyProgress.heading}>
      <p className="text-sm text-[var(--text-muted)]">{storyProgress.hint}</p>
      {storyProgress.phase === 'complete' ? (
        <Button variant="secondary" disabled={busy} onClick={onRestartStory}>
          Restart story
        </Button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <ChipButton
              active={beatOutput === 'still'}
              disabled={busy}
              onClick={() => onBeatOutputChange('still')}
            >
              Still
            </ChipButton>
            <ChipButton
              active={beatOutput === 'clip'}
              disabled={busy}
              onClick={() => onBeatOutputChange('clip')}
            >
              Clip
            </ChipButton>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={autoQueue}
              disabled={busy}
              onChange={event => onAutoQueueChange(event.target.checked)}
              className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass(ACCENT)}`}
            />
            <span>
              Queue a {beatOutput === 'clip' ? 'clip' : 'still'} when I write a bio or pick a scene
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                {beatOutput === 'clip'
                  ? 'Each scene queues a new clip from the beat prompt (T2V). From photo uses that photo as I2V, not the previous scene. Use Play another clip to reroll a take. Extend clip / Continue from last frame is the continuity action — Fal extend-video when the parent is already a public Fal URL, or after a successful Fal CDN upload of a local clip; otherwise last-frame I2V (Roleplay says so if the upload fails). Local WAN, Fal, or Replicate.'
                  : 'Uses the model and Fast/Good/Best from the sidebar. Turn off to write the prompt first.'}
              </span>
            </span>
          </label>
          <Button
            variant="secondary"
            loading={scenesLoading}
            loadingLabel="Rolling scenes"
            disabled={!bioPresent || busy}
            onClick={onRollScenes}
          >
            {scenes.length > 0 ? storyProgress.rerollLabel : storyProgress.rollLabel}
          </Button>
          {scenes.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {scenes.map(scene => (
                <button
                  key={scene.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onPlayScene(scene)}
                  className={`rounded-[var(--radius-lg)] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                    playingId === scene.id
                      ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {scene.title}
                  </span>
                  <span className="type-caption mt-1 block text-[var(--text-muted)]">
                    {scene.blurb}
                  </span>
                  {playingId === scene.id ? (
                    <span className="type-caption mt-2 block text-[var(--accent-text)]">
                      {beatOutput === 'clip'
                        ? scene.kind === 'ending'
                          ? 'Writing ending clip…'
                          : 'Writing clip…'
                        : scene.kind === 'ending'
                          ? 'Writing ending…'
                          : 'Writing still…'}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
      {error || filmError ? <FieldError>{error || filmError}</FieldError> : null}
    </ToolSection>
  );
}
