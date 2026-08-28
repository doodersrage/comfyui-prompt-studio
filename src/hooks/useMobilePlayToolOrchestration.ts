'use client';

import { useMobilePlayToolOrchestrationCore } from '@/hooks/mobile-play/useMobilePlayToolOrchestrationCore';
import { useMobilePlayToolOrchestrationPart2 } from '@/hooks/mobile-play/useMobilePlayToolOrchestrationPart2';

export function useMobilePlayToolOrchestration() {
  const core = useMobilePlayToolOrchestrationCore();
  const part2 = useMobilePlayToolOrchestrationPart2(core);
  return { ...core, ...part2 };
}
