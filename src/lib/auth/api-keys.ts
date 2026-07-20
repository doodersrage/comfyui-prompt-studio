import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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

type ApiKeysDocument = {
  version: 1;
  keys: UserApiKey[];
};

function keysPath(): string {
  const base =
    process.env.PROMPT_AUTH_DIR?.trim() ||
    process.env.PROMPT_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".prompt-studio-data");
  const dir = path.join(base, "auth");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "api-keys.json");
}

function readDoc(): ApiKeysDocument {
  try {
    return JSON.parse(fs.readFileSync(keysPath(), "utf8")) as ApiKeysDocument;
  } catch {
    return { version: 1, keys: [] };
  }
}

function writeDoc(doc: ApiKeysDocument): void {
  fs.writeFileSync(keysPath(), JSON.stringify(doc, null, 2), "utf8");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createUserApiKey(input: {
  userId: string;
  label: string;
}): { key: UserApiKey; token: string } {
  const doc = readDoc();
  const raw = randomBytes(24).toString("base64url");
  const token = `pt_${raw}`;
  const prefix = token.slice(0, 10);
  const entry: UserApiKey = {
    id: `key-${randomBytes(8).toString("hex")}`,
    userId: input.userId,
    label: input.label.trim() || "API key",
    prefix,
    hash: hashToken(token),
    createdAt: Date.now(),
    enabled: true,
  };
  doc.keys.unshift(entry);
  writeDoc(doc);
  return { key: entry, token };
}

export function listUserApiKeys(userId: string): UserApiKey[] {
  return readDoc().keys.filter((key) => key.userId === userId);
}

export function revokeUserApiKey(userId: string, keyId: string): boolean {
  const doc = readDoc();
  const index = doc.keys.findIndex((key) => key.id === keyId && key.userId === userId);
  if (index < 0) {
    return false;
  }
  doc.keys.splice(index, 1);
  writeDoc(doc);
  return true;
}

export function resolveUserIdFromApiKey(token: string | undefined | null): string | null {
  if (!token?.startsWith("pt_")) {
    return null;
  }
  const hash = hashToken(token);
  const doc = readDoc();
  const match = doc.keys.find((key) => {
    if (!key.enabled) {
      return false;
    }
    const left = Buffer.from(key.hash);
    const right = Buffer.from(hash);
    return left.length === right.length && timingSafeEqual(left, right);
  });
  if (!match) {
    return null;
  }
  match.lastUsedAt = Date.now();
  writeDoc(doc);
  return match.userId;
}
