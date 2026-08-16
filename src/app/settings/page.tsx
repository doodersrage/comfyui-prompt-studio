import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const SettingsTool = dynamic(() => import('@/components/SettingsTool'), {
  loading: () => <ToolPageSkeleton label="Loading settings" />,
});

export default function SettingsPage() {
  return (
    <PageCanvas accent="neutral">
      <Suspense fallback={<ToolPageSkeleton label="Loading settings" />}>
        <SettingsTool />
      </Suspense>
    </PageCanvas>
  );
}
