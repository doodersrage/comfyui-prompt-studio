import fs from "node:fs";
import path from "node:path";
import type { UserAnalyticsSnapshot } from "../user-analytics";

type AnalyticsDocument = {
  version: 1;
  snapshots: Record<string, UserAnalyticsSnapshot>;
  history: Record<string, UserAnalyticsSnapshot[]>;
};

const MAX_HISTORY_PER_USER = 120;

function analyticsPath(): string {
  const base =
    process.env.PROMPT_AUTH_DIR?.trim() ||
    process.env.PROMPT_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".prompt-studio-data");
  const dir = path.join(base, "auth");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "analytics-snapshots.json");
}

function readDocument(): AnalyticsDocument {
  try {
    const raw = JSON.parse(fs.readFileSync(analyticsPath(), "utf8")) as AnalyticsDocument;
    return {
      version: 1,
      snapshots: raw.snapshots ?? {},
      history: raw.history ?? {},
    };
  } catch {
    return { version: 1, snapshots: {}, history: {} };
  }
}

function writeDocument(document: AnalyticsDocument): void {
  fs.writeFileSync(analyticsPath(), JSON.stringify(document, null, 2), "utf8");
}

export function saveUserAnalyticsSnapshot(snapshot: UserAnalyticsSnapshot): void {
  const document = readDocument();
  document.snapshots[snapshot.userId] = snapshot;
  const history = document.history[snapshot.userId] ?? [];
  const last = history[0];
  if (!last || last.capturedAt !== snapshot.capturedAt) {
    history.unshift(snapshot);
  }
  document.history[snapshot.userId] = history.slice(0, MAX_HISTORY_PER_USER);
  writeDocument(document);
}

export function listUserAnalyticsSnapshots(): UserAnalyticsSnapshot[] {
  const document = readDocument();
  return Object.values(document.snapshots).sort((a, b) =>
    a.username.localeCompare(b.username),
  );
}

export function getUserAnalyticsSnapshot(userId: string): UserAnalyticsSnapshot | null {
  const document = readDocument();
  return document.snapshots[userId] ?? null;
}

export function listUserAnalyticsHistory(
  userId: string,
  limit = 60,
): UserAnalyticsSnapshot[] {
  const document = readDocument();
  return (document.history[userId] ?? []).slice(0, limit);
}

export function listAllAnalyticsHistory(limitPerUser = 30): Record<string, UserAnalyticsSnapshot[]> {
  const document = readDocument();
  const result: Record<string, UserAnalyticsSnapshot[]> = {};
  for (const [userId, entries] of Object.entries(document.history)) {
    result[userId] = entries.slice(0, limitPerUser);
  }
  return result;
}
