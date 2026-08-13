import { STORAGE_NAMESPACES, type StorageNamespace } from '@/lib/storage-namespaces';
import {
  countGalleryEntries,
  readGalleryDeletedIds,
  readGalleryEntries,
  upsertGalleryEntries,
  writeGalleryDeletedIds,
} from './gallery';
import { kvScopeForUser, readKv, writeKv } from './kv';

export function readNamespaceStorage<T>(
  namespace: StorageNamespace,
  userId?: string | null
): T | null {
  const owner = userId?.trim() || '';
  const scope = kvScopeForUser(userId);
  if (namespace === 'comfy-gallery') {
    return readGalleryEntries(owner) as T;
  }
  if (namespace === 'gallery-deleted-ids') {
    return readGalleryDeletedIds(owner) as T;
  }
  return readKv<T>(scope, namespace);
}

export function writeNamespaceStorage(
  namespace: StorageNamespace,
  data: unknown,
  userId?: string | null
): void {
  const owner = userId?.trim() || '';
  const scope = kvScopeForUser(userId);
  if (namespace === 'comfy-gallery') {
    upsertGalleryEntries(owner, data);
    return;
  }
  if (namespace === 'gallery-deleted-ids') {
    writeGalleryDeletedIds(owner, data);
    return;
  }
  writeKv(scope, namespace, data);
}

export function countNamespaceGallery(userId?: string | null): number {
  return countGalleryEntries(userId?.trim() || '');
}

export function listSqliteStorageNamespaces(): StorageNamespace[] {
  return [...STORAGE_NAMESPACES];
}
