import {
  type Database,
  type WaitlistEntry,
  waitlistEntries,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  or,
} from '@joice/db';
import type { AuditService } from './audit-service';
import type {
  AdminActor,
  AdminWaitlistQuery,
  Paginated,
  WaitlistStatus,
} from './schemas';

/**
 * Admin-side waitlist operations. Kept separate from the public
 * createWaitlistService so the public surface never grows admin capability.
 */
export function createAdminWaitlistService(db: Database, audit: AuditService) {
  return {
    async list(query: AdminWaitlistQuery): Promise<Paginated<WaitlistEntry>> {
      const { page, limit, search, status, sort } = query;

      const filters = [
        search
          ? or(
              ilike(waitlistEntries.email, `%${search}%`),
              ilike(waitlistEntries.firstName, `%${search}%`),
              ilike(waitlistEntries.lastName, `%${search}%`),
            )
          : undefined,
        status ? eq(waitlistEntries.status, status) : undefined,
      ].filter((f) => f !== undefined);
      const where = filters.length ? and(...filters) : undefined;

      const [items, [totalRow]] = await Promise.all([
        db
          .select()
          .from(waitlistEntries)
          .where(where)
          .orderBy(
            sort === 'oldest' ? asc(waitlistEntries.sequence) : desc(waitlistEntries.sequence),
          )
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ value: count() }).from(waitlistEntries).where(where),
      ]);

      return { items, total: totalRow?.value ?? 0, page, limit };
    },

    async updateStatus(
      id: string,
      status: WaitlistStatus,
      actor: AdminActor,
    ): Promise<WaitlistEntry | null> {
      return db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(waitlistEntries)
          .where(eq(waitlistEntries.id, id))
          .limit(1);
        if (!before) return null;

        const [after] = await tx
          .update(waitlistEntries)
          .set({ status, updatedAt: new Date() })
          .where(eq(waitlistEntries.id, id))
          .returning();

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'waitlist.update_status',
            entityType: 'waitlist_entry',
            entityId: id,
            before: { status: before.status },
            after: { status },
          },
          tx,
        );

        return after ?? null;
      });
    },

    /** Stream all entries in signup order, in batches, for CSV export. */
    async *exportAll(batchSize = 1000): AsyncGenerator<WaitlistEntry[]> {
      let cursor = 0;
      for (;;) {
        const batch = await db
          .select()
          .from(waitlistEntries)
          .where(gte(waitlistEntries.sequence, cursor + 1))
          .orderBy(asc(waitlistEntries.sequence))
          .limit(batchSize);
        if (batch.length === 0) return;
        yield batch;
        cursor = batch[batch.length - 1]!.sequence;
      }
    },
  };
}

export type AdminWaitlistService = ReturnType<typeof createAdminWaitlistService>;
