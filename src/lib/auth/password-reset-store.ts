import { randomBytes, createHash } from 'node:crypto';
import { hashPassword } from './password';
import { findUserByUsername, saveUsers, ensureAuthStore } from './store';
import { loadPasswordResetTokens, savePasswordResetTokens } from '@/lib/sqlite/tables';

// Reset tokens are already high-entropy random values (32 bytes from randomBytes),
// so a plain deterministic digest is sufficient here (no per-hash salt needed, unlike
// user passwords). Using hashPassword() previously broke redemption entirely, since
// it salts randomly on every call, so the hash computed at consume-time could never
// match the hash stored at creation-time.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createPasswordResetToken(userId: string): string {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const tokens = loadPasswordResetTokens().filter(
    entry => entry.expiresAt > now && entry.userId !== userId
  );
  tokens.push({
    userId,
    tokenHash: hashToken(token),
    expiresAt: now + 60 * 60 * 1000,
    createdAt: now,
  });
  savePasswordResetTokens(tokens);
  return token;
}

export function consumePasswordResetToken(
  token: string,
  newPassword: string
): { ok: true; username: string } | { ok: false; error: string } {
  const trimmed = token.trim();
  if (!trimmed || newPassword.trim().length < 6) {
    return { ok: false, error: 'Invalid token or password too short.' };
  }

  const tokens = loadPasswordResetTokens();
  const now = Date.now();
  const tokenHash = hashToken(trimmed);
  const index = tokens.findIndex(entry => entry.tokenHash === tokenHash && entry.expiresAt > now);
  if (index < 0) {
    return { ok: false, error: 'Reset link expired or invalid.' };
  }

  const { userId } = tokens[index]!;
  const { users } = ensureAuthStore();
  const userIndex = users.users.findIndex(user => user.id === userId);
  if (userIndex < 0) {
    return { ok: false, error: 'User not found.' };
  }

  users.users[userIndex] = {
    ...users.users[userIndex]!,
    passwordHash: hashPassword(newPassword.trim()),
    updatedAt: now,
  };
  saveUsers(users.users);
  savePasswordResetTokens(tokens.filter(entry => entry.userId !== userId));

  return { ok: true, username: users.users[userIndex]!.username };
}

export function resolveUserForPasswordReset(input: { username?: string; email?: string }) {
  const username = input.username?.trim();
  if (username) {
    return findUserByUsername(username);
  }
  const email = input.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }
  const { users } = ensureAuthStore();
  return users.users.find(user => user.email?.trim().toLowerCase() === email) ?? null;
}
