'use client';

import CharacterOsPicker from '@/components/CharacterOsPicker';
import { ButtonLink } from '@/components/ui/Button';
import { ToolSection } from '@/components/ui/ToolPageShell';
import type { usePlayCampaignWizardOrchestration } from '@/hooks/usePlayCampaignWizardOrchestration';

type PlayCampaignCharacterSectionProps = Pick<
  ReturnType<typeof usePlayCampaignWizardOrchestration>,
  'shared' | 'updateShared' | 'character' | 'activeLookPack' | 'persistCharacter' | 'setStatus'
>;

export default function PlayCampaignCharacterSection({
  shared,
  updateShared,
  character,
  activeLookPack,
  persistCharacter,
  setStatus,
}: PlayCampaignCharacterSectionProps) {
  return (
    <ToolSection
      title="Character"
      description="The campaign stays tied to one Cast record."
      data-testid="play-campaign-character"
    >
      <CharacterOsPicker
        shared={shared}
        hints={character?.hints}
        onApply={patch => {
          try {
            updateShared(patch);
            if (patch.activeCharacterId) {
              persistCharacter(patch.activeCharacterId);
            }
          } catch (err) {
            setStatus(err instanceof Error ? err.message : 'Could not apply that character.');
          }
        }}
      />
      {character ? (
        <p className="type-caption mt-2 text-[var(--text-muted)]">
          Active: {character.name}
          {activeLookPack ? ' · look pack staged' : ''}
        </p>
      ) : (
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          data-testid="play-campaign-create-character"
        >
          <p className="type-caption text-[var(--text-muted)]">
            Pick a Cast character above, or create one before Moodboard.
          </p>
          <ButtonLink href="/characters" size="sm" variant="secondary">
            Open Cast
          </ButtonLink>
        </div>
      )}
    </ToolSection>
  );
}
