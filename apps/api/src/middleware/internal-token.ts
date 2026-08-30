import type { MiddlewareHandler } from 'hono';

/**
 * Service-to-service auth for /api/internal/*: a single bearer token shared by
 * Terraform with the api and brain tasks. With Service Connect on (story 4.7)
 * the brain reaches us over the VPC-private name and `edgeBlocked` is true:
 * any request carrying CloudFront's X-Origin-Verify header came through the
 * public edge and is refused outright, token or no token, so these routes are
 * unreachable from the internet. With `edgeBlocked` false (dev compose, and
 * the pre-cutover window) the token alone is the boundary, as before.
 * Compared in constant time; an unset token answers 503 so a half-configured
 * environment is loud; neither header is ever logged.
 */
export function requireInternalToken(
  token: string,
  { edgeBlocked = false }: { edgeBlocked?: boolean } = {},
): MiddlewareHandler {
  const expected = new TextEncoder().encode(token);
  return async (c, next) => {
    if (!token) return c.json({ error: 'Internal API not configured' }, 503);
    if (edgeBlocked && c.req.header('x-origin-verify') !== undefined) {
      return c.json({ error: 'Forbidden' }, 401);
    }
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
