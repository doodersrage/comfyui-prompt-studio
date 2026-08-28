'use client';

import { useGenerateToolOrchestrationCore } from '@/hooks/generate/useGenerateToolOrchestrationCore';
import { useGenerateToolOrchestrationPart2 } from '@/hooks/generate/useGenerateToolOrchestrationPart2';

export type {
  PromptMode,
  GenerateResponse,
} from '@/hooks/generate/generate-tool-orchestration-types';
export { EXAMPLE_INPUTS } from '@/hooks/generate/generate-tool-orchestration-types';

export function useGenerateToolOrchestration() {
  const core = useGenerateToolOrchestrationCore();
  const part2 = useGenerateToolOrchestrationPart2(core);
  return { ...core, ...part2 };
}
