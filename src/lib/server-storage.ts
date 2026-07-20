import fs from "node:fs";
import path from "node:path";
import {
  STORAGE_NAMESPACES,
  type StorageNamespace,
} from "./storage-namespaces";

export type { StorageNamespace } from "./storage-namespaces";

const ALLOWED = STORAGE_NAMESPACES;

export function isServerStorageEnabled(): boolean {
  return Boolean(process.env.PROMPT_DATA_DIR?.trim());
}

function dataDir(): string {
  const dir = process.env.PROMPT_DATA_DIR?.trim();
  if (!dir) {
    throw new Error("PROMPT_DATA_DIR is not configured.");
  }
  const resolved = path.resolve(dir);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function filePath(namespace: StorageNamespace): string {
  if (!ALLOWED.includes(namespace)) {
    throw new Error(`Invalid storage namespace: ${namespace}`);
  }
  return path.join(dataDir(), `${namespace}.json`);
}

export function readServerStorage<T>(namespace: StorageNamespace): T | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath(namespace), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeServerStorage<T>(namespace: StorageNamespace, data: T): void {
  if (!isServerStorageEnabled()) {
    throw new Error("Server storage is disabled. Set PROMPT_DATA_DIR.");
  }
  fs.writeFileSync(filePath(namespace), JSON.stringify(data, null, 2), "utf8");
}

export function listServerStorageNamespaces(): StorageNamespace[] {
  return [...ALLOWED];
}
