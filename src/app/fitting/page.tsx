import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const FittingRoomTool = dynamic(() => import('@/components/FittingRoomTool'), {
  loading: () => <ToolPageSkeleton label="Loading fitting room" />,
});

export default function FittingPage() {
  return (
    <PageCanvas accent="rose">
      <FittingRoomTool />
    </PageCanvas>
  );
}
