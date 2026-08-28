'use client';

import { useCharacterToolOrchestration } from '@/hooks/useCharacterToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import CharacterToolSections from '@/components/character/CharacterToolSections';

export default function CharacterTool() {
  const description = useToolPageDescription(
    'Solo, duo, or character-with-background prompts. Add hints and generate.',
    'Character scenes — solo, duo, or with background. Add hints and generate.'
  );
  const vm = useCharacterToolOrchestration();

  return <CharacterToolSections description={description} {...vm} />;
}
