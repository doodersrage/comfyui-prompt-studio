'use client';

import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MobileMoodboardTool = dynamic(() => import('@/components/mobile/MobileMoodboardTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading moodboard" />,
});

export default function MobileMoodboardPage() {
  return <MobileMoodboardTool />;
}
