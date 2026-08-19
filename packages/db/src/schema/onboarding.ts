/**
 * Onboarding-owned tables: the intake flow, its sessions, the service areas
 * that gate it, and the member profile it builds. Owned by @joice/core and
 * written only by the api service. The brain never touches these tables: it
 * reaches the profile over HTTP (`/api/internal/*`) and its observations are
 * written here by the api on its behalf. One database, one migration stream.
 *
 * Data-class notes, because this file is where the compliance posture becomes
 * columns: `onboarding_sessions.answers` and `profile_observations` hold
 * whatever the published flow asks, and the flow cannot ask a health-tier
 * trait until both PHI keys are on (see docs/onboarding/00-plan.md section
 * 3.9). A date of birth under the minimum age is never written (engine rule).
 * `onboarding_events` carries keys and outcomes, never values.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ------------------------------------------------------------------------- */
/* Flow definitions                                                          */
/* ------------------------------------------------------------------------- */

/**
 * A flow by key (`intake` today) and the pointer to its published version.
 * Publishing and rollback move `published_version_id`; nothing else does.
 * Soft reference on purpose: a restored image must never fail on a pointer.
 */
export const onboardingFlows = pgTable(
  'onboarding_flows',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    key: text('key').notNull(),
    name: text('name'),
    publishedVersionId: uuid('published_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('onboarding_flows_key_unique').on(table.key)],
);

export type OnboardingFlow = typeof onboardingFlows.$inferSelect;

/**
 * An immutable-once-published version of a flow definition. Drafts are edited
 * in place; publish freezes the row, archives the previous published version
 * and moves the flow's pointer. Sessions pin a version id, so a live session
 * keeps the definition it started with; `logic_hash` (copy stripped) lets the
 * service move a session forward over a copy-only publish.
 */
export const onboardingFlowVersions = pgTable(
  'onboarding_flow_versions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    flowId: uuid('flow_id').notNull(),
    version: integer('version').notNull(),
    /** draft | published | archived */
    status: text('status').notNull().default('draft'),
    /** The definition's own schemaVersion, so a rolled-back build can refuse it. */
    schemaVersion: integer('schema_version').notNull().default(1),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    logicHash: text('logic_hash'),
    notes: text('notes'),
    /** The last validation report, stored so the editor can show it without re-validating. */
    validationReport: jsonb('validation_report').$type<Record<string, unknown>>(),
    /** Clerk user ids; `system` for the seed. */
    createdBy: text('created_by').notNull().default('system'),
    publishedBy: text('published_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('onboarding_flow_versions_flow_version_unique').on(table.flowId, table.version),
    index('onboarding_flow_versions_flow_status_idx').on(table.flowId, table.status),
  ],
);

export type OnboardingFlowVersion = typeof onboardingFlowVersions.$inferSelect;
export type NewOnboardingFlowVersion = typeof onboardingFlowVersions.$inferInsert;

/* ------------------------------------------------------------------------- */
/* Sessions and events                                                       */
/* ------------------------------------------------------------------------- */

/**
 * One visitor's run through a flow version. The row IS the state (the
 * brain_profiles pattern): `answers` is the current answer set on the path,
 * `skipped` the optional questions they passed on, `cursor_question_key` is set
 * while they have stepped back, `gate_outcome` is set once and makes the
 * session terminal. Keyed by the httpOnly cookie while anonymous; `member_id`
 * (users.id) is stamped at claim. Minors never have a date of birth here.
 */
export const onboardingSessions = pgTable(
  'onboarding_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    flowVersionId: uuid('flow_version_id').notNull(),
    /** The opaque cookie value; a bearer token, never logged. */
    anonymousSessionId: uuid('anonymous_session_id').notNull(),
    /** users.id once claimed; null while anonymous. */
    memberId: uuid('member_id'),
    /** in_progress | gated_age | gated_state | completed | registered | abandoned */
    status: text('status').notNull().default('in_progress'),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),
    skipped: jsonb('skipped').$type<string[]>().notNull().default([]),
    cursorQuestionKey: text('cursor_question_key'),
    /** What the companion handed over (first name, goal, email); not answers. */
    carryOver: jsonb('carry_over').$type<Record<string, unknown>>(),
    gateOutcome: jsonb('gate_outcome').$type<Record<string, unknown>>(),
    /** Salted hash, for light abuse mitigation; never a raw IP. */
    ipHash: text('ip_hash'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** Drives the retention sweep (idle -> abandoned -> purged). */
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('onboarding_sessions_anon_idx').on(table.anonymousSessionId, table.createdAt.desc()),
    index('onboarding_sessions_member_idx').on(table.memberId),
    index('onboarding_sessions_status_activity_idx').on(table.status, table.lastActivityAt),
  ],
);

export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type NewOnboardingSession = typeof onboardingSessions.$inferInsert;

/**
 * Funnel events: what step was reached, answered, skipped, gated. Keys and
 * outcomes only, never answer values, so the admin funnel and GTM can read
 * the same shape without either carrying PII.
 */
export const onboardingEvents = pgTable(
  'onboarding_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** session_started | step_viewed | step_answered | step_skipped | step_back | gate_hit | notify_submitted | completed | claimed | restarted */
    event: text('event').notNull(),
    sessionId: uuid('session_id').notNull(),
    flowVersionId: uuid('flow_version_id').notNull(),
    sectionKey: text('section_key'),
    questionKey: text('question_key'),
    /** Gate outcome or similar enum-ish label. */
    outcome: text('outcome'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('onboarding_events_version_event_idx').on(table.flowVersionId, table.event, table.occurredAt),
    index('onboarding_events_session_idx').on(table.sessionId, table.occurredAt),
  ],
);

export type OnboardingEvent = typeof onboardingEvents.$inferSelect;

/* ------------------------------------------------------------------------- */
/* Service areas                                                             */
/* ------------------------------------------------------------------------- */

/**
 * Where Joice can serve, state by state. Platform-owned so that pharmacy and
 * shipping can read the same truth later; the flow references it only through
 * the derived `state_status` trait. Edited on its own admin surface with its
 * own audit action, separately from flow copy. Seeded all `notify`.
 */
export const serviceAreas = pgTable(
  'service_areas',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** USPS code, e.g. CA. */
    stateCode: text('state_code').notNull(),
    /** open | notify | closed */
    status: text('status').notNull().default('notify'),
    note: text('note'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('service_areas_state_code_unique').on(table.stateCode)],
);

export type ServiceArea = typeof serviceAreas.$inferSelect;

/**
 * "Tell me when my state opens." Its own table on purpose: not the referral
 * waitlist, not the brain's lead, no join to either. Synced to Klaviyo under
 * the `onboarding_*` namespace without a list subscription (no marketing
 * consent is implied). One row per email and state.
 */
export const serviceAreaRequests = pgTable(
  'service_area_requests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    email: text('email').notNull(),
    firstName: text('first_name'),
    stateCode: text('state_code').notNull(),
    onboardingSessionId: uuid('onboarding_session_id'),
    ipHash: text('ip_hash'),
    marketingSyncedAt: timestamp('marketing_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('service_area_requests_email_state_unique').on(table.email, table.stateCode),
    index('service_area_requests_state_idx').on(table.stateCode, table.createdAt),
  ],
);

export type ServiceAreaRequest = typeof serviceAreaRequests.$inferSelect;

/* ------------------------------------------------------------------------- */
/* Profile                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Append-only observations: every value a source ever reported for a trait,
 * with provenance. Onboarding answers, companion carry-over confirmed by the
 * visitor, clinician edits later, derived values, system stamps. The profile
 * is a fold of these; "what did they say before" is a query, not a guess.
 */
export const profileObservations = pgTable(
  'profile_observations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    trait: text('trait').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    /** onboarding | companion | clinician | derived | system */
    source: text('source').notNull(),
    confidence: real('confidence').notNull().default(1),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
    onboardingSessionId: uuid('onboarding_session_id'),
    /** users.id; null while the session is anonymous, stamped at claim. */
    memberId: uuid('member_id'),
    flowVersionId: uuid('flow_version_id'),
    questionKey: text('question_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('profile_observations_member_trait_idx').on(table.memberId, table.trait, table.observedAt.desc()),
    index('profile_observations_session_idx').on(table.onboardingSessionId),
  ],
);

export type ProfileObservation = typeof profileObservations.$inferSelect;
export type NewProfileObservation = typeof profileObservations.$inferInsert;

/**
 * The projected profile: one row per person, `traits` folded from the
 * observations (latest wins per trait, with provenance precedence), derived
 * traits recomputed, `segment` resolved. Keyed by the onboarding session while
 * anonymous and by `member_id` after claim. Cheap to rebuild from the
 * observations; `projector_version` says which fold produced it.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    memberId: uuid('member_id'),
    anonymousSessionId: uuid('anonymous_session_id'),
    traits: jsonb('traits').$type<Record<string, unknown>>().notNull().default({}),
    segment: text('segment'),
    projectorVersion: integer('projector_version').notNull().default(1),
    flowVersionId: uuid('flow_version_id'),
    projectedAt: timestamp('projected_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('profiles_member_unique').on(table.memberId),
    uniqueIndex('profiles_anon_unique').on(table.anonymousSessionId),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
