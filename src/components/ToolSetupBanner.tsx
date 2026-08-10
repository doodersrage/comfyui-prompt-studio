'use client';

import dynamic from 'next/dynamic';

const SetupReadinessBanner = dynamic(() => import('@/components/SetupReadinessBanner'), {
  ssr: false,
  loading: () => null,
});

/** Setup banner with workspace-aware defer-until-queue defaults. */
export default function ToolSetupBanner({ toolLabel }: { toolLabel: string }) {
  return <SetupReadinessBanner toolLabel={toolLabel} />;
}
