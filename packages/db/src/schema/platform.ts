/**
 * Platform plumbing: feature flags, settings and the admin audit trail.
 * Owned by @joice/core (the admin console).
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * DB-backed feature flags, managed from the admin UI and evaluated server-side
 * (with a short in-memory cache) so toggles don't need a deploy.
 */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    /** Stable slug referenced from code, e.g. `member_signups`. Immutable after create. */
    key: text('key').notNull(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(false),

    /** Reserved for future targeting (percentage rollout, audiences). */
    rollout: jsonb('rollout').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('feature_flags_key_unique').on(table.key)],
);

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;

/** Runtime key/value settings editable from the admin UI (values are arbitrary JSON). */
export const appSettings = pgTable(
  'app_settings',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    description: text('description'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('app_settings_key_unique').on(table.key)],
);

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

/**
 * Append-only trail of every admin mutation (who/what/before/after). Rows are
 * written in the same transaction as the change they describe and never updated.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    actorClerkUserId: text('actor_clerk_user_id').notNull(),
    /** Denormalized at write time so the trail survives account changes in Clerk. */
    actorEmail: text('actor_email'),

    /** Dotted verb, e.g. `flag.toggle`, `waitlist.update_status`. */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),

    before: jsonb('before').$type<unknown>(),
    after: jsonb('after').$type<unknown>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_created_at_idx').on(table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
