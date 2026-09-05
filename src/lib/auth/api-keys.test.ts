import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { createHash } from 'node:crypto';

import type { UserApiKey } from './api-keys';

let keys: UserApiKey[] = [];

const loadApiKeys = mock.fn((): UserApiKey[] => keys);
const saveApiKeys = mock.fn((next: UserApiKey[]) => {
  keys = next;
});
const findApiKeyByHash = mock.fn(
  (hash: string): UserApiKey | null => keys.find(k => k.hash === hash && k.enabled) ?? null
);

mock.module('@/lib/sqlite/tables', {
  namedExports: { findApiKeyByHash, loadApiKeys, saveApiKeys },
});

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makeKey(overrides: Partial<UserApiKey> = {}): UserApiKey {
  return {
    id: 'key-1',
    userId: 'u1',
    label: 'API key',
    prefix: 'pt_abcdefgh',
    hash: hashToken('pt_sometoken'),
    createdAt: 100,
    enabled: true,
    ...overrides,
  };
}

afterEach(() => {
  keys = [];
  loadApiKeys.mock.resetCalls();
  saveApiKeys.mock.resetCalls();
  findApiKeyByHash.mock.resetCalls();
});

describe('auth/api-keys', async () => {
  const { createUserApiKey, listUserApiKeys, revokeUserApiKey, resolveUserIdFromApiKey } =
    await import('./api-keys');

  describe('createUserApiKey', () => {
    it('returns a plaintext token starting with pt_ and a stored key entry', () => {
      const { key, token } = createUserApiKey({ userId: 'u1', label: 'My Key' });
      assert.match(token, /^pt_/);
      assert.equal(key.userId, 'u1');
      assert.equal(key.label, 'My Key');
      assert.equal(key.enabled, true);
      assert.equal(typeof key.createdAt, 'number');
    });

    it('stores only the hash of the token, not the plaintext', () => {
      const { key, token } = createUserApiKey({ userId: 'u1', label: 'My Key' });
      assert.notEqual(key.hash, token);
      assert.equal(key.hash, hashToken(token));
    });

    it('derives the prefix from the start of the token', () => {
      const { key, token } = createUserApiKey({ userId: 'u1', label: 'My Key' });
      assert.equal(key.prefix, token.slice(0, 10));
    });

    it('trims the label and falls back to "API key" when blank', () => {
      const { key } = createUserApiKey({ userId: 'u1', label: '   ' });
      assert.equal(key.label, 'API key');
    });

    it('prepends the new key to the existing keys and saves', () => {
      keys = [makeKey({ id: 'existing' })];
      createUserApiKey({ userId: 'u1', label: 'New' });
      assert.equal(saveApiKeys.mock.calls.length, 1);
      assert.equal(keys.length, 2);
      assert.equal(keys[1]!.id, 'existing');
    });

    it('generates unique ids across calls', () => {
      const { key: key1 } = createUserApiKey({ userId: 'u1', label: 'A' });
      const { key: key2 } = createUserApiKey({ userId: 'u1', label: 'B' });
      assert.notEqual(key1.id, key2.id);
    });
  });

  describe('listUserApiKeys', () => {
    it('returns only keys belonging to the given user', () => {
      keys = [makeKey({ id: 'k1', userId: 'u1' }), makeKey({ id: 'k2', userId: 'u2' })];
      const result = listUserApiKeys('u1');
      assert.equal(result.length, 1);
      assert.equal(result[0]!.id, 'k1');
    });

    it('returns an empty array when the user has no keys', () => {
      keys = [makeKey({ id: 'k1', userId: 'u2' })];
      assert.deepEqual(listUserApiKeys('u1'), []);
    });
  });

  describe('revokeUserApiKey', () => {
    it('removes the matching key and returns true', () => {
      keys = [makeKey({ id: 'k1', userId: 'u1' })];
      const result = revokeUserApiKey('u1', 'k1');
      assert.equal(result, true);
      assert.equal(keys.length, 0);
      assert.equal(saveApiKeys.mock.calls.length, 1);
    });

    it('returns false when the key id does not exist', () => {
      keys = [makeKey({ id: 'k1', userId: 'u1' })];
      const result = revokeUserApiKey('u1', 'missing');
      assert.equal(result, false);
      assert.equal(keys.length, 1);
      assert.equal(saveApiKeys.mock.calls.length, 0);
    });

    it('returns false when the key belongs to a different user', () => {
      keys = [makeKey({ id: 'k1', userId: 'u1' })];
      const result = revokeUserApiKey('u2', 'k1');
      assert.equal(result, false);
      assert.equal(keys.length, 1);
    });
  });

  describe('resolveUserIdFromApiKey', () => {
    it('returns the userId for a valid, known token', () => {
      const token = 'pt_validtoken123';
      keys = [makeKey({ id: 'k1', userId: 'u1', hash: hashToken(token) })];
      const result = resolveUserIdFromApiKey(token);
      assert.equal(result, 'u1');
    });

    it('updates lastUsedAt on the matched key', () => {
      const token = 'pt_validtoken123';
      keys = [makeKey({ id: 'k1', userId: 'u1', hash: hashToken(token) })];
      resolveUserIdFromApiKey(token);
      assert.equal(typeof keys[0]!.lastUsedAt, 'number');
      assert.equal(saveApiKeys.mock.calls.length, 1);
    });

    it('returns null for an undefined token', () => {
      assert.equal(resolveUserIdFromApiKey(undefined), null);
    });

    it('returns null for a null token', () => {
      assert.equal(resolveUserIdFromApiKey(null), null);
    });

    it('returns null for a token missing the pt_ prefix', () => {
      assert.equal(resolveUserIdFromApiKey('not-a-key'), null);
    });

    it('returns null when no key matches the hash', () => {
      keys = [];
      assert.equal(resolveUserIdFromApiKey('pt_unknown'), null);
    });
  });
});
