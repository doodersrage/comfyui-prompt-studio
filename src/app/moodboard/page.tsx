import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MoodboardTool = dynamic(() => import('@/components/MoodboardTool'), {
  loading: () => <ToolPageSkeleton label="Loading moodboard" />,
});

export default function MoodboardPage() {
  return (
    <PageCanvas accent="cyan">
      <MoodboardTool />
    </PageCanvas>
  );
}
