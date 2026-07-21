import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CachedViewImage = {
  buffer: Buffer;
  contentType: string;
};

export type ViewCacheFormat = "jpeg" | "webp" | "avif";

type MemoryEntry = CachedViewImage & { expiresAt: number };

const MEMORY_LIMIT = 80;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const memory = new Map<string, MemoryEntry>();

function cacheRoot(): string {
  const dataDir = process.env.PROMPT_DATA_DIR?.trim();
  if (dataDir) {
    return path.join(path.resolve(dataDir), "comfy-view-cache");
  }
  return path.join(os.tmpdir(), "comfyui-prompt-studio-view-cache");
}

export function buildViewCacheKey(input: {
  comfyUrl: string;
  filename: string;
  subfolder: string;
  type: string;
  width: number;
  format: ViewCacheFormat;
}): string {
  return crypto
    .createHash("sha1")
    .update(
      [
        input.comfyUrl.replace(/\/+$/, ""),
        input.filename,
        input.subfolder,
        input.type,
        String(input.width),
        input.format,
      ].join("\0"),
    )
    .digest("hex");
}

function diskPaths(key: string, format: ViewCacheFormat): {
  filePath: string;
  metaPath: string;
} {
  const root = cacheRoot();
  const shard = key.slice(0, 2);
  const dir = path.join(root, shard);
  return {
    filePath: path.join(dir, `${key}.${format}`),
    metaPath: path.join(dir, `${key}.json`),
  };
}

function touchMemory(key: string, entry: MemoryEntry): void {
  memory.delete(key);
  memory.set(key, entry);
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (!oldest) {
      break;
    }
    memory.delete(oldest);
  }
}

export function readViewCache(
  key: string,
  format: ViewCacheFormat,
  ttlMs = DEFAULT_TTL_MS,
): CachedViewImage | null {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expiresAt > now) {
    touchMemory(key, mem);
    return { buffer: mem.buffer, contentType: mem.contentType };
  }
  if (mem) {
    memory.delete(key);
  }

  try {
    const { filePath, metaPath } = diskPaths(key, format);
    const metaRaw = fs.readFileSync(metaPath, "utf8");
    const meta = JSON.parse(metaRaw) as { expiresAt?: number; contentType?: string };
    if (
      typeof meta.expiresAt !== "number" ||
      meta.expiresAt <= now ||
      typeof meta.contentType !== "string"
    ) {
      return null;
    }
    const buffer = fs.readFileSync(filePath);
    const entry: MemoryEntry = {
      buffer,
      contentType: meta.contentType,
      expiresAt: meta.expiresAt,
    };
    touchMemory(key, entry);
    return { buffer, contentType: meta.contentType };
  } catch {
    return null;
  }
}

export function writeViewCache(
  key: string,
  format: ViewCacheFormat,
  image: CachedViewImage,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const expiresAt = Date.now() + ttlMs;
  touchMemory(key, { ...image, expiresAt });

  try {
    const { filePath, metaPath } = diskPaths(key, format);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, image.buffer);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ expiresAt, contentType: image.contentType }),
    );
  } catch {
    // Best-effort disk cache; memory entry already stored.
  }
}

export function negotiateViewFormat(acceptHeader: string | null): ViewCacheFormat {
  const accept = (acceptHeader ?? "").toLowerCase();
  if (accept.includes("image/avif")) {
    return "avif";
  }
  if (accept.includes("image/webp")) {
    return "webp";
  }
  return "jpeg";
}

export function contentTypeForViewFormat(format: ViewCacheFormat): string {
  if (format === "avif") {
    return "image/avif";
  }
  if (format === "webp") {
    return "image/webp";
  }
  return "image/jpeg";
}
