import { type Database, type ServiceArea, asc, eq, serviceAreas } from '@joice/db';
import type { AuditService } from '../admin/audit-service';
import type { AdminActor } from '../admin/schemas';
import type { ServiceAreaStatus } from '../profile/traits';
import type { UpdateServiceAreaInput } from './admin-schemas';

export interface ServiceAreaServiceOptions {
  cacheTtlMs?: number;
  now?: () => number;
}

/**
 * Where Joice serves, state by state. The engine reads the cached map on every
 * request (it becomes the derived `state_status` trait); admins edit it on
 * its own surface, and every change is audited as `service_area.update` with
 * before/after so opening a state is never an anonymous act. A state that is
 * somehow missing from the table reads as `notify`, never as open.
 */
export function createServiceAreaService(
  db: Database,
  audit: AuditService,
  { cacheTtlMs = 30_000, now = () => Date.now() }: ServiceAreaServiceOptions = {},
) {
  let cache: { value: Record<string, ServiceAreaStatus>; expiresAt: number } | undefined;
  const invalidate = () => {
    cache = undefined;
  };

  return {
    async list(): Promise<ServiceArea[]> {
      return db.select().from(serviceAreas).orderBy(asc(serviceAreas.stateCode));
    },

    /** State code to status, cached. */
    async map(): Promise<Record<string, ServiceAreaStatus>> {
      if (cache && cache.expiresAt > now()) return cache.value;
      const rows = await db.select().from(serviceAreas);
      const value = Object.fromEntries(rows.map((r) => [r.stateCode, r.status as ServiceAreaStatus]));
      cache = { value, expiresAt: now() + cacheTtlMs };
      return value;
    },

    async update(stateCode: string, input: UpdateServiceAreaInput, actor: AdminActor): Promise<ServiceArea | null> {
      const row = await db.transaction(async (tx) => {
        const [before] = await tx.select().from(serviceAreas).where(eq(serviceAreas.stateCode, stateCode)).limit(1);
        if (!before) return null;
        const [after] = await tx
          .update(serviceAreas)
          .set({
            status: input.status,
            ...(input.note !== undefined ? { note: input.note } : {}),
            updatedBy: actor.clerkUserId,
            updatedAt: new Date(),
          })
          .where(eq(serviceAreas.stateCode, stateCode))
          .returning();
        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'service_area.update',
            entityType: 'service_area',
            entityId: stateCode,
            before: { status: before.status, note: before.note },
            after: { status: after!.status, note: after!.note },
          },
          tx,
        );
        return after!;
      });
      invalidate();
      return row;
    },
  };
}

export type ServiceAreaService = ReturnType<typeof createServiceAreaService>;
