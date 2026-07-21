/**
 * Identity — our record of each member; authentication itself lives in Clerk.
 * Owned by @joice/core.
 */
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Member users. Authentication lives in Clerk; this table is our own record of
 * each member, keyed by their Clerk user id. Empty until member sign-ups launch.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Clerk's user id (`user_...`) — the authoritative identity key. */
    clerkUserId: text('clerk_user_id').notNull(),

    /** Mirrored from Clerk; kept locally for querying/joins without API calls. */
    email: text('email').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),

    /** Lifecycle: active | suspended | deleted. */
    status: text('status').notNull().default('active'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_clerk_user_id_unique').on(table.clerkUserId),
    uniqueIndex('users_email_unique').on(table.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
