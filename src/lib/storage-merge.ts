export type StorageNamespaceConflict = {
  namespace: string;
  localUpdatedAt?: number;
  serverUpdatedAt?: number;
  localCount?: number;
  serverCount?: number;
};

export type MergeChoice = "local" | "server" | "merge";

export function detectStorageConflicts(input: {
  namespaces: Array<{
    namespace: string;
    local?: { updatedAt?: number; count?: number } | null;
    server?: { updatedAt?: number; count?: number } | null;
  }>;
}): StorageNamespaceConflict[] {
  const conflicts: StorageNamespaceConflict[] = [];
  for (const entry of input.namespaces) {
    if (!entry.local && !entry.server) {
      continue;
    }
    if (!entry.local || !entry.server) {
      conflicts.push({
        namespace: entry.namespace,
        localUpdatedAt: entry.local?.updatedAt,
        serverUpdatedAt: entry.server?.updatedAt,
        localCount: entry.local?.count,
        serverCount: entry.server?.count,
      });
      continue;
    }
    const localTime = entry.local.updatedAt ?? 0;
    const serverTime = entry.server.updatedAt ?? 0;
    if (Math.abs(localTime - serverTime) > 1000) {
      conflicts.push({
        namespace: entry.namespace,
        localUpdatedAt: localTime,
        serverUpdatedAt: serverTime,
        localCount: entry.local.count,
        serverCount: entry.server.count,
      });
    }
  }
  return conflicts;
}

export function mergeArraysById<T extends { id: string }>(
  local: T[],
  server: T[],
  pick: (localItem: T, serverItem: T) => T,
): T[] {
  const map = new Map<string, T>();
  for (const item of server) {
    map.set(item.id, item);
  }
  for (const item of local) {
    const existing = map.get(item.id);
    map.set(item.id, existing ? pick(item, existing) : item);
  }
  return [...map.values()].sort((a, b) => {
    const aTime = (a as { updatedAt?: number }).updatedAt ?? 0;
    const bTime = (b as { updatedAt?: number }).updatedAt ?? 0;
    return bTime - aTime;
  });
}

export function mergeSettingsCache<T extends Record<string, unknown>>(
  local: T,
  server: T,
): T {
  return {
    ...server,
    ...local,
    shared: {
      ...(server.shared as Record<string, unknown> | undefined),
      ...(local.shared as Record<string, unknown> | undefined),
    },
    tools: {
      ...(server.tools as Record<string, unknown> | undefined),
      ...(local.tools as Record<string, unknown> | undefined),
    },
  };
}
