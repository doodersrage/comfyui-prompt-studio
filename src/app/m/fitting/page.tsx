'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MobileFittingTool = dynamic(() => import('@/components/mobile/MobileFittingTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading fitting" />,
});

export default function MobileFittingPage() {
  return <MobileFittingTool />;
}
