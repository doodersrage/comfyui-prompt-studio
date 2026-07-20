import fs from "node:fs";
import path from "node:path";
import { isServerStorageEnabled } from "./server-storage";

export type UserStorageNamespace = "settings-cache" | "prompt-history" | "comfy-gallery";

export const USER_STORAGE_NAMESPACES: UserStorageNamespace[] = [
  "settings-cache",
  "prompt-history",
  "comfy-gallery",
];

function dataDir(): string {
  const dir = process.env.PROMPT_DATA_DIR?.trim();
  if (!dir) {
    throw new Error("PROMPT_DATA_DIR is not configured.");
  }
  const resolved = path.resolve(dir);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function userFilePath(userId: string, namespace: UserStorageNamespace): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(dataDir(), "users", safeUserId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${namespace}.json`);
}

export function readUserServerStorage<T>(
  userId: string,
  namespace: UserStorageNamespace,
): T | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(userFilePath(userId, namespace), "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeUserServerStorage<T>(
  userId: string,
  namespace: UserStorageNamespace,
  data: T,
): void {
  if (!isServerStorageEnabled()) {
    throw new Error("Server storage is disabled. Set PROMPT_DATA_DIR.");
  }
  fs.writeFileSync(userFilePath(userId, namespace), JSON.stringify(data, null, 2), "utf8");
}

export function listUserExportFiles(userId: string): string[] {
  if (!isServerStorageEnabled()) {
    return [];
  }
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(dataDir(), "users", safeUserId, "exports");
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
}

export function writeUserExportSnapshot(
  userId: string,
  username: string,
  payload: Record<string, unknown>,
): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(dataDir(), "users", safeUserId, "exports");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}-${username.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filename;
}
