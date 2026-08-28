'use client';

import type { useStudioToolOrchestration } from '@/hooks/useStudioToolOrchestration';
import { StudioToolHistoryPanels } from '@/components/studio/sections/StudioToolHistoryPanels';
import { StudioToolWorkspacePanels } from '@/components/studio/sections/StudioToolWorkspacePanels';

type StudioToolViewModel = ReturnType<typeof useStudioToolOrchestration>;

export function StudioToolTabPanels(vm: StudioToolViewModel) {
  return (
    <>
      <StudioToolHistoryPanels {...vm} />
      <StudioToolWorkspacePanels {...vm} />
    </>
  );
}
