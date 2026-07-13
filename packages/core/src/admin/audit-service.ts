import { type Database, type AuditLog, auditLogs, eq, desc, count } from '@joice/db';
import type { AuditLogQuery, Paginated } from './schemas';

/** A live transaction handle — same query surface as Database for our purposes. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface AuditEntry {
  actorClerkUserId: string;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

export function createAuditService(db: Database) {
  return {
    /**
     * Append an audit row. Pass the caller's transaction so the audit record
     * commits (or rolls back) atomically with the mutation it describes.
     */
    async record(entry: AuditEntry, tx?: Tx): Promise<void> {
      await (tx ?? db).insert(auditLogs).values({
        actorClerkUserId: entry.actorClerkUserId,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
      });
    },

    async list({ page, limit, entityType }: AuditLogQuery): Promise<Paginated<AuditLog>> {
      const where = entityType ? eq(auditLogs.entityType, entityType) : undefined;

      const [items, [totalRow]] = await Promise.all([
        db
          .select()
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ value: count() }).from(auditLogs).where(where),
      ]);

      return { items, total: totalRow?.value ?? 0, page, limit };
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
