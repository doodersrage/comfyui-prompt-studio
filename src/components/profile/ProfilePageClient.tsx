'use client';

import dynamic from 'next/dynamic';
import { useProfilePageDescription } from '@/hooks/useToolPageDescription';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const ProfilePanel = dynamic(() => import('@/components/profile/ProfilePanel'), {
  loading: () => <ToolPageSkeleton label="Loading profile" />,
});

const ACCENT = 'violet' as const;

export default function ProfilePageClient() {
  const description = useProfilePageDescription();

  return (
    <ToolLayout
      accent={ACCENT}
      width="default"
      badge={<ToolBadge accent={ACCENT}>Account</ToolBadge>}
      title="Profile"
      description={description}
    >
      <ProfilePanel />
    </ToolLayout>
  );
}
