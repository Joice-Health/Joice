import type { MiddlewareHandler } from 'hono';
import { ATTENTIVE_SIGNATURE_HEADER, verifyAttentiveWebhook } from '@joice/marketing';

/**
 * Attentive signs every webhook delivery with the webhook's signing key:
 * `x-attentive-hmac-sha256` is the hex HMAC-SHA256 of the raw body. It is
 * verified over the raw text before anything parses it (Hono caches the body,
 * so the handler's own read returns the same string). An unset secret answers
 * 503 so a half-configured environment is loud; a bad or missing signature is
 * 401; the header is never logged.
 */
export function requireAttentiveSignature(secret: string): MiddlewareHandler {
  return async (c, next) => {
    if (!secret) return c.json({ error: 'Attentive webhook not configured' }, 503);
    const raw = await c.req.text();
    const valid = await verifyAttentiveWebhook(secret, raw, c.req.header(ATTENTIVE_SIGNATURE_HEADER));
    if (!valid) return c.json({ error: 'Invalid signature' }, 401);
    return next();
  };
}
