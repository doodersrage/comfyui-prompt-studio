import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const RoleplayTool = dynamic(() => import('@/components/RoleplayTool'), {
  loading: () => <ToolPageSkeleton label="Loading roleplay" />,
});

export default function RoleplayPage() {
  return (
    <PageCanvas accent="amber">
      <RoleplayTool />
    </PageCanvas>
  );
}
