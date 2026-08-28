'use client';

import { useControlNetToolOrchestrationCore } from '@/hooks/controlnet/useControlNetToolOrchestrationCore';
import { useControlNetToolOrchestrationPart2 } from '@/hooks/controlnet/useControlNetToolOrchestrationPart2';

export function useControlNetToolOrchestration() {
  const core = useControlNetToolOrchestrationCore();
  const part2 = useControlNetToolOrchestrationPart2(core);
  return { ...core, ...part2 };
}
