"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  applyStorageMerge,
  autoPullStorageIfEmpty,
  probeStorageConflicts,
  type AutoSyncResult,
} from "@/lib/auto-storage-sync";
import type { StorageNamespace } from "@/lib/storage-namespaces";
import type { MergeChoice } from "@/lib/storage-merge";
import StorageSyncConflictModal from "@/components/StorageSyncConflictModal";

export default function AutoStorageSyncInit() {
  const { user, loading } = useAuth();
  const [conflicts, setConflicts] = useState<AutoSyncResult["conflicts"]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    void (async () => {
      const result = await autoPullStorageIfEmpty();
      if (result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setOpen(true);
        return;
      }
      if (result.synced.length > 0) {
        window.location.reload();
      }
    })();
  }, [loading, user?.id]);

  async function resolveConflicts(choices: Partial<Record<StorageNamespace, MergeChoice>>) {
    await applyStorageMerge(choices);
    setOpen(false);
    window.location.reload();
  }

  if (!open || conflicts.length === 0) {
    return null;
  }

  return (
    <StorageSyncConflictModal
      conflicts={conflicts}
      onResolve={(choices) => void resolveConflicts(choices)}
      onDismiss={() => setOpen(false)}
    />
  );
}

export function useStorageConflictProbe() {
  return {
    probe: probeStorageConflicts,
    apply: applyStorageMerge,
  };
}
