import { encodeJson, decodeJson, getStudioDb } from './studio-db';

export function kvScopeForUser(userId?: string | null): string {
  const trimmed = userId?.trim();
  return trimmed ? `user:${trimmed}` : 'global';
}

export function readKv<T>(scope: string, key: string): T | null {
  const row = getStudioDb()
    .prepare('SELECT json FROM kv WHERE scope = ? AND key = ?')
    .get(scope, key) as { json?: string } | undefined;
  if (typeof row?.json !== 'string') {
    return null;
  }
  try {
    return decodeJson<T>(row.json);
  } catch {
    return null;
  }
}

export function writeKv(scope: string, key: string, data: unknown): void {
  getStudioDb()
    .prepare('INSERT OR REPLACE INTO kv (scope, key, json, updated_at) VALUES (?, ?, ?, ?)')
    .run(scope, key, encodeJson(data), Date.now());
}

export function deleteKv(scope: string, key: string): void {
  getStudioDb().prepare('DELETE FROM kv WHERE scope = ? AND key = ?').run(scope, key);
}

export function kvKeyExists(scope: string, key: string): boolean {
  const row = getStudioDb()
    .prepare('SELECT 1 AS ok FROM kv WHERE scope = ? AND key = ?')
    .get(scope, key) as { ok?: number } | undefined;
  return Boolean(row);
}
