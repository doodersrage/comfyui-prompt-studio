import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { findApiKeyByHash, loadApiKeys, saveApiKeys } from '@/lib/sqlite/tables';

export type UserApiKey = {
  id: string;
  userId: string;
  label: string;
  prefix: string;
  hash: string;
  createdAt: number;
  lastUsedAt?: number;
  enabled: boolean;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createUserApiKey(input: { userId: string; label: string }): {
  key: UserApiKey;
  token: string;
} {
  const keys = loadApiKeys();
  const raw = randomBytes(24).toString('base64url');
  const token = `pt_${raw}`;
  const prefix = token.slice(0, 10);
  const entry: UserApiKey = {
    id: `key-${randomBytes(8).toString('hex')}`,
    userId: input.userId,
    label: input.label.trim() || 'API key',
    prefix,
    hash: hashToken(token),
    createdAt: Date.now(),
    enabled: true,
  };
  saveApiKeys([entry, ...keys]);
  return { key: entry, token };
}

export function listUserApiKeys(userId: string): UserApiKey[] {
  return loadApiKeys().filter(key => key.userId === userId);
}

export function revokeUserApiKey(userId: string, keyId: string): boolean {
  const keys = loadApiKeys();
  const next = keys.filter(key => !(key.id === keyId && key.userId === userId));
  if (next.length === keys.length) {
    return false;
  }
  saveApiKeys(next);
  return true;
}

export function resolveUserIdFromApiKey(token: string | undefined | null): string | null {
  if (!token?.startsWith('pt_')) {
    return null;
  }
  const hash = hashToken(token);
  const match = findApiKeyByHash(hash);
  if (!match) {
    return null;
  }
  const left = Buffer.from(match.hash);
  const right = Buffer.from(hash);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  const keys = loadApiKeys();
  saveApiKeys(keys.map(key => (key.id === match.id ? { ...key, lastUsedAt: Date.now() } : key)));
  return match.userId;
}
