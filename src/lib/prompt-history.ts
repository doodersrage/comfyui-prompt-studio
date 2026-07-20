import type { GenerationDiagnostics } from "@/lib/generation-diagnostics";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";
import { getActiveUserId, isUserScoped, scopedStorageKey } from "./user-scope";

export const PROMPT_HISTORY_KEY = "comfy-prompt-tool-history-v1";
export const LOCATION_BLOCKLIST_KEY = "comfy-prompt-location-blocklist-v1";

export type PromptHistoryEntry = {
  id: string;
  tool: string;
  prompt: string;
  hints?: string;
  model: string;
  timestamp: number;
  favorite?: boolean;
  rating?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  diagnostics?: GenerationDiagnostics;
  metadata?: Record<string, unknown>;
  /** Set when user auth scopes history per account. */
  userId?: string;
};

const HISTORY_LIMIT = 100;

function historyKey(): string {
  return scopedStorageKey(PROMPT_HISTORY_KEY);
}

function migrateLegacyHistoryToScope(): PromptHistoryEntry[] {
  if (!isUserScoped()) {
    return [];
  }

  const legacy = readBrowserValue<PromptHistoryEntry[]>(PROMPT_HISTORY_KEY) ?? [];
  if (legacy.length === 0) {
    return [];
  }

  const userId = getActiveUserId();
  const migrated = legacy.map((entry) => ({
    ...entry,
    userId: entry.userId ?? userId ?? undefined,
  }));

  writeBrowserValue(historyKey(), migrated);
  return migrated;
}

export function loadPromptHistoryStore(): PromptHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    let entries = readBrowserValue<PromptHistoryEntry[]>(historyKey()) ?? [];
    if (entries.length === 0 && isUserScoped()) {
      entries = migrateLegacyHistoryToScope();
    }
    return entries;
  } catch {
    return [];
  }
}

export function savePromptHistoryStore(entries: PromptHistoryEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const userId = getActiveUserId();
  const stamped = entries.slice(0, HISTORY_LIMIT).map((entry) => ({
    ...entry,
    userId: entry.userId ?? userId ?? undefined,
  }));

  writeBrowserValue(historyKey(), stamped);
  void import("./auto-storage-sync").then(({ scheduleAutoPushStorage }) => scheduleAutoPushStorage());
  void import("./tab-sync").then(({ broadcastTabSync }) => broadcastTabSync({ type: "history-updated" }));
}

export function appendPromptHistoryEntry(
  entry: Omit<PromptHistoryEntry, "id" | "timestamp" | "userId">,
): PromptHistoryEntry {
  const userId = getActiveUserId();
  const next: PromptHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    userId: userId ?? undefined,
  };
  savePromptHistoryStore([next, ...loadPromptHistoryStore()]);
  return next;
}

export function updatePromptHistoryStore(
  updater: (entries: PromptHistoryEntry[]) => PromptHistoryEntry[],
): PromptHistoryEntry[] {
  const next = updater(loadPromptHistoryStore());
  savePromptHistoryStore(next);
  return next;
}

export function loadLocationBlocklist(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return readBrowserValue<string[]>(LOCATION_BLOCKLIST_KEY) ?? [];
  } catch {
    return [];
  }
}

export function saveLocationBlocklist(entries: string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserValue(LOCATION_BLOCKLIST_KEY, entries.slice(0, 200));
}
