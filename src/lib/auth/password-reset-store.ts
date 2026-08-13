import { randomBytes } from 'node:crypto';
import { hashPassword } from './password';
import { findUserByUsername, saveUsers, ensureAuthStore } from './store';
import { loadPasswordResetTokens, savePasswordResetTokens } from '@/lib/sqlite/tables';

function hashToken(token: string): string {
  return hashPassword(token);
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
