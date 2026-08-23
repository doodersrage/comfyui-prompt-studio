import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const DayPlannerTool = dynamic(() => import('@/components/DayPlannerTool'), {
  loading: () => <ToolPageSkeleton label="Loading day planner" />,
});

export default function DayPage() {
  return (
    <PageCanvas accent="teal">
      <DayPlannerTool />
    </PageCanvas>
  );
}
