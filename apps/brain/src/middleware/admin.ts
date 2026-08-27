import type { MiddlewareHandler } from 'hono';
import type { ClerkAuthVariables } from './clerk';

/**
 * Admin authorization for the brain's own admin surface (the eval console).
 * A copy of apps/api/src/admin/auth.ts in spirit, not an import: a
 * cross-service import would couple the two deployables, and the file is
 * small enough that the coupling would cost more than the duplication.
 *
 * Relies on the app-level `clerkAuth` middleware (./clerk.ts) already mounted
 * on /api/brain/*, which verifies the bearer token networklessly with the
 * public JWT key; this only authorizes. The role rides the session-token
 * metadata claim, the same customization the api checks (Dashboard, Sessions,
 * `{ "metadata": "{{user.public_metadata}}" }`).
 */

/** Context variables set for admin route handlers. */
export interface AdminVariables {
  adminUserId: string;
  adminEmail?: string;
}

export type AdminEnv = { Variables: AdminVariables & ClerkAuthVariables };

/**
 * Requires a verified Clerk session whose publicMetadata role is `admin`.
 * 401 when unauthenticated, 403 when authenticated but not admin.
 */
export const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const claims = c.get('clerkClaims');
  if (!claims?.sub) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  if (claims.metadata?.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  c.set('adminUserId', claims.sub);
  c.set('adminEmail', typeof claims.email === 'string' ? claims.email : undefined);
  return next();
};
