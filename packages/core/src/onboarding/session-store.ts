import {
  type Database,
  type NewOnboardingSession,
  type OnboardingSession,
  and,
  desc,
  eq,
  inArray,
  lt,
  onboardingSessions,
} from '@joice/db';

/**
 * The session rows, behind an interface so the onboarding service can be
 * tested with an in-memory store and the db implementation stays thin. The
 * service never touches `onboarding_sessions` except through this.
 */
export interface SessionStore {
  /** The most recent session for a cookie, whatever its status. */
  findCurrent(anonymousSessionId: string): Promise<OnboardingSession | null>;
  findById(id: string): Promise<OnboardingSession | null>;
  findByMember(memberId: string): Promise<OnboardingSession | null>;
  create(values: NewOnboardingSession): Promise<OnboardingSession>;
  update(id: string, patch: Partial<NewOnboardingSession>): Promise<OnboardingSession>;
  /** Retention: in_progress sessions idle since before `idleBefore` become abandoned. */
  markAbandonedIdle(idleBefore: Date): Promise<number>;
  /** Retention: unclaimed sessions (any status but registered) untouched since before `before`. */
  listUnclaimedBefore(before: Date, limit: number): Promise<OnboardingSession[]>;
  deleteMany(ids: readonly string[]): Promise<void>;
}

export function createDbSessionStore(db: Database): SessionStore {
  return {
    async findCurrent(anonymousSessionId) {
      const [row] = await db
        .select()
        .from(onboardingSessions)
        .where(eq(onboardingSessions.anonymousSessionId, anonymousSessionId))
        .orderBy(desc(onboardingSessions.createdAt))
        .limit(1);
      return row ?? null;
    },
    async findById(id) {
      const [row] = await db.select().from(onboardingSessions).where(eq(onboardingSessions.id, id)).limit(1);
      return row ?? null;
    },
    async findByMember(memberId) {
      const [row] = await db
        .select()
        .from(onboardingSessions)
        .where(eq(onboardingSessions.memberId, memberId))
        .orderBy(desc(onboardingSessions.createdAt))
        .limit(1);
      return row ?? null;
    },
    async create(values) {
      const [row] = await db.insert(onboardingSessions).values(values).returning();
      return row!;
    },
    async update(id, patch) {
      const [row] = await db
        .update(onboardingSessions)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(onboardingSessions.id, id))
        .returning();
      return row!;
    },
    async markAbandonedIdle(idleBefore) {
      const rows = await db
        .update(onboardingSessions)
        .set({ status: 'abandoned', updatedAt: new Date() })
        .where(and(eq(onboardingSessions.status, 'in_progress'), lt(onboardingSessions.lastActivityAt, idleBefore)))
        .returning({ id: onboardingSessions.id });
      return rows.length;
    },
    async listUnclaimedBefore(before, limit) {
      return db
        .select()
        .from(onboardingSessions)
        .where(and(inArray(onboardingSessions.status, ['in_progress', 'gated_age', 'gated_state', 'completed', 'abandoned']), lt(onboardingSessions.lastActivityAt, before)))
        .orderBy(onboardingSessions.lastActivityAt)
        .limit(limit);
    },
    async deleteMany(ids) {
      if (ids.length === 0) return;
      await db.delete(onboardingSessions).where(inArray(onboardingSessions.id, [...ids]));
    },
  };
}
