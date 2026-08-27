import type { MiddlewareHandler } from 'hono';
import { verifyToken } from '@clerk/backend';

/**
 * Verifies a Clerk bearer token when the browser sends one and exposes the
 * session-token claims to downstream middleware. Without a token, or with one
 * that fails verification, the request proceeds anonymously; whether anonymous
 * is acceptable stays with the routes (requireAdmin answers 401, the requester
 * simply has no member id).
 *
 * Deliberately not @hono/clerk-auth: that wrapper throws "Missing Clerk Secret
 * key" on every request unless it holds the Clerk SECRET key, even when handed
 * the public JWT key for networkless verification. This task cannot read the
 * secret by design (infra/brain.tf, infra/iam.tf), which made every tokened
 * request 500 in production while local dev, where compose provides the
 * secret as a fallback, worked. verifyToken is the SDK primitive underneath
 * the wrapper and is satisfied with the public key alone.
 */

/**
 * The session-token claims the brain reads. `sub` is the Clerk user id; the
 * rest comes from the session-token customization (Clerk Dashboard, Sessions,
 * `{ "metadata": "{{user.public_metadata}}" }`) and is typed unknown because
 * a token can carry anything: every reader narrows before trusting.
 */
export interface BrainSessionClaims {
  sub: string;
  email?: unknown;
  metadata?: { role?: unknown; memberId?: unknown };
}

export interface ClerkAuthVariables {
  clerkClaims: BrainSessionClaims | null;
}

/**
 * app.ts wires the keys from env: the JWT public key in real environments,
 * the secret key only as the local-dev fallback env.ts describes. This module
 * deliberately does not import env so tests stay environment-free.
 */
export function createClerkAuth(keys: {
  jwtKey?: string;
  secretKey?: string;
}): MiddlewareHandler<{ Variables: ClerkAuthVariables }> {
  const options = keys.jwtKey ? { jwtKey: keys.jwtKey } : { secretKey: keys.secretKey ?? '' };
  const configured = Boolean(keys.jwtKey || keys.secretKey);

  return async (c, next) => {
    c.set('clerkClaims', null);
    const token = c.req.header('authorization')?.match(/^Bearer +(\S+)$/i)?.[1];
    if (token && configured) {
      try {
        const payload = await verifyToken(token, options);
        if (typeof payload.sub === 'string' && payload.sub) {
          c.set('clerkClaims', payload as unknown as BrainSessionClaims);
        }
      } catch {
        // Expired, forged or foreign token: anonymous, never a 500.
      }
    }
    return next();
  };
}
