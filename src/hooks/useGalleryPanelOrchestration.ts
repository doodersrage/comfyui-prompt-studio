'use client';

import { useGalleryPanelOrchestrationCore } from '@/hooks/gallery-panel/useGalleryPanelOrchestrationCore';
import { useGalleryPanelOrchestrationPart2 } from '@/hooks/gallery-panel/useGalleryPanelOrchestrationPart2';

export type { UseGalleryPanelOrchestrationOptions } from '@/hooks/gallery-panel/useGalleryPanelOrchestrationCore';
export type { UseGalleryPanelOrchestrationResult } from '@/hooks/gallery-panel/useGalleryPanelOrchestrationPart2';

export function useGalleryPanelOrchestration(
  options: import('@/hooks/gallery-panel/useGalleryPanelOrchestrationCore').UseGalleryPanelOrchestrationOptions
) {
  const core = useGalleryPanelOrchestrationCore(options);
  return useGalleryPanelOrchestrationPart2(core);
}
