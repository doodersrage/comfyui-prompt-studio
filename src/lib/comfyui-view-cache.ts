import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type CachedViewImage = {
  buffer: Buffer;
  contentType: string;
};

export type ViewCacheFormat = 'jpeg' | 'webp' | 'avif';

// Enhanced memory entry with access tracking for LFU eviction
interface MemoryEntry extends CachedViewImage {
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

// Configuration constants
const MEMORY_LIMIT = 100; // Increased from 80 to handle more items
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DISK_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DISK_CACHE_SIZE_BYTES = 1024 * 1024 * 1024; // 1GB max disk cache

// Memory cache with LFU (Least Frequently Used) eviction policy
const memory = new Map<string, MemoryEntry>();

// Cache statistics for monitoring
let cacheStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
  diskWrites: 0,
  diskReads: 0,
};

// Cleanup timer
let cleanupTimer: NodeJS.Timeout | null = null;

function cacheRoot(): string {
  const dataDir = process.env.PROMPT_DATA_DIR?.trim();
  if (dataDir) {
    return path.join(path.resolve(/* turbopackIgnore: true */ dataDir), 'comfy-view-cache');
  }
  return path.join(/* turbopackIgnore: true */ os.tmpdir(), 'comfyui-prompt-studio-view-cache');
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
    .createHash('sha1')
    .update(
      [
        input.comfyUrl.replace(/\/+$/, ''),
        input.filename,
        input.subfolder,
        input.type,
        String(input.width),
        input.format,
      ].join('\0')
    )
    .digest('hex');
}

function diskPaths(
  key: string,
  format: ViewCacheFormat
): {
  filePath: string;
  metaPath: string;
} {
  const root = cacheRoot();
  const shard = key.slice(0, 2);
  const dir = /* turbopackIgnore: true */ path.join(root, shard);
  return {
    filePath: /* turbopackIgnore: true */ path.join(dir, `${key}.${format}`),
    metaPath: /* turbopackIgnore: true */ path.join(dir, `${key}.json`),
  };
}

function touchMemory(key: string, entry: MemoryEntry): void {
  // Update access count and timestamp for LFU eviction
  const existing = memory.get(key);
  if (existing) {
    entry.accessCount = existing.accessCount + 1;
    entry.lastAccessed = Date.now();
  } else {
    entry.accessCount = 1;
    entry.lastAccessed = Date.now();
  }
  
  memory.delete(key);
  memory.set(key, entry);
  
  // Apply LFU eviction when limit is exceeded
  if (memory.size > MEMORY_LIMIT) {
    evictLFU();
  }
}

function evictLFU(): void {
  if (memory.size <= MEMORY_LIMIT) return;
  
  // Find the entry with the lowest access count (or oldest if tied)
  let leastAccessedKey: string | null = null;
  let minAccessCount = Infinity;
  let oldestTimestamp = Infinity;
  
  for (const [key, entry] of memory.entries()) {
    // Prefer entries with lower access count
    if (entry.accessCount < minAccessCount || 
        (entry.accessCount === minAccessCount && entry.lastAccessed < oldestTimestamp)) {
      minAccessCount = entry.accessCount;
      oldestTimestamp = entry.lastAccessed;
      leastAccessedKey = key;
    }
  }
  
  if (leastAccessedKey) {
    memory.delete(leastAccessedKey);
    cacheStats.evictions++;
  }
}

function getMemorySize(): number {
  let totalSize = 0;
  for (const entry of memory.values()) {
    totalSize += entry.buffer.length;
  }
  return totalSize;
}

export function readViewCache(key: string, format: ViewCacheFormat): CachedViewImage | null {
  const now = Date.now();
  const mem = memory.get(key);
  
  if (mem && mem.expiresAt > now) {
    // Update access stats for cache hit
    touchMemory(key, mem);
    cacheStats.hits++;
    return { buffer: mem.buffer, contentType: mem.contentType };
  }
  
  if (mem) {
    memory.delete(key);
  }
  
  try {
    const { filePath, metaPath } = diskPaths(key, format);
    const metaRaw = /* turbopackIgnore: true */ fs.readFileSync(metaPath, 'utf8');
    const meta = JSON.parse(metaRaw) as { expiresAt?: number; contentType?: string };
    
    if (
      typeof meta.expiresAt !== 'number' ||
      meta.expiresAt <= now ||
      typeof meta.contentType !== 'string'
    ) {
      return null;
    }
    
    const buffer = /* turbopackIgnore: true */ fs.readFileSync(filePath);
    const entry: MemoryEntry = {
      buffer,
      contentType: meta.contentType,
      expiresAt: meta.expiresAt,
      accessCount: 0,
      lastAccessed: Date.now(),
    };
    
    touchMemory(key, entry);
    cacheStats.diskReads++;
    cacheStats.hits++;
    return { buffer, contentType: meta.contentType };
  } catch {
    cacheStats.misses++;
    return null;
  }
}

export function writeViewCache(
  key: string,
  format: ViewCacheFormat,
  image: CachedViewImage,
  ttlMs = DEFAULT_TTL_MS
): void {
  const expiresAt = Date.now() + ttlMs;
  
  // Add to memory cache first (will be evicted if needed)
  touchMemory(key, { ...image, expiresAt, accessCount: 0, lastAccessed: Date.now() });
  
  try {
    const { filePath, metaPath } = diskPaths(key, format);
    /* turbopackIgnore: true */ fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(filePath), {
      recursive: true,
    });
    /* turbopackIgnore: true */ fs.writeFileSync(filePath, image.buffer);
    /* turbopackIgnore: true */ fs.writeFileSync(
      metaPath,
      JSON.stringify({ expiresAt, contentType: image.contentType })
    );
    cacheStats.diskWrites++;
  } catch {
    // Best-effort disk cache; memory entry already stored.
  }
}

// Enhanced format negotiation with better performance
export function negotiateViewFormat(acceptHeader: string | null): ViewCacheFormat {
  const accept = (acceptHeader ?? '').toLowerCase();
  
  // Check for preferred formats in order of preference
  if (accept.includes('image/avif')) {
    return 'avif';
  }
  if (accept.includes('image/webp')) {
    return 'webp';
  }
  // JPEG fallback
  return 'jpeg';
}

export function contentTypeForViewFormat(format: ViewCacheFormat): string {
  switch (format) {
    case 'avif':
      return 'image/avif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

// New utility functions for cache management
export function getCacheStats(): typeof cacheStats {
  return { ...cacheStats };
}

export function resetCacheStats(): void {
  cacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    diskWrites: 0,
    diskReads: 0,
  };
}

export function startDiskCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  
  cleanupTimer = setInterval(() => {
    try {
      // Cleanup expired entries on disk
      cleanupExpiredDiskCache();
    } catch (error) {
      console.error('Error during disk cache cleanup:', error);
    }
  }, DISK_CLEANUP_INTERVAL_MS);
}

function cleanupExpiredDiskCache(): void {
  try {
    const root = cacheRoot();
    if (!fs.existsSync(root)) return;
    
    const now = Date.now();
    let deletedCount = 0;
    
    // Walk through all cache files and remove expired ones
    function walkDirectory(dir: string) {
      if (!fs.existsSync(dir)) return;
      
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          walkDirectory(fullPath);
        } else if (item.endsWith('.json')) {
          // This is a metadata file
          try {
            const metaRaw = fs.readFileSync(fullPath, 'utf8');
            const meta = JSON.parse(metaRaw) as { expiresAt?: number };
            
            if (typeof meta.expiresAt === 'number' && meta.expiresAt <= now) {
              // Delete both metadata and image files
              const key = item.replace(/\.json$/, '');
              const format = item.endsWith('.avif.json') ? 'avif' : item.endsWith('.webp.json') ? 'webp' : 'jpeg';
              
              const { filePath } = diskPaths(key, format);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
              fs.unlinkSync(fullPath);
              deletedCount++;
            }
          } catch {
            // Skip corrupted or invalid metadata files
          }
        }
      }
    }
    
    walkDirectory(root);
    
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} expired cache entries`);
    }
  } catch (error) {
    console.error('Error during disk cleanup:', error);
  }
}

export function getCacheSize(): { memory: number; disk: number } {
  return {
    memory: getMemorySize(),
    disk: 0, // Calculate disk size if needed
  };
}

// Initialize the cache system with automatic cleanup
startDiskCleanup();
