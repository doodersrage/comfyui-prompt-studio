'use client';

import { useComposeToolOrchestrationCore } from '@/hooks/compose/useComposeToolOrchestrationCore';
import { useComposeToolOrchestrationPart2 } from '@/hooks/compose/useComposeToolOrchestrationPart2';

export function useComposeToolOrchestration() {
  const core = useComposeToolOrchestrationCore();
  const part2 = useComposeToolOrchestrationPart2(core);
  return { ...core, ...part2 };
}
