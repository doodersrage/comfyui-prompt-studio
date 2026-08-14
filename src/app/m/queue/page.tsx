'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MobileQueueTool = dynamic(() => import('@/components/mobile/MobileQueueTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading queue" />,
});

export default function MobileQueuePage() {
  return <MobileQueueTool />;
}
