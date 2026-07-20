import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./password";
import { findUserByUsername, saveUsers, ensureAuthStore } from "./store";

type PasswordResetToken = {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
};

type PasswordResetDocument = {
  version: 1;
  tokens: PasswordResetToken[];
};

function resetPath(): string {
  const base =
    process.env.PROMPT_AUTH_DIR?.trim() ||
    (process.env.PROMPT_DATA_DIR?.trim()
      ? path.join(process.env.PROMPT_DATA_DIR.trim(), "auth")
      : path.join(process.cwd(), ".prompt-studio-data", "auth"));
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "password-reset-tokens.json");
}

function readDoc(): PasswordResetDocument {
  try {
    return JSON.parse(fs.readFileSync(resetPath(), "utf8")) as PasswordResetDocument;
  } catch {
    return { version: 1, tokens: [] };
  }
}

function writeDoc(doc: PasswordResetDocument): void {
  fs.writeFileSync(resetPath(), JSON.stringify(doc, null, 2), "utf8");
}

function hashToken(token: string): string {
  return hashPassword(token);
}

export function createPasswordResetToken(userId: string): string {
  const token = randomBytes(32).toString("hex");
  const doc = readDoc();
  const now = Date.now();
  doc.tokens = doc.tokens.filter((entry) => entry.expiresAt > now && entry.userId !== userId);
  doc.tokens.push({
    userId,
    tokenHash: hashToken(token),
    expiresAt: now + 60 * 60 * 1000,
    createdAt: now,
  });
  writeDoc(doc);
  return token;
}

export function consumePasswordResetToken(
  token: string,
  newPassword: string,
): { ok: true; username: string } | { ok: false; error: string } {
  const trimmed = token.trim();
  if (!trimmed || newPassword.trim().length < 6) {
    return { ok: false, error: "Invalid token or password too short." };
  }

  const doc = readDoc();
  const now = Date.now();
  const tokenHash = hashToken(trimmed);
  const index = doc.tokens.findIndex(
    (entry) => entry.tokenHash === tokenHash && entry.expiresAt > now,
  );
  if (index < 0) {
    return { ok: false, error: "Reset link expired or invalid." };
  }

  const { userId } = doc.tokens[index]!;
  const { users } = ensureAuthStore();
  const userIndex = users.users.findIndex((user) => user.id === userId);
  if (userIndex < 0) {
    return { ok: false, error: "User not found." };
  }

  users.users[userIndex] = {
    ...users.users[userIndex]!,
    passwordHash: hashPassword(newPassword.trim()),
    updatedAt: now,
  };
  saveUsers(users.users);
  doc.tokens = doc.tokens.filter((entry) => entry.userId !== userId);
  writeDoc(doc);

  return { ok: true, username: users.users[userIndex]!.username };
}

export function resolveUserForPasswordReset(input: {
  username?: string;
  email?: string;
}) {
  const username = input.username?.trim();
  if (username) {
    return findUserByUsername(username);
  }
  const email = input.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }
  const { users } = ensureAuthStore();
  return users.users.find((user) => user.email?.trim().toLowerCase() === email) ?? null;
}
