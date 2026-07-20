type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSec: number };

function getLimits(): { windowMs: number; max: number } {
  const max = Number(process.env.API_RATE_LIMIT_MAX ?? "120");
  const windowSec = Number(process.env.API_RATE_LIMIT_WINDOW_SEC ?? "60");
  return {
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : 120,
    windowMs: Number.isFinite(windowSec) && windowSec > 0 ? windowSec * 1000 : 60_000,
  };
}

export function checkRateLimit(
  key: string,
  route = "api",
  maxOverride?: number,
): RateLimitResult {
  const { max: envMax, windowMs } = getLimits();
  const max =
    maxOverride && maxOverride > 0 ? Math.floor(maxOverride) : envMax;
  const bucketKey = `${route}:${key}`;
  const now = Date.now();
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
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "local";
}
