'use client';

export type {
  UseSharedToolModelWorkflowOptions,
  UseSharedToolModelWorkflowResult,
} from '@/hooks/shared-tool/useSharedToolModelWorkflowCore';
import type {
  UseSharedToolModelWorkflowOptions,
  UseSharedToolModelWorkflowResult,
} from '@/hooks/shared-tool/useSharedToolModelWorkflowCore';
import { useSharedToolModelWorkflowCore } from '@/hooks/shared-tool/useSharedToolModelWorkflowCore';
import { useSharedToolModelWorkflowPart2 } from '@/hooks/shared-tool/useSharedToolModelWorkflowPart2';

export function useSharedToolModelWorkflow(
  options: UseSharedToolModelWorkflowOptions
): UseSharedToolModelWorkflowResult {
  const core = useSharedToolModelWorkflowCore(options);
  const part2 = useSharedToolModelWorkflowPart2(core);
  return { ...core, ...part2 };
}
