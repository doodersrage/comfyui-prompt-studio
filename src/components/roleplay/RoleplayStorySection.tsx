'use client';

import type { ReactNode } from 'react';
import RoleplayFilmCutActions from '@/components/RoleplayFilmCutActions';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';
import type { RoleplayStoryBeat } from '@/lib/roleplay';

export type RoleplayStorySectionProps = {
  beatOutput: RoleplayBeatOutput;
  autoQueue: boolean;
  assemblingFilm: boolean;
  busy: boolean;
  story: RoleplayStoryBeat[];
  filmNeedsCast: boolean;
  filmCharacterId: string | null | undefined;
  filmStatus: string | null | undefined;
  downloadAction: ReactNode;
  onCutFilm: () => void;
  onSaveToCast: () => void;
  onQueue: (beat: RoleplayStoryBeat) => void;
  onRetry: (beat: RoleplayStoryBeat) => void;
  onRetryClip: (beat: RoleplayStoryBeat) => void;
  onAnimate: (beat: RoleplayStoryBeat) => void;
  onExtend: (beat: RoleplayStoryBeat) => void;
  onSelectTake: (beat: RoleplayStoryBeat, index: number) => void;
  onSelectClipTake: (beat: RoleplayStoryBeat, index: number) => void;
  onCopy: (beat: RoleplayStoryBeat) => void;
};

export default function RoleplayStorySection({
  beatOutput,
  autoQueue,
  assemblingFilm,
  busy,
  story,
  filmNeedsCast,
  filmCharacterId,
  filmStatus,
  downloadAction,
  onCutFilm,
  onSaveToCast,
  onQueue,
  onRetry,
  onRetryClip,
  onAnimate,
  onExtend,
  onSelectTake,
  onSelectClipTake,
  onCopy,
}: RoleplayStorySectionProps) {
  return (
    <ToolSection title="Story">
      <p className="text-sm text-[var(--text-muted)]">
        {beatOutput === 'clip'
          ? 'Clips land here as they render'
          : 'Stills land here as they render'}
        {autoQueue
          ? beatOutput === 'clip'
            ? ' — T2V from the beat prompt. From photo uses that photo as I2V. Continuity uses Extend clip, Continue from last frame, or Stitch continue (by engine)'
            : ' — queued automatically from the bio and each pick'
          : ''}
        .
      </p>
      <RoleplayFilmCutActions
        assemblingFilm={assemblingFilm}
        busy={busy}
        storyEmpty={story.length === 0}
        filmNeedsCast={filmNeedsCast}
        filmCharacterId={filmCharacterId}
        filmStatus={filmStatus}
        onCutFilm={onCutFilm}
        onSaveToCast={onSaveToCast}
      >
        {downloadAction}
      </RoleplayFilmCutActions>
      <RoleplayStoryReel
        story={story}
        busy={busy}
        onQueue={onQueue}
        onRetry={onRetry}
        onRetryClip={onRetryClip}
        onAnimate={onAnimate}
        onExtend={onExtend}
        onSelectTake={onSelectTake}
        onSelectClipTake={onSelectClipTake}
        onCopy={onCopy}
      />
    </ToolSection>
  );
}
