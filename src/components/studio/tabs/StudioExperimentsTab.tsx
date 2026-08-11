'use client';

import dynamic from 'next/dynamic';
import { StudioTabSkeleton } from '@/components/ui/ViewState';

const ExperimentDashboardPanel = dynamic(() => import('@/components/ExperimentDashboardPanel'), {
  loading: () => <StudioTabSkeleton />,
});
const DuplicatePromptsPanel = dynamic(() => import('@/components/studio/DuplicatePromptsPanel'), {
  loading: () => <StudioTabSkeleton />,
});
const StyleTransplantPanel = dynamic(() => import('@/components/studio/StyleTransplantPanel'), {
  loading: () => <StudioTabSkeleton />,
});

export default function StudioExperimentsTab() {
  return (
    <div className="ui-section-stack">
      <ExperimentDashboardPanel />
      <DuplicatePromptsPanel />
      <StyleTransplantPanel />
    </div>
  );
}
