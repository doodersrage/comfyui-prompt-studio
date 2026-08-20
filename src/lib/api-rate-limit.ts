type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// buckets never shrinks on its own — every distinct route:client-key pair that's
// ever seen a request stays in memory even after its window expires. That's fine
// at small scale, but on a long-running process with many distinct clients/routes
// (in particular the high-volume media routes, which key by IP + full path) it's
// unbounded growth. Sweep expired entries periodically rather than on every call,
// so normal request handling stays O(1) amortized.
const SWEEP_INTERVAL_CALLS = 500;
let callsSinceSweep = 0;

function sweepExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSec: number };

function getLimits(): { windowMs: number; max: number } {
  const max = Number(process.env.API_RATE_LIMIT_MAX ?? '120');
  const windowSec = Number(process.env.API_RATE_LIMIT_WINDOW_SEC ?? '60');
  return {
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : 120,
    windowMs: Number.isFinite(windowSec) && windowSec > 0 ? windowSec * 1000 : 60_000,
  };
}

export function checkRateLimit(key: string, route = 'api', maxOverride?: number): RateLimitResult {
  const { max: envMax, windowMs } = getLimits();
  const max = maxOverride && maxOverride > 0 ? Math.floor(maxOverride) : envMax;
  const bucketKey = `${route}:${key}`;
  const now = Date.now();

  callsSinceSweep += 1;
  if (callsSinceSweep >= SWEEP_INTERVAL_CALLS) {
    callsSinceSweep = 0;
    sweepExpiredBuckets(now);
  }

  const existing = buckets.get(bucketKey);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(bucketKey, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);
  return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt };
}

export function rateLimitClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return forwarded || realIp || 'local';
}

// Read-only image/video byte-serving routes (ComfyUI `/view`, gallery thumbs,
// other engine "view"/"preview" proxies). Every gallery thumbnail, hover
// preview, and lightbox open fires one of these, so a gallery page with a
// few dozen cards can burn through the general API budget in seconds even
// though each request is cheap and already cache-backed (see
// comfyui-view-cache.ts / Cache-Control headers). These routes get their own,
// much larger budget so normal gallery browsing never trips the limiter that
// exists to protect mutating/expensive API routes.
const HIGH_VOLUME_MEDIA_ROUTE =
  /^\/api\/(?:comfyui|openai|replicate|diffusers|gemini|fal|grok)\/(?:view|view-metadata|preview|model-preview)(?:\/|$)/;
const GALLERY_MEDIA_ROUTE = /^\/api\/gallery\/media\/(?!persist(?:\/|$))[^/]+\/?$/;

export function isHighVolumeMediaRoute(pathname: string): boolean {
  return HIGH_VOLUME_MEDIA_ROUTE.test(pathname) || GALLERY_MEDIA_ROUTE.test(pathname);
}

export function mediaRateLimitMax(): number {
  const raw = Number(process.env.API_RATE_LIMIT_MEDIA_MAX ?? '600');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 600;
}
