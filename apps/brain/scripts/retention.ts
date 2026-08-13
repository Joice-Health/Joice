/**
 * Conversation retention: delete threads idle longer than the retention
 * window. Messages cascade with their conversation (ON DELETE CASCADE).
 *
 * This is a Before-PHI checklist item made real ahead of need: stored chat
 * is health information tied to a person, and "we keep it forever" is not a
 * retention policy. Runs as a scheduled ECS task (infra/retention.tf) that
 * stays DISABLED until conversation persistence itself is switched on —
 * there is nothing to expire until then.
 *
 * Deliberately does NOT touch brain_profiles: leads are marketing-grade data
 * with their own lifecycle (same class as waitlist entries), and erasure for
 * them is the per-person deleteForRequester path, not a blanket sweep.
 *
 *   BRAIN_RETENTION_DAYS=90 bun apps/brain/scripts/retention.ts
 */
import { z } from 'zod';
import { conversations, createDatabase, lt } from '@joice/db';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    BRAIN_RETENTION_DAYS: z.coerce.number().int().min(7).max(3650).default(90),
  })
  .parse(process.env);

const db = createDatabase(env.DATABASE_URL);
const cutoff = new Date(Date.now() - env.BRAIN_RETENTION_DAYS * 24 * 60 * 60 * 1000);

const deleted = await db
  .delete(conversations)
  .where(lt(conversations.updatedAt, cutoff))
  .returning({ id: conversations.id });

console.log(
  `✅ Retention: deleted ${deleted.length} conversation(s) idle since before ` +
    `${cutoff.toISOString()} (${env.BRAIN_RETENTION_DAYS}-day window; messages cascade).`,
);
process.exit(0);
