import {
  type Database,
  type ServiceAreaRequest,
  and,
  count,
  desc,
  eq,
  serviceAreaRequests,
} from '@joice/db';
import type { Paginated } from '../admin/schemas';
import type { ServiceAreaRequestsQuery } from './admin-schemas';
import { noopOnboardingMarketingPort, type OnboardingMarketingPort } from './marketing-port';

export interface ServiceAreaRequestServiceDeps {
  marketing?: OnboardingMarketingPort;
}

/**
 * "Tell me when my state opens." One row per email and state, its own table:
 * not the referral waitlist (no referral code, no position), not the brain's
 * lead (no brain lineage), no join to either. The marketing sync is
 * fire-and-forget like the waitlist's: a Klaviyo outage never fails the
 * request, success stamps `marketing_synced_at`, and errors log ids only.
 */
export function createServiceAreaRequestService(
  db: Database,
  { marketing = noopOnboardingMarketingPort }: ServiceAreaRequestServiceDeps = {},
) {
  function syncToMarketing(row: ServiceAreaRequest): void {
    void (async () => {
      await marketing.serviceAreaRequested({
        email: row.email,
        firstName: row.firstName,
        stateCode: row.stateCode,
        goal: null,
        requestedAt: row.createdAt,
      });
      await db
        .update(serviceAreaRequests)
        .set({ marketingSyncedAt: new Date() })
        .where(eq(serviceAreaRequests.id, row.id));
    })().catch((err) => {
      console.error(`[onboarding] marketing sync failed for service area request ${row.id}:`, err);
    });
  }

  return {
    /**
     * Upsert by (email, state). Re-submitting is a no-op that still returns the
     * row (`created: false`), so the UI can say "noted" twice without a
     * duplicate or an error.
     */
    async request(input: {
      email: string;
      firstName?: string | null;
      stateCode: string;
      onboardingSessionId?: string | null;
      ipHash?: string | null;
    }): Promise<{ row: ServiceAreaRequest; created: boolean }> {
      const [existing] = await db
        .select()
        .from(serviceAreaRequests)
        .where(and(eq(serviceAreaRequests.email, input.email), eq(serviceAreaRequests.stateCode, input.stateCode)))
        .limit(1);
      if (existing) return { row: existing, created: false };

      const [row] = await db
        .insert(serviceAreaRequests)
        .values({
          email: input.email,
          firstName: input.firstName ?? null,
          stateCode: input.stateCode,
          onboardingSessionId: input.onboardingSessionId ?? null,
          ipHash: input.ipHash ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        // Lost a race with an identical request; read it back.
        const [raced] = await db
          .select()
          .from(serviceAreaRequests)
          .where(and(eq(serviceAreaRequests.email, input.email), eq(serviceAreaRequests.stateCode, input.stateCode)))
          .limit(1);
        return { row: raced!, created: false };
      }
      syncToMarketing(row);
      return { row, created: true };
    },

    async list({ page, limit, stateCode }: ServiceAreaRequestsQuery): Promise<Paginated<ServiceAreaRequest>> {
      const where = stateCode ? eq(serviceAreaRequests.stateCode, stateCode) : undefined;
      const [items, [total]] = await Promise.all([
        db
          .select()
          .from(serviceAreaRequests)
          .where(where)
          .orderBy(desc(serviceAreaRequests.createdAt))
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ value: count() }).from(serviceAreaRequests).where(where),
      ]);
      return { items, total: total?.value ?? 0, page, limit };
    },
  };
}

export type ServiceAreaRequestService = ReturnType<typeof createServiceAreaRequestService>;
