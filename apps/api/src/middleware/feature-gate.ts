import type { MiddlewareHandler } from 'hono';
import type { FeatureFlagService, FlagKey } from '@joice/core';

/**
 * Closes a public route while its feature flag is off.
 *
 * Reads the same ~30s in-memory cache that serves GET /api/flags, so flipping
 * a flag in /admin/flags shuts the endpoints within that window without a
 * deploy. Answers 404 rather than 403: while the flag is off the feature does
 * not exist, and the message is safe to surface verbatim in a form. Fails
 * closed: a flag that is missing (deleted in admin) reads as off.
 */
export function requireFlag(
  flags: Pick<FeatureFlagService, 'evaluateAll'>,
  key: FlagKey,
  message = 'Not available right now.',
): MiddlewareHandler {
  return async (c, next) => {
    const enabled = (await flags.evaluateAll())[key] === true;
    if (!enabled) return c.json({ error: message }, 404);
    return next();
  };
}
