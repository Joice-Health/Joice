import {
  type Database,
  type NewProfileObservation,
  type Profile,
  type ProfileObservation,
  and,
  desc,
  eq,
  inArray,
  profileObservations,
  profiles,
} from '@joice/db';
import type { ObservationSource, ProfileProjection } from './projector';

/**
 * Persistence for the profile: append observations, upsert the projection,
 * read it back, and re-key an anonymous profile to a member at claim. The
 * fold itself is pure (`projector.ts`); this file only touches the two tables
 * in `packages/db/src/schema/onboarding.ts` that belong to the profile, and it
 * is the ONLY writer of them (the api service, through @joice/core).
 */

export type ProfileKey = { anonymousSessionId: string } | { memberId: string };

export interface NewObservationInput {
  trait: string;
  value: unknown;
  source: ObservationSource;
  confidence?: number;
  observedAt?: Date;
  onboardingSessionId?: string | null;
  memberId?: string | null;
  flowVersionId?: string | null;
  questionKey?: string | null;
}

export interface ListObservationsInput {
  onboardingSessionId?: string;
  memberId?: string;
  /** Restrict to these sources (e.g. everything but onboarding). */
  sources?: readonly ObservationSource[];
}

export function createProfileService(db: Database) {
  return {
    /** Append-only. Nothing here ever updates or deletes an observation. */
    async recordObservations(inputs: readonly NewObservationInput[]): Promise<void> {
      if (inputs.length === 0) return;
      const rows: NewProfileObservation[] = inputs.map((i) => ({
        trait: i.trait,
        value: i.value,
        source: i.source,
        confidence: i.confidence ?? 1,
        observedAt: i.observedAt ?? new Date(),
        onboardingSessionId: i.onboardingSessionId ?? null,
        memberId: i.memberId ?? null,
        flowVersionId: i.flowVersionId ?? null,
        questionKey: i.questionKey ?? null,
      }));
      await db.insert(profileObservations).values(rows);
    },

    async listObservations(input: ListObservationsInput): Promise<ProfileObservation[]> {
      const conditions = [];
      if (input.onboardingSessionId) conditions.push(eq(profileObservations.onboardingSessionId, input.onboardingSessionId));
      if (input.memberId) conditions.push(eq(profileObservations.memberId, input.memberId));
      if (input.sources && input.sources.length > 0) conditions.push(inArray(profileObservations.source, [...input.sources]));
      if (conditions.length === 0) return [];
      return db
        .select()
        .from(profileObservations)
        .where(and(...conditions))
        .orderBy(desc(profileObservations.observedAt));
    },

    /**
     * Write the projection for a person. Keyed by the onboarding session while
     * anonymous and by the member after claim; one row per key.
     */
    async upsertProjection(
      key: ProfileKey,
      projection: ProfileProjection,
      flowVersionId: string | null = null,
    ): Promise<Profile> {
      const values = {
        traits: projection.traits as Record<string, unknown>,
        segment: projection.segment,
        projectorVersion: projection.projectorVersion,
        flowVersionId,
        projectedAt: new Date(projection.projectedAt),
        updatedAt: new Date(),
      };
      const isMember = 'memberId' in key;
      const [row] = await db
        .insert(profiles)
        .values({
          ...values,
          memberId: isMember ? key.memberId : null,
          anonymousSessionId: isMember ? null : key.anonymousSessionId,
        })
        .onConflictDoUpdate({
          target: isMember ? profiles.memberId : profiles.anonymousSessionId,
          set: values,
        })
        .returning();
      return row!;
    },

    async getForMember(memberId: string): Promise<Profile | null> {
      const [row] = await db.select().from(profiles).where(eq(profiles.memberId, memberId)).limit(1);
      return row ?? null;
    },

    async getForSession(anonymousSessionId: string): Promise<Profile | null> {
      const [row] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.anonymousSessionId, anonymousSessionId))
        .limit(1);
      return row ?? null;
    },

    /**
     * At claim: stamp the member on every observation of the session and move
     * the anonymous profile under the member. If the member already has a
     * profile (a second device, a restart), the anonymous row is dropped and
     * the caller re-projects from the now-merged observations. Returns whether
     * a re-projection is needed.
     */
    async attachToMember(input: {
      onboardingSessionId: string;
      anonymousSessionId: string;
      memberId: string;
    }): Promise<{ reproject: boolean }> {
      return db.transaction(async (tx) => {
        await tx
          .update(profileObservations)
          .set({ memberId: input.memberId })
          .where(eq(profileObservations.onboardingSessionId, input.onboardingSessionId));

        const [existing] = await tx
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.memberId, input.memberId))
          .limit(1);

        if (existing) {
          await tx.delete(profiles).where(eq(profiles.anonymousSessionId, input.anonymousSessionId));
          return { reproject: true };
        }

        await tx
          .update(profiles)
          .set({ memberId: input.memberId, anonymousSessionId: null, updatedAt: new Date() })
          .where(eq(profiles.anonymousSessionId, input.anonymousSessionId));
        return { reproject: false };
      });
    },

    /** Retention: remove the observations and profile of an unclaimed session. */
    async purgeSession(input: { onboardingSessionId: string; anonymousSessionId: string }): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.delete(profileObservations).where(eq(profileObservations.onboardingSessionId, input.onboardingSessionId));
        await tx.delete(profiles).where(eq(profiles.anonymousSessionId, input.anonymousSessionId));
      });
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
