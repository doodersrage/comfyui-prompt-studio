import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

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

type SessionsDocument = {
  version: 1;
  sessions: RegisteredSession[];
};

const MAX_SESSIONS = 500;

function sessionsPath(): string {
  const base =
    process.env.PROMPT_AUTH_DIR?.trim() ||
    process.env.PROMPT_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".prompt-studio-data");
  const dir = path.join(base, "auth");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "sessions.json");
}

function readDoc(): SessionsDocument {
  try {
    return JSON.parse(fs.readFileSync(sessionsPath(), "utf8")) as SessionsDocument;
  } catch {
    return { version: 1, sessions: [] };
  }
}

function writeDoc(doc: SessionsDocument): void {
  fs.writeFileSync(sessionsPath(), JSON.stringify(doc, null, 2), "utf8");
}

export function registerSession(input: {
  userId: string;
  username: string;
  userAgent?: string;
  ip?: string;
}): string {
  const doc = readDoc();
  const id = randomUUID();
  const now = Date.now();
  doc.sessions.unshift({
    id,
    userId: input.userId,
    username: input.username,
    createdAt: now,
    lastSeenAt: now,
    userAgent: input.userAgent,
    ip: input.ip,
    revoked: false,
  });
  if (doc.sessions.length > MAX_SESSIONS) {
    doc.sessions.length = MAX_SESSIONS;
  }
  writeDoc(doc);
  return id;
}

export function touchSession(sessionId: string): void {
  const doc = readDoc();
  const session = doc.sessions.find((entry) => entry.id === sessionId && !entry.revoked);
  if (!session) {
    return;
  }
  session.lastSeenAt = Date.now();
  writeDoc(doc);
}

export function listUserSessions(userId: string): RegisteredSession[] {
  return readDoc().sessions.filter((session) => session.userId === userId && !session.revoked);
}

export function revokeSession(userId: string, sessionId: string): boolean {
  const doc = readDoc();
  const session = doc.sessions.find(
    (entry) => entry.id === sessionId && entry.userId === userId,
  );
  if (!session) {
    return false;
  }
  session.revoked = true;
  writeDoc(doc);
  return true;
}

export function revokeAllUserSessions(userId: string, exceptSessionId?: string): number {
  const doc = readDoc();
  let count = 0;
  for (const session of doc.sessions) {
    if (session.userId !== userId || session.revoked || session.id === exceptSessionId) {
      continue;
    }
    session.revoked = true;
    count += 1;
  }
  if (count > 0) {
    writeDoc(doc);
  }
  return count;
}

export function isSessionRevoked(sessionId: string | undefined): boolean {
  if (!sessionId) {
    return false;
  }
  const session = readDoc().sessions.find((entry) => entry.id === sessionId);
  return Boolean(session?.revoked);
}
