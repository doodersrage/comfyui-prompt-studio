'use client';

import { useCharacterHomeOrchestration } from '@/hooks/useCharacterHomeOrchestration';
import CharacterHomeSections from '@/components/character/CharacterHomeSections';

type CharacterHomeProps = {
  characterId: string;
};

export default function CharacterHome({ characterId }: CharacterHomeProps) {
  const vm = useCharacterHomeOrchestration(characterId);

  return <CharacterHomeSections {...vm} />;
}
