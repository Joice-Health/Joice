import type { MiddlewareHandler } from 'hono';

/**
 * Service-to-service auth for /api/internal/*: a single bearer token shared by
 * Terraform with the api and brain tasks. Today the brain reaches us over the
 * public canonical URL (the only route between tasks; the ALB admits only
 * CloudFront), so these routes are internet-reachable and this token is the
 * boundary; the Service Connect story (4.7) makes them VPC-private and adds an
 * edge refusal. Compared in constant time; an unset token answers 503 so a
 * half-configured environment is loud; the header is never logged.
 */
export function requireInternalToken(token: string): MiddlewareHandler {
  const expected = new TextEncoder().encode(token);
  return async (c, next) => {
    if (!token) return c.json({ error: 'Internal API not configured' }, 503);
    const header = c.req.header('authorization') ?? '';
    const presented = new TextEncoder().encode(header.replace(/^Bearer\s+/i, ''));
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      return c.json({ error: 'Forbidden' }, 401);
    }
    return next();
  };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
