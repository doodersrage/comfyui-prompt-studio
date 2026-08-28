'use client';

import {
  useComfyWorkflowLibraryCore,
  type UseComfyWorkflowLibraryOptions,
} from '@/hooks/comfy-workflow/useComfyWorkflowLibraryCore';
import { useComfyWorkflowLibraryPart2 } from '@/hooks/comfy-workflow/useComfyWorkflowLibraryPart2';
import { useComfyWorkflowLibraryPart3 } from '@/hooks/comfy-workflow/useComfyWorkflowLibraryPart3';

export type { UseComfyWorkflowLibraryOptions };
export type ComfyWorkflowLibraryViewModel = ReturnType<typeof useComfyWorkflowLibrary>;

export function useComfyWorkflowLibrary(options: UseComfyWorkflowLibraryOptions) {
  const core = useComfyWorkflowLibraryCore(options);
  const part2 = useComfyWorkflowLibraryPart2(core);
  const part3 = useComfyWorkflowLibraryPart3({ ...core, ...part2 });
  return { ...core, ...part2, ...part3 };
}
