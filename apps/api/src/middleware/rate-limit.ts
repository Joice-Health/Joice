import type { MiddlewareHandler } from 'hono';
import { getConnInfo } from 'hono/bun';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window rate limiter. Sufficient for a single-instance
 * Phase 0 deployment; swap for a Redis-backed limiter when the API scales out.
 */
export function rateLimit(opts: { windowMs: number; max: number }): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  return async (c, next) => {
    const ip = clientIp(c);
    const now = Date.now();
    const bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + opts.windowMs });
    } else if (bucket.count >= opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests. Please slow down.' }, 429);
    } else {
      bucket.count += 1;
    }

    // Opportunistic cleanup to keep the map from growing unbounded.
    if (buckets.size > 10_000) {
      for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
    }

    return next();
  };
}

export function clientIp(c: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return getConnInfo(c).remote.address ?? 'unknown';
}
