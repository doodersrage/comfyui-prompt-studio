import { loadAuditLog, saveAuditLog } from '@/lib/sqlite/tables';

export type AuditLogEntry = {
  id: string;
  at: number;
  actorUserId: string;
  actorUsername: string;
  action: string;
  target?: string;
  details?: string;
};

const MAX_ENTRIES = 500;

export function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'at'>): void {
  const entries = loadAuditLog();
  entries.unshift({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
  });
  saveAuditLog(entries.slice(0, MAX_ENTRIES));
}

export function listAuditLog(limit = 100): AuditLogEntry[] {
  return loadAuditLog().slice(0, limit);
}
