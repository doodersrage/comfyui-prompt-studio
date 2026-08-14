import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MobileCaptureTool = dynamic(() => import('@/components/mobile/MobileCaptureTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading capture" />,
});

export default function MobileCapturePage() {
  return <MobileCaptureTool />;
}
