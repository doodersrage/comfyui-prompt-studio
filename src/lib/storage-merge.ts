export type StorageNamespaceConflict = {
  namespace: string;
  localUpdatedAt?: number;
  serverUpdatedAt?: number;
  localCount?: number;
  serverCount?: number;
};

export type MergeChoice = 'local' | 'server' | 'merge';

/** Ignore routine skew from in-flight auto-push / clock jitter. */
const CONFLICT_SKEW_MS = 60_000;

export function suggestMergeChoice(
  conflict: Pick<StorageNamespaceConflict, 'localCount' | 'serverCount'>
): MergeChoice {
  const localCount = conflict.localCount ?? 0;
  const serverCount = conflict.serverCount ?? 0;
  if (localCount <= 0 && serverCount > 0) {
    return 'server';
  }
  if (serverCount <= 0 && localCount > 0) {
    return 'local';
  }
  return 'merge';
}

export function detectStorageConflicts(input: {
  namespaces: Array<{
    namespace: string;
    local?: { updatedAt?: number; count?: number } | null;
    server?: { updatedAt?: number; count?: number } | null;
  }>;
}): StorageNamespaceConflict[] {
  const conflicts: StorageNamespaceConflict[] = [];
  for (const entry of input.namespaces) {
    const local = entry.local;
    const server = entry.server;
    const localCount = local?.count ?? 0;
    const serverCount = server?.count ?? 0;
    const localTime = local?.updatedAt ?? 0;
    const serverTime = server?.updatedAt ?? 0;

    // Nothing on either side.
    if (localCount <= 0 && serverCount <= 0 && localTime <= 0 && serverTime <= 0) {
      continue;
    }

    // One side empty / missing — real sync needed, but auto-reconcile can handle it.
    if (localCount <= 0 || serverCount <= 0) {
      if (localCount !== serverCount || Math.abs(localTime - serverTime) > CONFLICT_SKEW_MS) {
        conflicts.push({
          namespace: entry.namespace,
          localUpdatedAt: local?.updatedAt,
          serverUpdatedAt: server?.updatedAt,
          localCount: local?.count,
          serverCount: server?.count,
        });
      }
      continue;
    }

    // Both sides have data (counts > 0); still guard nulls for the typechecker.
    if (local && server && Math.abs(localTime - serverTime) > CONFLICT_SKEW_MS) {
      conflicts.push({
        namespace: entry.namespace,
        localUpdatedAt: localTime,
        serverUpdatedAt: serverTime,
        localCount: local.count,
        serverCount: server.count,
      });
    }
  }
  return conflicts;
}

export function mergeArraysById<T extends { id: string }>(
  local: T[],
  server: T[],
  pick: (localItem: T, serverItem: T) => T
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

export function mergeSettingsCache<
  T extends {
    updatedAt?: number;
    shared?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    installedPlugins?: Array<{ id: string; updatedAt?: number } & Record<string, unknown>>;
  },
>(local: T, server: T): T {
  const localTime = local.updatedAt ?? 0;
  const serverTime = server.updatedAt ?? 0;
  const preferLocal = localTime >= serverTime;
  const winner = preferLocal ? local : server;
  const loser = preferLocal ? server : local;
  const localPlugins = Array.isArray(local.installedPlugins) ? local.installedPlugins : [];
  const serverPlugins = Array.isArray(server.installedPlugins) ? server.installedPlugins : [];
  const installedPlugins =
    localPlugins.length > 0 || serverPlugins.length > 0
      ? mergeArraysById(localPlugins, serverPlugins, (a, b) =>
          (a.updatedAt ?? 0) >= (b.updatedAt ?? 0) ? a : b
        )
      : winner.installedPlugins;

  // Prefer fuller loader maps when one side was slimmed for local IDB.
  const mergeMapField = (key: string): Record<string, unknown> | undefined => {
    const a = (local.shared?.[key] ?? {}) as Record<string, unknown>;
    const b = (server.shared?.[key] ?? {}) as Record<string, unknown>;
    const aKeys = Object.keys(a).length;
    const bKeys = Object.keys(b).length;
    if (aKeys === 0 && bKeys === 0) {
      return undefined;
    }
    return { ...b, ...a };
  };

  const mapKeys = [
    'modelCheckpointMap',
    'modelVaeMap',
    'modelRefinerMap',
    'modelUpscaleMap',
    'modelLoraMap',
    'modelControlNetMap',
    'modelWorkflowMap',
    'modelSamplerMemory',
  ] as const;
  const sharedMaps: Record<string, unknown> = {};
  for (const key of mapKeys) {
    const merged = mergeMapField(key);
    if (merged) {
      sharedMaps[key] = merged;
    }
  }

  return {
    ...loser,
    ...winner,
    updatedAt: Math.max(localTime, serverTime) || undefined,
    shared: {
      ...(loser.shared ?? {}),
      ...(winner.shared ?? {}),
      ...sharedMaps,
    },
    tools: {
      ...(loser.tools ?? {}),
      ...(winner.tools ?? {}),
    },
    ...(installedPlugins ? { installedPlugins } : {}),
  } as T;
}
