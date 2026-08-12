import type { StorageNamespace } from './storage-namespaces';
import { SYNC_STORAGE_NAMESPACES } from './storage-namespaces';

export async function syncNamespaceToServer<T>(
  namespace: StorageNamespace,
  data: T
): Promise<boolean> {
  try {
    const response = await fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ namespace, data }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function pullNamespaceFromServer<T>(namespace: StorageNamespace): Promise<T | null> {
  try {
    const response = await fetch(`/api/storage?namespace=${encodeURIComponent(namespace)}`, {
      method: 'PUT',
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { data?: T };
    return payload.data ?? null;
  } catch {
    return null;
  }
}

export function serverStorageStatus(): {
  enabled: boolean;
  namespaces: StorageNamespace[];
} {
  return {
    enabled: false,
    namespaces: [...SYNC_STORAGE_NAMESPACES],
  };
}
