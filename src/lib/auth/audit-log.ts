import fs from "node:fs";
import path from "node:path";

export type AuditLogEntry = {
  id: string;
  at: number;
  actorUserId: string;
  actorUsername: string;
  action: string;
  target?: string;
  details?: string;
};

type AuditDocument = {
  version: 1;
  entries: AuditLogEntry[];
};

const MAX_ENTRIES = 500;

function auditPath(): string {
  const base =
    process.env.PROMPT_AUTH_DIR?.trim() ||
    process.env.PROMPT_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".prompt-studio-data");
  const dir = path.join(base, "auth");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "audit-log.json");
}

function readDocument(): AuditDocument {
  try {
    return JSON.parse(fs.readFileSync(auditPath(), "utf8")) as AuditDocument;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeDocument(document: AuditDocument): void {
  fs.writeFileSync(auditPath(), JSON.stringify(document, null, 2), "utf8");
}

export function appendAuditLog(entry: Omit<AuditLogEntry, "id" | "at">): void {
  const document = readDocument();
  document.entries.unshift({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
  });
  document.entries = document.entries.slice(0, MAX_ENTRIES);
  writeDocument(document);
}

export function listAuditLog(limit = 100): AuditLogEntry[] {
  return readDocument().entries.slice(0, limit);
}
