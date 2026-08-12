import Link from 'next/link';
import SystemPageShell from '@/components/ui/SystemPageShell';

export default function ForbiddenPage() {
  return (
    <SystemPageShell
      accent="rose"
      overline="Forbidden"
      title="Access blocked"
      description="Your account or group does not have permission for this tool. Contact an admin to adjust blocked features in Settings → Users."
    >
      <Link href="/" className="ui-btn-secondary">
        Back to home
      </Link>
    </SystemPageShell>
  );
}
