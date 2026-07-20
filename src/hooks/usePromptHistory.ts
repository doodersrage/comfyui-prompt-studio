"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadPromptHistoryStore,
  savePromptHistoryStore,
  type PromptHistoryEntry,
} from "@/lib/prompt-history";
import { USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";
import { scheduleUserAnalyticsSync } from "@/lib/user-analytics-sync";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

export type { PromptHistoryEntry } from "@/lib/prompt-history";
export { PROMPT_HISTORY_KEY, LOCATION_BLOCKLIST_KEY } from "@/lib/prompt-history";
export {
  loadPromptHistoryStore,
  savePromptHistoryStore,
  loadLocationBlocklist,
  saveLocationBlocklist,
} from "@/lib/prompt-history";

function loadHistory(): PromptHistoryEntry[] {
  return loadPromptHistoryStore();
}

function saveHistory(entries: PromptHistoryEntry[]): void {
  savePromptHistoryStore(entries);
  scheduleUserAnalyticsSync();
}

export function usePromptHistory() {
  const [entries, setEntries] = useState<PromptHistoryEntry[]>([]);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    setEntries(loadHistory());
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refresh();
      setMounted(true);
    });

    const onScopeChanged = () => refresh();
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
    return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScopeChanged);
  }, [refresh]);

  const persist = useCallback((next: PromptHistoryEntry[]) => {
    setEntries(next);
    saveHistory(next);
  }, []);

  const addEntry = useCallback(
    (entry: Omit<PromptHistoryEntry, "id" | "timestamp" | "userId">) => {
      const next: PromptHistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      persist([next, ...loadHistory()].slice(0, 100));
      return next.id;
    },
    [persist],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      persist(
        loadHistory().map((entry) =>
          entry.id === id ? { ...entry, favorite: !entry.favorite } : entry,
        ),
      );
    },
    [persist],
  );

  const setRating = useCallback(
    (id: string, rating: PromptHistoryEntry["rating"]) => {
      persist(
        loadHistory().map((entry) =>
          entry.id === id ? { ...entry, rating } : entry,
        ),
      );
    },
    [persist],
  );

  const removeEntry = useCallback(
    (id: string) => {
      persist(loadHistory().filter((entry) => entry.id !== id));
    },
    [persist],
  );

  const clearHistory = useCallback(() => {
    persist([]);
  }, [persist]);

  const setTags = useCallback(
    (id: string, tags: string[]) => {
      const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(
        0,
        12,
      );
      persist(
        loadHistory().map((entry) =>
          entry.id === id ? { ...entry, tags: normalized } : entry,
        ),
      );
    },
    [persist],
  );

  const addTag = useCallback(
    (id: string, tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) {
        return;
      }
      persist(
        loadHistory().map((entry) => {
          if (entry.id !== id) {
            return entry;
          }
          const tags = [...new Set([...(entry.tags ?? []), trimmed])].slice(0, 12);
          return { ...entry, tags };
        }),
      );
    },
    [persist],
  );

  return {
    mounted,
    entries,
    addEntry,
    toggleFavorite,
    setRating,
    setTags,
    addTag,
    removeEntry,
    clearHistory,
    refresh,
  };
}
