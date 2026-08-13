import { and, brainProfiles, desc, eq, isNull, type Database } from '@joice/db';
import type { LeadSyncPort, Requester } from '../ports';
import {
  CAPTURE_FIELDS,
  CARE_AREAS,
  GOAL_UNSURE,
  GOAL_VALUES,
  isValidEmail,
  type CaptureField,
  type CaptureStep,
  type CompanionProfile,
} from './schemas';

/**
 * The pre-onboarding lead: find-or-create it, decide what to ask next, and
 * apply what the visitor answers.
 *
 * Deliberately no LLM. Capture is a deterministic state machine — the fields
 * that are set or skipped *are* the state, so `nextStep` is a pure function of
 * the row and applying an answer is a validated write. That's what makes the
 * lead data clean, the flow testable, and the whole thing free of the
 * generation path's short-circuit and alternation constraints.
 *
 * Same dual-key scoping as the conversation service: keyed on `memberId` when
 * signed in, else the anonymous session id, so a lead survives anonymously and
 * is claimed on sign-up.
 */

function scopeFor(requester: Requester) {
  return requester.memberId
    ? eq(brainProfiles.memberId, requester.memberId)
    : eq(brainProfiles.anonymousSessionId, requester.sessionId);
}

const NAME_MAX = 80;

/** The lead as the browser may see it — never the raw row. */
function toView(row: typeof brainProfiles.$inferSelect): CompanionProfile {
  return {
    name: row.name,
    email: row.email,
    goal: row.goal,
    goalLabel: labelForGoal(row.goal),
    readyForOnboarding: row.readyForOnboarding,
    status: row.status as CompanionProfile['status'],
  };
}

function labelForGoal(goal: string | null): string | null {
  if (!goal) return null;
  if (goal === GOAL_UNSURE) return 'Still figuring it out';
  return CARE_AREAS.find((a) => a.slug === goal)?.label ?? goal;
}

/** Is this field answered or explicitly skipped? Either way, don't ask again. */
function isSettled(row: typeof brainProfiles.$inferSelect, field: CaptureField): boolean {
  if (row.skipped.includes(field)) return true;
  if (field === 'name') return Boolean(row.name);
  if (field === 'email') return Boolean(row.email);
  return Boolean(row.goal); // goal
}

export function createProfileService(db: Database, deps: { leadSync?: LeadSyncPort } = {}) {
  /**
   * The next unanswered, un-skipped field in order — or null when capture is
   * done. Pure over the row, which is why the UI can drive the whole flow from
   * one GET.
   */
  function nextField(row: typeof brainProfiles.$inferSelect): CaptureField | null {
    return CAPTURE_FIELDS.find((f) => !isSettled(row, f)) ?? null;
  }

  async function loadOrCreate(requester: Requester) {
    const [existing] = await db
      .select()
      .from(brainProfiles)
      .where(scopeFor(requester))
      .orderBy(desc(brainProfiles.createdAt))
      .limit(1);
    if (existing) return existing;

    const [created] = await db
      .insert(brainProfiles)
      .values({
        memberId: requester.memberId,
        anonymousSessionId: requester.sessionId,
      })
      .returning();
    return created!;
  }

  async function persist(
    id: string,
    patch: Partial<typeof brainProfiles.$inferInsert>,
  ): Promise<typeof brainProfiles.$inferSelect> {
    const [updated] = await db
      .update(brainProfiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(brainProfiles.id, id))
      .returning();
    syncLead(updated!);
    return updated!;
  }

  /**
   * Fire-and-forget sync to the marketing platform — a marketing outage must
   * never fail or slow a capture turn, so nothing here is awaited by the
   * caller. Runs on every persist once an email exists, so later answers
   * (name after email, goal, ready) keep the marketing profile current.
   *
   * Syncs are serialized through one chain: the port retries with backoff, so
   * without ordering, an early sync stuck in retries could land *after* a
   * newer one and regress the marketing profile (last write wins over there).
   *
   * Success stamps `marketingSyncedAt` without touching `updatedAt`, so a row
   * whose latest change failed to sync stays findable
   * (`marketing_synced_at IS NULL OR marketing_synced_at < updated_at`).
   * Errors log the lead id and error name only — a marketing API's error body
   * can echo the submitted values, so the message never reaches the logs.
   */
  let syncChain: Promise<void> = Promise.resolve();
  function syncLead(row: typeof brainProfiles.$inferSelect): void {
    const port = deps.leadSync;
    if (!port || !row.email) return;
    const email = row.email;
    syncChain = syncChain
      .then(async () => {
        await port.upsertLead({ email, name: row.name, goal: row.goal, status: row.status });
        await db
          .update(brainProfiles)
          .set({ marketingSyncedAt: new Date() })
          .where(eq(brainProfiles.id, row.id));
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number })?.status;
        console.error(
          `[companion] marketing sync failed for lead ${row.id}: ${
            (err as Error)?.name ?? 'Error'
          }${typeof status === 'number' ? ` (${status})` : ''}`,
        );
      });
  }

  return {
    nextField,
    toView,

    /** The visitor's lead, created on first contact. */
    async get(requester: Requester) {
      return loadOrCreate(requester);
    },

    /**
     * Apply an answer to a field, validated per field. Returns the updated row.
     * Throws `ProfileValidationError` on bad input so the route can map it to a
     * 400 the widget shows inline.
     */
    async applyField(
      requester: Requester,
      field: CaptureField,
      value: string,
      note?: string,
    ): Promise<typeof brainProfiles.$inferSelect> {
      const row = await loadOrCreate(requester);
      const trimmed = value.trim();

      let patch: Partial<typeof brainProfiles.$inferInsert>;
      if (field === 'name') {
        if (!trimmed) throw new ProfileValidationError('name', 'Please enter a name.');
        patch = { name: trimmed.slice(0, NAME_MAX) };
      } else if (field === 'email') {
        if (!isValidEmail(trimmed)) {
          throw new ProfileValidationError('email', "That doesn't look like an email address.");
        }
        patch = { email: trimmed.toLowerCase() };
      } else {
        // goal
        if (!GOAL_VALUES.includes(trimmed as (typeof GOAL_VALUES)[number])) {
          throw new ProfileValidationError('goal', 'Pick one of the options.');
        }
        patch = { goal: trimmed, goalNote: note?.trim() || null };
      }
      return persist(row.id, { ...patch, status: statusAfter(row, patch) });
    },

    /** Record that the visitor declined a field, so it's never asked again. */
    async skip(requester: Requester, field: CaptureField) {
      const row = await loadOrCreate(requester);
      if (row.skipped.includes(field)) return row;
      const patch = { skipped: [...row.skipped, field] };
      return persist(row.id, { ...patch, status: statusAfter(row, patch) });
    },

    /** The lead signal: the visitor chose to start their journey. */
    async markReady(requester: Requester) {
      const row = await loadOrCreate(requester);
      return persist(row.id, { readyForOnboarding: true, status: 'ready' });
    },

    /**
     * Attach an anonymous lead to a member on sign-up — mirrors the conversation
     * claim. Only unclaimed rows, since a session id is a bearer token.
     */
    async claim(sessionId: string, memberId: string): Promise<number> {
      const claimed = await db
        .update(brainProfiles)
        .set({ memberId, updatedAt: new Date() })
        .where(
          and(
            eq(brainProfiles.anonymousSessionId, sessionId),
            isNull(brainProfiles.memberId),
          ),
        )
        .returning({ id: brainProfiles.id });
      return claimed.length;
    },
  };

  /**
   * The funnel status the row should have *after* `patch` is applied: still
   * `capturing` until every field is settled, then `exploring`. Projects the
   * write rather than reading the stale row, so answering the last field flips
   * to `exploring` immediately. `ready`/`converted` are set explicitly elsewhere
   * and never downgraded here.
   */
  function statusAfter(
    row: typeof brainProfiles.$inferSelect,
    patch: Partial<typeof brainProfiles.$inferInsert>,
  ): string {
    if (row.status === 'ready' || row.status === 'converted') return row.status;
    const projected = { ...row, ...patch } as typeof brainProfiles.$inferSelect;
    return nextField(projected) ? 'capturing' : 'exploring';
  }
}

export type ProfileService = ReturnType<typeof createProfileService>;

/** A field answer the domain rejected — carries which field, for inline display. */
export class ProfileValidationError extends Error {
  constructor(
    public readonly field: CaptureField,
    message: string,
  ) {
    super(message);
    this.name = 'ProfileValidationError';
  }
}

/**
 * Build the `CaptureStep` for a field from the admin-managed prompt copy. Copy
 * lives in config; the input shape is structural and lives here.
 */
export function captureStepFor(
  field: CaptureField,
  prompts: Record<CaptureField, string>,
): CaptureStep {
  const input: CaptureStep['input'] =
    field === 'goal'
      ? {
          type: 'choice',
          choices: [
            ...CARE_AREAS.map((a) => ({ value: a.slug, label: a.label })),
            { value: GOAL_UNSURE, label: 'Not sure yet' },
          ],
        }
      : { type: field === 'email' ? 'email' : 'text' };

  return { field, prompt: prompts[field], input, skippable: true };
}
