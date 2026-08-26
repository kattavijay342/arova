/**
 * Basic in-memory sliding-window rate limiter for API routes.
 *
 * Scope: intentionally simple ("basic rate limiting"), not a distributed
 * limiter — on a multi-instance deployment (e.g. Vercel with multiple
 * serverless instances) each instance keeps its own counts, so the
 * effective limit is "N requests per window per instance", not a hard
 * global cap. That's an acceptable tradeoff for abuse protection at this
 * stage; swap in a shared store (Upstash Redis, etc.) if a hard global
 * limit is ever required.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

const buckets = new Map<string, Bucket>();

// Periodically forget expired buckets so this Map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();

/** Returns { ok: false } once `key` has been called more than `limit` times within `windowMs`. */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  return { ok: true, retryAfterSeconds: 0 };
}
