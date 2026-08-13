import fs from 'node:fs';
import path from 'node:path';
import { isServerStorageEnabled } from './server-storage';
import {
  countNamespaceGallery,
  readNamespaceStorage,
  writeNamespaceStorage,
} from './sqlite/namespace-storage';
import { SYNC_STORAGE_NAMESPACES, type StorageNamespace } from './storage-namespaces';

/** Per-user durable namespaces (when auth is enabled). */
export type UserStorageNamespace = (typeof SYNC_STORAGE_NAMESPACES)[number];

export const USER_STORAGE_NAMESPACES: UserStorageNamespace[] = [...SYNC_STORAGE_NAMESPACES];

function dataDir(): string {
  const dir = process.env.PROMPT_DATA_DIR?.trim();
  if (!dir) {
    throw new Error('PROMPT_DATA_DIR is not configured.');
  }
  const resolved = path.resolve(/* turbopackIgnore: true */ dir);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

export function readUserServerStorage<T>(
  userId: string,
  namespace: UserStorageNamespace
): T | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  return readNamespaceStorage<T>(namespace, userId);
}

export function writeUserServerStorage<T>(
  userId: string,
  namespace: UserStorageNamespace,
  data: T
): void {
  if (!isServerStorageEnabled()) {
    throw new Error('Server storage is disabled. Set PROMPT_DATA_DIR.');
  }
  writeNamespaceStorage(namespace, data, userId);
}

export function countUserGalleryEntries(userId: string): number {
  if (!isServerStorageEnabled()) {
    return 0;
  }
  return countNamespaceGallery(userId);
}

export function listUserExportFiles(userId: string): string[] {
  if (!isServerStorageEnabled()) {
    return [];
  }
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(dataDir(), 'users', safeUserId, 'exports');
  try {
    return fs.readdirSync(dir).filter(name => name.endsWith('.json'));
  } catch {
    return [];
  }
}

export function writeUserExportSnapshot(
  userId: string,
  username: string,
  payload: Record<string, unknown>
): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(dataDir(), 'users', safeUserId, 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${stamp}-${username.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filename;
}

export function isUserStorageNamespace(
  namespace: StorageNamespace
): namespace is UserStorageNamespace {
  return (USER_STORAGE_NAMESPACES as StorageNamespace[]).includes(namespace);
}
