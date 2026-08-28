'use client';

import type { AuthGroup, AuthUserPublic } from '@/lib/auth/types';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';

export type UsersAdminQuotaPanelProps = {
  users: AuthUserPublic[];
  groups: AuthGroup[];
};

export default function UsersAdminQuotaPanel({ users, groups }: UsersAdminQuotaPanelProps) {
  return (
    <ToolSection title="Quota overview">
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Per-user API rate limits from user and group settings. Global defaults use{' '}
        <code className="text-[var(--text-secondary)]">API_RATE_LIMIT_MAX</code> when unset.
      </p>
      {users.length === 0 ? (
        <EmptyState
          compact
          icon="inbox"
          title="No users loaded"
          description="User accounts appear here once the auth directory is available. Create a user above or check server auth configuration."
        />
      ) : (
        <div className="ui-table-shell overflow-x-auto">
          <table className="ui-table text-sm">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>User quota</th>
                <th>Group quotas</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {users.map(entry => {
                const groupQuotas = entry.groupIds
                  .map(groupId => groups.find(group => group.id === groupId))
                  .filter(Boolean)
                  .map(group =>
                    group!.quotaMaxPerMinute
                      ? `${group!.name}: ${group!.quotaMaxPerMinute}/min`
                      : group!.name
                  );
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--border-subtle)]/50 transition hover:bg-[var(--bg-muted)]/40"
                  >
                    <td className="px-3 py-2 text-[var(--text-primary)]">{entry.username}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{entry.role}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--text-muted)]">
                      {entry.quotaMaxPerMinute ? `${entry.quotaMaxPerMinute}/min` : 'Default'}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {groupQuotas.length > 0 ? groupQuotas.join(' · ') : '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {entry.enabled ? 'Yes' : 'No'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ToolSection>
  );
}
