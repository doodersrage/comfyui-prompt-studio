import dynamic from 'next/dynamic';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const ProfilePanel = dynamic(() => import('@/components/profile/ProfilePanel'), {
  loading: () => <ToolPageSkeleton label="Loading profile" />,
});

const ACCENT = 'violet' as const;

export default function ProfilePage() {
  return (
    <ToolLayout
      accent={ACCENT}
      width="default"
      badge={<ToolBadge accent={ACCENT}>Account</ToolBadge>}
      title="Profile"
      description="Appearance, alerts, account settings, and workspace preferences."
    >
      <ProfilePanel />
    </ToolLayout>
  );
}
