/**
 * Waitlist — the only public surface before launch. Owned by @joice/core.
 */
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * The single Phase 0 table: people on the Joice waitlist.
 *
 * Referral attribution is tracked (referred_by_*), but reward logic is deliberately
 * out of scope for Phase 0 — we only surface `position` (derived from `sequence`) and
 * `referral_count`. See the design plan for the full rationale.
 */
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Stored lowercased + trimmed; the natural unique key for idempotent signups. */
    email: text('email').notNull(),

    /** Collected at signup (V1 brief). Nullable for rows created before the fields existed. */
    firstName: text('first_name'),
    lastName: text('last_name'),

    /** Short, URL-safe slug shared in referral links (e.g. ?ref=ab12cd34). */
    referralCode: text('referral_code').notNull(),

    /** The raw ?ref= value captured at signup (kept even if it failed to resolve). */
    referredByCode: text('referred_by_code'),

    /** Resolved referrer, if the ?ref= code matched an existing entry. */
    referredById: uuid('referred_by_id').references((): AnyPgColumn => waitlistEntries.id, {
      onDelete: 'set null',
    }),

    /** Denormalized count of people who signed up with this entry's referral code. */
    referralCount: integer('referral_count').notNull().default(0),

    /** Monotonic signup order; position in line = rank by this column. */
    sequence: bigserial('sequence', { mode: 'number' }).notNull(),

    /** Lifecycle status — future-proofing for Phase 1 (invited/converted). */
    status: text('status').notNull().default('pending'),

    /** Arbitrary capture context (utm params, source, etc.). */
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    /** Hashed IP for light abuse mitigation; never store raw IPs. */
    ipHash: text('ip_hash'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('waitlist_entries_email_unique').on(table.email),
    uniqueIndex('waitlist_entries_referral_code_unique').on(table.referralCode),
    index('waitlist_entries_referred_by_id_idx').on(table.referredById),
  ],
);

export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;
