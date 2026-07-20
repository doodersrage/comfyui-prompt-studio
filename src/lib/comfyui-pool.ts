import { normalizeSafeHttpUrl, getComfyUiAllowedHosts } from "./url-safety";

let poolIndex = 0;

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

export function resolveComfyUiUrlWithPool(input: {
  userUrl?: string;
  clientUrl?: string;
  envUrl: string;
  routingSeed?: string;
}): string {
  if (input.userUrl?.trim()) {
    return input.userUrl.trim();
  }
  if (input.clientUrl?.trim()) {
    return input.clientUrl.trim();
  }
  const pooled = pickComfyUiFromPool(input.routingSeed);
  if (pooled) {
    return pooled;
  }
  return input.envUrl;
}
