'use client';

import { useMoodboardToolOrchestrationCore } from '@/hooks/moodboard/useMoodboardToolOrchestrationCore';
import { useMoodboardToolOrchestrationPart2 } from '@/hooks/moodboard/useMoodboardToolOrchestrationPart2';

export function useMoodboardToolOrchestration() {
  const core = useMoodboardToolOrchestrationCore();
  const part2 = useMoodboardToolOrchestrationPart2(core);
  return { ...core, ...part2 };
}
