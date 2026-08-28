'use client';

import { useStudioToolOrchestrationCore } from '@/hooks/studio/useStudioToolOrchestrationCore';
import { useStudioToolOrchestrationPart2 } from '@/hooks/studio/useStudioToolOrchestrationPart2';

export function useStudioToolOrchestration() {
  const core = useStudioToolOrchestrationCore();
  const part2 = useStudioToolOrchestrationPart2(core);
  return { ...core, ...part2 };
}
