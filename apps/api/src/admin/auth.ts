import type { MiddlewareHandler } from 'hono';
import { getAuth } from '@hono/clerk-auth';

/**
 * Claims we add via Clerk's session-token customization
 * (Dashboard → Sessions → `{ "metadata": "{{user.public_metadata}}" }`).
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
 * Requires a verified Clerk session (via clerkMiddleware) whose publicMetadata
 * role is `admin`. 401 when unauthenticated, 403 when authenticated but not admin.
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
