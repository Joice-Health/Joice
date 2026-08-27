import type { MiddlewareHandler } from 'hono';
import { getAuth } from '@hono/clerk-auth';

/**
 * Admin authorization for the brain's own admin surface (the eval console).
 * A copy of apps/api/src/admin/auth.ts, not an import: a cross-service
 * import would couple the two deployables, and the file is small enough
 * that the coupling would cost more than the duplication.
 *
 * Relies on the app-level clerkMiddleware already mounted on /api/brain/*
 * (networkless via CLERK_JWT_KEY); this only authorizes. The role rides the
 * session-token metadata claim, the same customization the api checks
 * (Dashboard, Sessions, `{ "metadata": "{{user.public_metadata}}" }`).
 */
interface SessionMetadataClaims {
  metadata?: { role?: string };
  email?: string;
}

/** Context variables set for admin route handlers. */
export interface AdminVariables {
  adminUserId: string;
  adminEmail?: string;
}

export type AdminEnv = { Variables: AdminVariables };

/**
 * Requires a verified Clerk session whose publicMetadata role is `admin`.
 * 401 when unauthenticated, 403 when authenticated but not admin.
 */
export const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const claims = auth.sessionClaims as SessionMetadataClaims | undefined;
  if (claims?.metadata?.role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }

  c.set('adminUserId', auth.userId);
  c.set('adminEmail', claims.email);
  return next();
};
