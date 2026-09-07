import { Hono } from 'hono';
import { z } from 'zod';
import type { WaitlistService } from '@joice/core';
import { requireAttentiveSignature } from '../middleware/attentive-signature';

/**
 * Attentive's consent webhook (docs/marketing/01-attentive.md, "The inbound
 * webhook"). Mounted OUTSIDE the typed chain: not a browser API. Only the four
 * consent events on a marketing subscription apply; everything else that is
 * signed and parseable answers 200 so Attentive never retries what we chose to
 * ignore. Payloads carry no event id, so the change is applied idempotently by
 * its timestamp. Nothing here logs an email.
 */

/** The subset of the payload we read; everything else passes through unread. */
export const attentiveWebhookEventSchema = z
  .object({
    type: z.string().min(1).max(100),
    /** Unix milliseconds. */
    timestamp: z.coerce.number().optional(),
    subscriber: z
      .object({
        // Attentive sends "" for an absent identifier; treat it as absent.
        email: z.preprocess(
          (value) => (value === '' ? null : value),
          z.string().trim().toLowerCase().email().nullish(),
        ),
        phone: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    subscription: z.object({ type: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough();

/** Event type to the consent it reports; anything else is ignored. */
const CONSENT_EVENTS: Record<string, boolean | undefined> = {
  'email.subscribed': true,
  'sms.subscribed': true,
  'email.unsubscribed': false,
  'sms.unsubscribed': false,
};

export function createAttentiveWebhookRoutes(deps: {
  secret: string;
  consent: Pick<WaitlistService, 'applyMarketingConsent'>;
}) {
  return new Hono().use('*', requireAttentiveSignature(deps.secret)).post('/', async (c) => {
    let body: unknown;
    try {
      body = JSON.parse(await c.req.text());
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    const parsed = attentiveWebhookEventSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Unrecognised payload' }, 400);

    const event = parsed.data;
    const subscribed = CONSENT_EVENTS[event.type];
    const email = event.subscriber?.email;
    const marketing = !event.subscription?.type || event.subscription.type === 'MARKETING';
    if (subscribed === undefined || !email || !marketing) {
      return c.json({ received: true, applied: false });
    }

    const at = event.timestamp ? new Date(event.timestamp) : new Date();
    const { matched } = await deps.consent.applyMarketingConsent({ email, subscribed, at });
    console.log(`[webhooks/attentive] ${event.type} applied=${matched}`);
    return c.json({ received: true, applied: matched });
  });
}
