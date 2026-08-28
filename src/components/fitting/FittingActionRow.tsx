'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import type { CharacterRecord } from '@/lib/character-os';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';

export type FittingActionRowProps = {
  continueDayHref: string | null;
  dayPlannerHref: string;
  queueBlocked: boolean;
  swipeDeckLength: number;
  busy: boolean;
  character: CharacterRecord | undefined;
  onSkipKit: () => void;
  onQueueTryOn: () => void;
  onQueueTryOnAndSwipe: () => void;
  onSaveKitToCast: () => void;
  onGoRoleplay: () => void;
};

export default function FittingActionRow({
  continueDayHref,
  dayPlannerHref,
  queueBlocked,
  swipeDeckLength,
  busy,
  character,
  onSkipKit,
  onQueueTryOn,
  onQueueTryOnAndSwipe,
  onSaveKitToCast,
  onGoRoleplay,
}: FittingActionRowProps) {
  return (
    <ToolActionRow>
      {continueDayHref ? (
        <ButtonLink
          href={continueDayHref}
          size="sm"
          variant="primary"
          data-testid="fitting-continue-day"
        >
          Continue in Day
        </ButtonLink>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={queueBlocked || swipeDeckLength < 2}
        onClick={onSkipKit}
      >
        Skip kit
      </Button>
      <Button size="sm" variant="primary" disabled={queueBlocked} onClick={onQueueTryOn}>
        {busy ? 'Queueing…' : 'Queue try-on'}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={queueBlocked || swipeDeckLength < 2}
        onClick={onQueueTryOnAndSwipe}
      >
        Queue & next
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={onSaveKitToCast}>
        Save kit to Cast
      </Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={onGoRoleplay}>
        Continue in Roleplay
      </Button>
      {character ? (
        <>
          {!continueDayHref ? (
            <ButtonLink
              href={dayPlannerHref}
              size="sm"
              variant="secondary"
              data-testid="fitting-plan-day"
              onClick={() => {
                bumpPlayCampaignStep({ characterId: character.id, stepId: 'day' });
              }}
            >
              Plan a day
            </ButtonLink>
          ) : null}
          <ButtonLink
            href={`/moodboard?character=${encodeURIComponent(character.id)}`}
            size="sm"
            variant="secondary"
          >
            Set look (Moodboard)
          </ButtonLink>
          <ButtonLink
            href={`/gallery?character=${encodeURIComponent(character.id)}`}
            size="sm"
            variant="ghost"
          >
            Open in Gallery
          </ButtonLink>
        </>
      ) : null}
    </ToolActionRow>
  );
}
