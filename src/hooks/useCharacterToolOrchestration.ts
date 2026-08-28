'use client';

import { useCharacterToolOrchestrationCore } from '@/hooks/character/useCharacterToolOrchestrationCore';
import { useCharacterToolOrchestrationPart2 } from '@/hooks/character/useCharacterToolOrchestrationPart2';

export {
  CHARACTER_SCENE_MODE_OPTIONS,
  accentForSceneMode,
  presetVariantForSceneMode,
} from '@/hooks/character/useCharacterToolOrchestrationCore';

export function useCharacterToolOrchestration() {
  const core = useCharacterToolOrchestrationCore();
  const part2 = useCharacterToolOrchestrationPart2(core);
  return { ...core, ...part2 };
}
