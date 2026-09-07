/**
 * Re-push waitlist entries whose marketing sync never succeeded, from a given
 * time on. Closes the switch-over gap (docs/marketing/00-plan.md, section 6)
 * and any outage: rows with `marketing_synced_at IS NULL` are exactly the
 * people Attentive does not fully have, and every call is safe to repeat
 * (attributes upsert, a repeat subscribe answers "previously created", events
 * dedupe on their externalEventId).
 *
 *   ATTENTIVE_API_KEY=... ATTENTIVE_SIGN_UP_SOURCE_ID=... DATABASE_URL=... \
 *     bun apps/api/scripts/attentive-resync.ts --since 2026-09-10T00:00:00Z
 *
 * `--since` is required on purpose: signups before the Attentive switch were
 * synced to Klaviyo and are not backfilled (decisions log). Sequential on
 * purpose too: the subscribe endpoint allows ten requests per second. Logs
 * carry entry ids only, never emails.
 */
import { z } from 'zod';
import { and, createDatabase, eq, gte, isNull, waitlistEntries } from '@joice/db';
import { createAttentiveMarketingAdapter, toWaitlistMarketingProfile } from '@joice/core';
import { AttentiveRequestError, createAttentiveClient } from '@joice/marketing';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    ATTENTIVE_API_KEY: z.string().min(1),
    ATTENTIVE_SIGN_UP_SOURCE_ID: z.string().min(1),
  })
  .parse(process.env);

const sinceIndex = process.argv.indexOf('--since');
const sinceArg = sinceIndex >= 0 ? process.argv[sinceIndex + 1] : undefined;
const since = sinceArg ? new Date(sinceArg) : undefined;
if (!since || Number.isNaN(since.getTime())) {
  console.error('Usage: bun apps/api/scripts/attentive-resync.ts --since <ISO date>');
  process.exit(1);
}

async function main(): Promise<void> {
  const db = createDatabase(env.DATABASE_URL);
  const port = createAttentiveMarketingAdapter(
    createAttentiveClient({ apiKey: env.ATTENTIVE_API_KEY }),
    { signUpSourceId: env.ATTENTIVE_SIGN_UP_SOURCE_ID },
  );

  const rows = await db
    .select()
    .from(waitlistEntries)
    .where(and(isNull(waitlistEntries.marketingSyncedAt), gte(waitlistEntries.createdAt, since!)))
    .orderBy(waitlistEntries.sequence);
  console.log(`[resync] ${rows.length} waitlist entries since ${since!.toISOString()} never synced`);

  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await port.subscribeToWaitlist(toWaitlistMarketingProfile(row));
      await db
        .update(waitlistEntries)
        .set({ marketingSyncedAt: new Date() })
        .where(eq(waitlistEntries.id, row.id));
      synced += 1;
    } catch (error) {
      failed += 1;
      const status = error instanceof AttentiveRequestError ? ` (${error.status})` : '';
      console.error(`[resync] entry ${row.id} failed: ${(error as Error).name}${status}`);
    }
  }
  console.log(`[resync] done: ${synced} synced, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

void main();
