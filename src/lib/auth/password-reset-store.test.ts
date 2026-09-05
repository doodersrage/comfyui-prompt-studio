import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, describe, it, mock } from 'node:test';

type PasswordResetToken = {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
};

type MockAuthUser = {
  id: string;
  username: string;
  passwordHash: string;
  email?: string;
  updatedAt: number;
};

// --- @/lib/sqlite/tables ---
let tokensTable: PasswordResetToken[] = [];
const loadPasswordResetTokens = mock.fn(() => tokensTable);
const savePasswordResetTokens = mock.fn((next: PasswordResetToken[]) => {
  tokensTable = next;
});
mock.module('@/lib/sqlite/tables', {
  namedExports: { loadPasswordResetTokens, savePasswordResetTokens },
});

// --- ./store (this file gets its own test suite; store.ts is not exercised here) ---
let usersTable: MockAuthUser[] = [];
const findUserByUsername = mock.fn((username: string) => {
  const normalized = username.trim().toLowerCase();
  return usersTable.find(user => user.username.trim().toLowerCase() === normalized) ?? null;
});
const saveUsers = mock.fn((next: MockAuthUser[]) => {
  usersTable = next;
});
const ensureAuthStore = mock.fn(() => ({
  users: { version: 1 as const, users: usersTable },
  groups: { version: 1 as const, groups: [] },
}));
mock.module('./store', { namedExports: { findUserByUsername, saveUsers, ensureAuthStore } });

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makeUser(overrides: Partial<MockAuthUser> = {}): MockAuthUser {
  return {
    id: overrides.id ?? 'user-1',
    username: overrides.username ?? 'alice',
    passwordHash: overrides.passwordHash ?? 'hashed:old',
    email: overrides.email,
    updatedAt: overrides.updatedAt ?? 0,
  };
}

afterEach(() => {
  tokensTable = [];
  usersTable = [];
  loadPasswordResetTokens.mock.resetCalls();
  savePasswordResetTokens.mock.resetCalls();
  findUserByUsername.mock.resetCalls();
  saveUsers.mock.resetCalls();
  ensureAuthStore.mock.resetCalls();
});

describe('auth/password-reset-store', async () => {
  const { createPasswordResetToken, consumePasswordResetToken, resolveUserForPasswordReset } =
    await import('./password-reset-store');
  // hashPassword from ./password is intentionally left real (unmocked): it is cheap,
  // deterministic-enough to assert against with verifyPassword, and this suite wants to
  // confirm real hashing is applied on reset, not a re-implementation of it.
  const { verifyPassword } = await import('./password');

  describe('createPasswordResetToken', () => {
    it('returns a random plaintext token and stores only its sha256 hash', () => {
      const token = createPasswordResetToken('user-1');
      assert.match(token, /^[0-9a-f]{64}$/);
      assert.equal(tokensTable.length, 1);
      assert.notEqual(tokensTable[0]!.tokenHash, token);
      assert.equal(tokensTable[0]!.tokenHash, hashToken(token));
      assert.equal(tokensTable[0]!.userId, 'user-1');
    });

    it('sets an expiry roughly one hour in the future', () => {
      const before = Date.now();
      createPasswordResetToken('user-1');
      const entry = tokensTable[0]!;
      assert.ok(entry.expiresAt >= before + 60 * 60 * 1000);
      assert.ok(entry.expiresAt <= Date.now() + 60 * 60 * 1000 + 1000);
    });

    it('drops any existing unexpired token for the same user and replaces it', () => {
      const now = Date.now();
      tokensTable = [
        { userId: 'user-1', tokenHash: 'old-hash', expiresAt: now + 10_000, createdAt: now },
      ];
      createPasswordResetToken('user-1');
      assert.equal(tokensTable.length, 1);
      assert.notEqual(tokensTable[0]!.tokenHash, 'old-hash');
    });

    it('drops expired tokens for other users while keeping unexpired ones', () => {
      const now = Date.now();
      tokensTable = [
        { userId: 'user-2', tokenHash: 'expired-hash', expiresAt: now - 1, createdAt: now },
        { userId: 'user-3', tokenHash: 'valid-hash', expiresAt: now + 10_000, createdAt: now },
      ];
      createPasswordResetToken('user-1');
      const userIds = tokensTable.map(entry => entry.userId).sort();
      assert.deepEqual(userIds, ['user-1', 'user-3']);
    });
  });

  describe('consumePasswordResetToken', () => {
    it('rejects a blank token', () => {
      const result = consumePasswordResetToken('   ', 'longenough');
      assert.deepEqual(result, { ok: false, error: 'Invalid token or password too short.' });
    });

    it('rejects a password shorter than 6 characters', () => {
      const result = consumePasswordResetToken('sometoken', '12345');
      assert.deepEqual(result, { ok: false, error: 'Invalid token or password too short.' });
    });

    it('rejects a token that does not match any stored hash', () => {
      tokensTable = [];
      const result = consumePasswordResetToken('unknown-token', 'newpassword');
      assert.deepEqual(result, { ok: false, error: 'Reset link expired or invalid.' });
    });

    it('rejects an expired token', () => {
      const token = 'expired-token';
      const now = Date.now();
      tokensTable = [
        { userId: 'user-1', tokenHash: hashToken(token), expiresAt: now - 1, createdAt: now },
      ];
      const result = consumePasswordResetToken(token, 'newpassword');
      assert.deepEqual(result, { ok: false, error: 'Reset link expired or invalid.' });
    });

    it('reports the user as not found when the token is valid but the user is missing', () => {
      const token = 'valid-token';
      const now = Date.now();
      tokensTable = [
        { userId: 'ghost-user', tokenHash: hashToken(token), expiresAt: now + 10_000, createdAt: now },
      ];
      usersTable = [];
      const result = consumePasswordResetToken(token, 'newpassword');
      assert.deepEqual(result, { ok: false, error: 'User not found.' });
    });

    it('resets the password, saves the user, and removes the token on success', () => {
      const token = 'good-token';
      const now = Date.now();
      tokensTable = [
        { userId: 'user-1', tokenHash: hashToken(token), expiresAt: now + 10_000, createdAt: now },
      ];
      usersTable = [makeUser({ id: 'user-1', username: 'alice', passwordHash: 'hashed:old' })];

      const result = consumePasswordResetToken(token, 'newpassword');

      assert.deepEqual(result, { ok: true, username: 'alice' });
      assert.equal(saveUsers.mock.calls.length, 1);
      const savedUser = usersTable[0]!;
      assert.notEqual(savedUser.passwordHash, 'hashed:old');
      assert.equal(verifyPassword('newpassword', savedUser.passwordHash), true);
      assert.equal(savePasswordResetTokens.mock.calls.length, 1);
      assert.equal(tokensTable.length, 0);
    });

    it('trims the incoming token before hashing it for lookup', () => {
      const token = 'trim-me-token';
      const now = Date.now();
      tokensTable = [
        { userId: 'user-1', tokenHash: hashToken(token), expiresAt: now + 10_000, createdAt: now },
      ];
      usersTable = [makeUser({ id: 'user-1' })];
      const result = consumePasswordResetToken(`  ${token}  `, 'newpassword');
      assert.equal(result.ok, true);
    });

    it('cannot be consumed a second time for the same token', () => {
      const token = 'one-shot-token';
      const now = Date.now();
      tokensTable = [
        { userId: 'user-1', tokenHash: hashToken(token), expiresAt: now + 10_000, createdAt: now },
      ];
      usersTable = [makeUser({ id: 'user-1' })];

      const first = consumePasswordResetToken(token, 'newpassword');
      assert.equal(first.ok, true);

      const second = consumePasswordResetToken(token, 'anotherpass');
      assert.deepEqual(second, { ok: false, error: 'Reset link expired or invalid.' });
    });

    it('removes every remaining token for the consumed user, not just the matched one', () => {
      const token = 'primary-token';
      const now = Date.now();
      tokensTable = [
        { userId: 'user-1', tokenHash: hashToken(token), expiresAt: now + 10_000, createdAt: now },
        { userId: 'user-1', tokenHash: 'stale-secondary-hash', expiresAt: now + 20_000, createdAt: now },
        { userId: 'user-2', tokenHash: 'other-user-hash', expiresAt: now + 20_000, createdAt: now },
      ];
      usersTable = [makeUser({ id: 'user-1' })];

      consumePasswordResetToken(token, 'newpassword');

      assert.deepEqual(
        tokensTable.map(entry => entry.userId),
        ['user-2']
      );
    });
  });

  describe('resolveUserForPasswordReset', () => {
    it('resolves by username when a username is given', () => {
      usersTable = [makeUser({ id: 'user-1', username: 'alice' })];
      const result = resolveUserForPasswordReset({ username: '  Alice  ' });
      assert.equal(result?.id, 'user-1');
      assert.equal(findUserByUsername.mock.calls.length, 1);
    });

    it('prefers username over email when both are given', () => {
      usersTable = [makeUser({ id: 'user-1', username: 'alice', email: 'alice@example.com' })];
      resolveUserForPasswordReset({ username: 'alice', email: 'someone-else@example.com' });
      assert.equal(findUserByUsername.mock.calls.length, 1);
      assert.equal(ensureAuthStore.mock.calls.length, 0);
    });

    it('resolves by case-insensitive trimmed email when no username is given', () => {
      usersTable = [makeUser({ id: 'user-1', email: 'Alice@Example.com' })];
      const result = resolveUserForPasswordReset({ email: '  alice@example.com  ' });
      assert.equal(result?.id, 'user-1');
    });

    it('returns null when neither username nor email is given', () => {
      assert.equal(resolveUserForPasswordReset({}), null);
    });

    it('returns null when the email does not match any user', () => {
      usersTable = [makeUser({ id: 'user-1', email: 'alice@example.com' })];
      assert.equal(resolveUserForPasswordReset({ email: 'nobody@example.com' }), null);
    });

    it('returns null when username is blank/whitespace and falls through to email handling', () => {
      usersTable = [makeUser({ id: 'user-1', email: 'alice@example.com' })];
      const result = resolveUserForPasswordReset({ username: '   ', email: 'alice@example.com' });
      assert.equal(result?.id, 'user-1');
      assert.equal(findUserByUsername.mock.calls.length, 0);
    });
  });
});
