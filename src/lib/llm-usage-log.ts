import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type LlmUsageEntry = {
  id: string;
  at: number;
  userId?: string;
  username?: string;
  route: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
  ok: boolean;
};

type LlmUsageDocument = {
  version: 1;
  entries: LlmUsageEntry[];
};

const MAX_ENTRIES = 2000;

function usagePath(): string {
  const base =
    process.env.PROMPT_AUTH_DIR?.trim() ||
    process.env.PROMPT_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".prompt-studio-data");
  const dir = path.join(base, "auth");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "llm-usage.json");
}

function readDoc(): LlmUsageDocument {
  try {
    return JSON.parse(fs.readFileSync(usagePath(), "utf8")) as LlmUsageDocument;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeDoc(doc: LlmUsageDocument): void {
  fs.writeFileSync(usagePath(), JSON.stringify(doc, null, 2), "utf8");
}

export function logLlmUsage(entry: Omit<LlmUsageEntry, "id">): void {
  const doc = readDoc();
  doc.entries.unshift({ ...entry, id: randomUUID() });
  if (doc.entries.length > MAX_ENTRIES) {
    doc.entries.length = MAX_ENTRIES;
  }
  writeDoc(doc);
}

export function listLlmUsage(options?: {
  userId?: string;
  limit?: number;
  since?: number;
}): LlmUsageEntry[] {
  const limit = options?.limit ?? 100;
  let entries = readDoc().entries;
  if (options?.userId) {
    entries = entries.filter((entry) => entry.userId === options.userId);
  }
  if (options?.since) {
    entries = entries.filter((entry) => entry.at >= options.since!);
  }
  return entries.slice(0, limit);
}

export function summarizeLlmUsage(userId?: string): {
  total: number;
  last24h: number;
  last24hTokens: number;
  avgDurationMs: number;
  byModel: Record<string, number>;
} {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let entries = readDoc().entries;
  if (userId) {
    entries = entries.filter((entry) => entry.userId === userId);
  }
  const recent = entries.filter((entry) => entry.at >= dayAgo);
  const byModel: Record<string, number> = {};
  let tokenSum = 0;
  for (const entry of recent) {
    byModel[entry.model] = (byModel[entry.model] ?? 0) + 1;
    tokenSum += entry.totalTokens ?? 0;
  }
  const avgDurationMs =
    recent.length > 0
      ? Math.round(recent.reduce((sum, entry) => sum + entry.durationMs, 0) / recent.length)
      : 0;
  return {
    total: entries.length,
    last24h: recent.length,
    last24hTokens: tokenSum,
    avgDurationMs,
    byModel,
  };
}
