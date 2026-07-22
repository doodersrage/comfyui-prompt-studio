import { normalizeSafeHttpUrl, getComfyUiAllowedHosts } from "./url-safety";

let poolIndex = 0;

/**
 * Structurally compatible with `ComfyUiPoolEndpointHealth` from service-health.ts
 * (and `ComfyUiHealth`) — callers can pass those results straight through without
 * an import (keeps this module free of a circular dependency on service-health).
 */
export type ComfyUiPoolEndpointStat = {
  url: string;
  ok?: boolean;
  vram?: { free?: number; total?: number };
  queuePending?: number;
  queueRunning?: number;
};

/** Each queued/running job penalizes score by this many "free GB equivalent" units. */
const QUEUE_LOAD_PENALTY_GB = 2;

function normalizeUrlForCompare(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Score a pool endpoint by free VRAM (higher is better) minus a queue-load
 * penalty. Returns null when the endpoint is unhealthy or has no usable VRAM
 * reading, so callers can skip it and fall back to round-robin.
 */
export function scoreComfyUiPoolEndpointStat(
  stat: ComfyUiPoolEndpointStat,
): number | null {
  if (stat.ok === false) {
    return null;
  }
  const free = stat.vram?.free;
  if (typeof free !== "number" || !Number.isFinite(free)) {
    return null;
  }
  const freeGb = free / 1e9;
  const queueLoad = (stat.queuePending ?? 0) + (stat.queueRunning ?? 0) * 2;
  return freeGb - queueLoad * QUEUE_LOAD_PENALTY_GB;
}

/**
 * Picks the pool URL with the highest free-VRAM / lowest-queue score among
 * `poolUrls`. Returns null when no stat matches a pool URL or none score.
 */
export function pickHighestScoringComfyUiEndpoint(
  poolUrls: string[],
  stats: ComfyUiPoolEndpointStat[],
): string | null {
  const byUrl = new Map(
    stats.map((stat) => [normalizeUrlForCompare(stat.url), stat] as const),
  );

  let best: { url: string; score: number } | null = null;
  for (const url of poolUrls) {
    const stat = byUrl.get(normalizeUrlForCompare(url));
    if (!stat) {
      continue;
    }
    const score = scoreComfyUiPoolEndpointStat(stat);
    if (score == null) {
      continue;
    }
    if (!best || score > best.score) {
      best = { url, score };
    }
  }
  return best?.url ?? null;
}

type PoolStatsCacheEntry = { at: number; stats: ComfyUiPoolEndpointStat[] };
let poolStatsCache: PoolStatsCacheEntry | null = null;
/** How long a cached pool health snapshot stays usable for VRAM-aware picks. */
const POOL_STATS_CACHE_TTL_MS = 15_000;
/** Avoid piling up concurrent background refreshes when the cache is stale. */
let poolStatsRefreshInFlight = false;

/** Remembers the most recent pool health snapshot (e.g. from `checkComfyUiPoolHealth`). */
export function setComfyUiPoolStatsCache(stats: ComfyUiPoolEndpointStat[]): void {
  poolStatsCache = { at: Date.now(), stats };
}

/** Returns the cached pool stats when still fresh, or null otherwise. */
export function getComfyUiPoolStatsCache(
  maxAgeMs = POOL_STATS_CACHE_TTL_MS,
): ComfyUiPoolEndpointStat[] | null {
  if (!poolStatsCache) {
    return null;
  }
  if (Date.now() - poolStatsCache.at > maxAgeMs) {
    return null;
  }
  return poolStatsCache.stats;
}

/** Test-only: reset the module-level pool stats cache between test runs. */
export function resetComfyUiPoolStatsCacheForTests(): void {
  poolStatsCache = null;
  poolStatsRefreshInFlight = false;
}

/**
 * Best-effort, non-blocking refresh of pool health so the next VRAM-aware pick
 * has fresher data. Never awaited by callers — failures are swallowed.
 */
function refreshComfyUiPoolStatsInBackground(pool: string[]): void {
  if (poolStatsRefreshInFlight || pool.length === 0) {
    return;
  }
  poolStatsRefreshInFlight = true;

  void Promise.all(
    pool.map(async (url): Promise<ComfyUiPoolEndpointStat> => {
      try {
        const response = await fetch(`${url}/system_stats`, {
          signal: AbortSignal.timeout(3000),
          redirect: "manual",
        });
        if (!response.ok) {
          return { url, ok: false };
        }
        const stats = (await response.json()) as {
          system?: { vram?: { free?: number; total?: number } };
        };
        return { url, ok: true, vram: stats.system?.vram };
      } catch {
        return { url, ok: false };
      }
    }),
  )
    .then((stats) => setComfyUiPoolStatsCache(stats))
    .catch(() => {})
    .finally(() => {
      poolStatsRefreshInFlight = false;
    });
}

export function parseComfyUiPool(): string[] {
  const raw = process.env.COMFYUI_POOL?.trim();
  if (!raw) {
    return [];
  }
  const allowedHosts = getComfyUiAllowedHosts();
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) =>
      normalizeSafeHttpUrl(entry, { allowPrivate: true, allowedHosts }),
    );
}

export function pickComfyUiFromPool(seed?: string): string | null {
  const pool = parseComfyUiPool();
  if (pool.length === 0) {
    return null;
  }
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return pool[hash % pool.length];
  }
  const url = pool[poolIndex % pool.length];
  poolIndex += 1;
  return url;
}

/**
 * VRAM-aware pool pick: prefers the healthy endpoint with the highest free
 * VRAM / lowest queue load using `stats` (or the last cached pool health
 * snapshot). Falls back to round-robin/hash pick (`pickComfyUiFromPool`) when
 * no usable stats are available — always kicking off a best-effort background
 * refresh so the next call has fresher data.
 */
export function pickComfyUiFromPoolVramAware(input?: {
  seed?: string;
  stats?: ComfyUiPoolEndpointStat[] | null;
}): string | null {
  const pool = parseComfyUiPool();
  if (pool.length === 0) {
    return null;
  }

  const stats = input?.stats ?? getComfyUiPoolStatsCache();
  if (stats && stats.length > 0) {
    const best = pickHighestScoringComfyUiEndpoint(pool, stats);
    if (best) {
      return best;
    }
  }

  if (!input?.stats) {
    refreshComfyUiPoolStatsInBackground(pool);
  }

  return pickComfyUiFromPool(input?.seed);
}

/**
 * When a preferred pool host is configured, return it if it appears in the pool
 * and is healthy-ish (unknown health or `ok !== false`). Unhealthy preferred
 * hosts are skipped so VRAM-aware / round-robin can take over.
 */
export function resolvePreferredComfyUiHost(input: {
  preferredComfyHost?: string;
  poolUrls?: string[];
  poolStats?: ComfyUiPoolEndpointStat[] | null;
}): string | null {
  const preferred = input.preferredComfyHost?.trim();
  if (!preferred) {
    return null;
  }
  const pool = input.poolUrls ?? parseComfyUiPool();
  if (pool.length === 0) {
    return null;
  }
  const preferredNorm = normalizeUrlForCompare(preferred);
  const match = pool.find((url) => normalizeUrlForCompare(url) === preferredNorm);
  if (!match) {
    return null;
  }
  const stats = input.poolStats ?? getComfyUiPoolStatsCache();
  if (!stats || stats.length === 0) {
    return match;
  }
  const stat = stats.find(
    (entry) => normalizeUrlForCompare(entry.url) === preferredNorm,
  );
  if (stat && stat.ok === false) {
    return null;
  }
  return match;
}

export function resolveComfyUiUrlWithPool(input: {
  userUrl?: string;
  clientUrl?: string;
  envUrl: string;
  routingSeed?: string;
  /** VRAM/queue snapshot to prefer over round-robin (falls back to the last cached one). */
  poolStats?: ComfyUiPoolEndpointStat[] | null;
  /** Preferred pool host from SharedToolSettings — wins when in-pool and healthy-ish. */
  preferredComfyHost?: string;
}): string {
  if (input.userUrl?.trim()) {
    return input.userUrl.trim();
  }
  if (input.clientUrl?.trim()) {
    return input.clientUrl.trim();
  }
  const preferred = resolvePreferredComfyUiHost({
    preferredComfyHost: input.preferredComfyHost,
    poolStats: input.poolStats,
  });
  if (preferred) {
    return preferred;
  }
  const pooled = pickComfyUiFromPoolVramAware({
    seed: input.routingSeed,
    stats: input.poolStats,
  });
  if (pooled) {
    return pooled;
  }
  return input.envUrl;
}
