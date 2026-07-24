import { type Database, brainProfiles, and, count, desc, eq } from '@joice/db';
import type { AdminLeadsQuery, LeadStatus, LeadView, Paginated } from './schemas';

/**
 * Read-only view of the pre-onboarding leads the companion captures.
 *
 * `brain_profiles` is a brain-owned table. The api service reads it here as a
 * deliberate, documented boundary exception: leads are marketing-grade data
 * (name/email/goal), the admin console already owns every other admin surface
 * and has Clerk, and serving this read here avoids standing up Clerk on the
 * brain service for one list. When the brain grows its own admin surface, this
 * moves there. See docs/rag/10-architecture.md.
 *
 * No writes: the companion owns the lead lifecycle. This never exposes the
 * anonymous session id — a bearer token — only the fields an admin needs.
 */
export function createLeadsService(db: Database) {
  return {
    async list(query: AdminLeadsQuery): Promise<Paginated<LeadView>> {
      const { page, limit, status, readyOnly } = query;

      const filters = [
        status ? eq(brainProfiles.status, status) : undefined,
        readyOnly ? eq(brainProfiles.readyForOnboarding, true) : undefined,
      ].filter((f) => f !== undefined);
      const where = filters.length ? and(...filters) : undefined;

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            id: brainProfiles.id,
            name: brainProfiles.name,
            email: brainProfiles.email,
            goal: brainProfiles.goal,
            readyForOnboarding: brainProfiles.readyForOnboarding,
            status: brainProfiles.status,
            createdAt: brainProfiles.createdAt,
            updatedAt: brainProfiles.updatedAt,
          })
          .from(brainProfiles)
          .where(where)
          .orderBy(desc(brainProfiles.updatedAt))
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ value: count() }).from(brainProfiles).where(where),
      ]);

      const items: LeadView[] = rows.map((r) => ({
        ...r,
        status: r.status as LeadStatus,
      }));
      return { items, total: totalRow?.value ?? 0, page, limit };
    },
  };
}

export type LeadsService = ReturnType<typeof createLeadsService>;
