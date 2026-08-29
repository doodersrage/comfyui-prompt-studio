'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MobileDayTool = dynamic(() => import('@/components/mobile/MobileDayTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading day" />,
});

export default function MobileDayPage() {
  return <MobileDayTool />;
}
