import { randomUUID } from 'node:crypto';
import { loadSessions, trimSessions, upsertSession } from '@/lib/sqlite/tables';

export type RegisteredSession = {
  id: string;
  userId: string;
  username: string;
  createdAt: number;
  lastSeenAt: number;
  userAgent?: string;
  ip?: string;
  revoked: boolean;
};

const MAX_SESSIONS = 500;

export function registerSession(input: {
  userId: string;
  username: string;
  userAgent?: string;
  ip?: string;
}): string {
  const id = randomUUID();
  const now = Date.now();
  upsertSession({
    id,
    userId: input.userId,
    username: input.username,
    createdAt: now,
    lastSeenAt: now,
    userAgent: input.userAgent,
    ip: input.ip,
    revoked: false,
  });
  trimSessions(MAX_SESSIONS);
  return id;
}

export function touchSession(sessionId: string): void {
  const session = loadSessions().find(entry => entry.id === sessionId && !entry.revoked);
  if (!session) {
    return;
  }
  upsertSession({ ...session, lastSeenAt: Date.now() });
}

export function listUserSessions(userId: string): RegisteredSession[] {
  return loadSessions().filter(session => session.userId === userId && !session.revoked);
}

export function revokeSession(userId: string, sessionId: string): boolean {
  const session = loadSessions().find(entry => entry.id === sessionId && entry.userId === userId);
  if (!session) {
    return false;
  }
  upsertSession({ ...session, revoked: true });
  return true;
}

export function revokeAllUserSessions(userId: string, exceptSessionId?: string): number {
  const sessions = loadSessions();
  let count = 0;
  for (const session of sessions) {
    if (session.userId !== userId || session.revoked || session.id === exceptSessionId) {
      continue;
    }
    upsertSession({ ...session, revoked: true });
    count += 1;
  }
  return count;
}

export function isSessionRevoked(sessionId: string | undefined): boolean {
  if (!sessionId) {
    return false;
  }
  const session = loadSessions().find(entry => entry.id === sessionId);
  return Boolean(session?.revoked);
}
