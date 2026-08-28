'use client';

import type { AuditLogEntry } from '@/lib/auth/audit-log';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';

export type UsersAdminAuditLogPanelProps = {
  auditEntries: AuditLogEntry[];
};

export default function UsersAdminAuditLogPanel({ auditEntries }: UsersAdminAuditLogPanelProps) {
  return (
    <ToolSection title="Audit log">
      {auditEntries.length === 0 ? (
        <EmptyState
          compact
          icon="inbox"
          title="No admin actions yet"
          description="User, group, and impersonation changes will show up here as an audit trail."
        />
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {auditEntries.slice(0, 40).map(entry => (
            <li
              key={entry.id}
              className="rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 px-3 py-2 text-[var(--text-secondary)]"
            >
              <span className="text-[var(--text-muted)]">
                {new Date(entry.at).toLocaleString()}
              </span>
              {' · '}
              <span className="text-[var(--text-primary)]">{entry.actorUsername}</span>
              {' · '}
              {entry.action}
              {entry.details ? ` · ${entry.details}` : ''}
            </li>
          ))}
        </ul>
      )}
    </ToolSection>
  );
}
