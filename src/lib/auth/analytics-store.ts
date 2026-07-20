import fs from "node:fs";
import path from "node:path";
import type { UserAnalyticsSnapshot } from "../user-analytics";

type AnalyticsDocument = {
  version: 1;
  snapshots: Record<string, UserAnalyticsSnapshot>;
};

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
    return JSON.parse(fs.readFileSync(analyticsPath(), "utf8")) as AnalyticsDocument;
  } catch {
    return { version: 1, snapshots: {} };
  }
}

function writeDocument(document: AnalyticsDocument): void {
  fs.writeFileSync(analyticsPath(), JSON.stringify(document, null, 2), "utf8");
}

export function saveUserAnalyticsSnapshot(snapshot: UserAnalyticsSnapshot): void {
  const document = readDocument();
  document.snapshots[snapshot.userId] = snapshot;
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
