"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import type { AutoSyncResult } from "@/lib/auto-storage-sync";
import type { StorageNamespace } from "@/lib/storage-namespaces";
import type { MergeChoice } from "@/lib/storage-merge";
import { suggestMergeChoice } from "@/lib/storage-merge";

const StorageSyncConflictModal = dynamic(
  () => import("@/components/StorageSyncConflictModal"),
  { ssr: false },
);

const DISMISS_KEY = "prompt-studio.storage-sync.dismissed";

function deferIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(callback, { timeout: 5000 });
    return () => window.cancelIdleCallback(idleId);
  }
  const timeoutId = window.setTimeout(callback, 1500);
  return () => window.clearTimeout(timeoutId);
}

function wasDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissedThisSession(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore quota / private mode
  }
}

export default function AutoStorageSyncInit() {
  const { user, loading } = useAuth();
  const [conflicts, setConflicts] = useState<AutoSyncResult["conflicts"]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user || process.env.NEXT_PUBLIC_PLAYWRIGHT === "1") {
      return;
    }

    return deferIdle(() => {
      void import("@/lib/auto-storage-sync").then(async ({ autoPullStorageIfEmpty }) => {
        const result = await autoPullStorageIfEmpty();
        // Startup path auto-merges; conflicts here are a rare fallback only.
        if (result.conflicts.length > 0 && !wasDismissedThisSession()) {
          setConflicts(result.conflicts);
          setOpen(true);
          return;
        }
        // Reload only when an empty browser received server snapshots.
        if (result.pulledIntoEmpty) {
          window.location.reload();
        }
      });
    });
    // Intentionally key off user id so object identity churn does not re-trigger sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user?.id is the stable identity
  }, [loading, user?.id]);

  async function resolveConflicts(
    choices: Partial<Record<StorageNamespace, MergeChoice>>,
  ) {
    const { applyStorageMerge } = await import("@/lib/auto-storage-sync");
    await applyStorageMerge(choices);
    markDismissedThisSession();
    setOpen(false);
    window.location.reload();
  }

  if (!open || conflicts.length === 0) {
    return null;
  }

  const defaults = Object.fromEntries(
    conflicts.map((conflict) => [
      conflict.namespace,
      suggestMergeChoice(conflict),
    ]),
  ) as Partial<Record<StorageNamespace, MergeChoice>>;

  return (
    <StorageSyncConflictModal
      conflicts={conflicts}
      initialChoices={defaults}
      onResolve={(choices) => void resolveConflicts(choices)}
      onDismiss={() => {
        markDismissedThisSession();
        setOpen(false);
      }}
    />
  );
}

export function useStorageConflictProbe() {
  return {
    probe: async (
      ...args: Parameters<
        (typeof import("@/lib/auto-storage-sync"))["probeStorageConflicts"]
      >
    ) => {
      const { probeStorageConflicts } = await import("@/lib/auto-storage-sync");
      return probeStorageConflicts(...args);
    },
    apply: async (
      ...args: Parameters<
        (typeof import("@/lib/auto-storage-sync"))["applyStorageMerge"]
      >
    ) => {
      const { applyStorageMerge } = await import("@/lib/auto-storage-sync");
      return applyStorageMerge(...args);
    },
  };
}
