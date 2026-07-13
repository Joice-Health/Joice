import {
  type Database,
  type User,
  users,
  and,
  count,
  desc,
  eq,
  ilike,
  or,
} from '@joice/db';
import type { AuditService } from './audit-service';
import type { AdminActor, AdminUserQuery, Paginated, UserStatus } from './schemas';

export interface UpsertFromClerkInput {
  clerkUserId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Member users. Clerk owns authentication; this service maintains our local
 * record of each member (empty until member sign-ups launch).
 */
export function createUserService(db: Database, audit: AuditService) {
  return {
    async list(query: AdminUserQuery): Promise<Paginated<User>> {
      const { page, limit, search, status } = query;

      const filters = [
        search
          ? or(
              ilike(users.email, `%${search}%`),
              ilike(users.firstName, `%${search}%`),
              ilike(users.lastName, `%${search}%`),
            )
          : undefined,
        status ? eq(users.status, status) : undefined,
      ].filter((f) => f !== undefined);
      const where = filters.length ? and(...filters) : undefined;

      const [items, [totalRow]] = await Promise.all([
        db
          .select()
          .from(users)
          .where(where)
          .orderBy(desc(users.createdAt))
          .limit(limit)
          .offset((page - 1) * limit),
        db.select({ value: count() }).from(users).where(where),
      ]);

      return { items, total: totalRow?.value ?? 0, page, limit };
    },

    async getByClerkId(clerkUserId: string): Promise<User | undefined> {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.clerkUserId, clerkUserId))
        .limit(1);
      return user;
    },

    /**
     * Create-or-refresh our record from Clerk data. Intended consumer: a Clerk
     * `user.created`/`user.updated` webhook once member sign-ups launch.
     */
    async upsertFromClerk(input: UpsertFromClerkInput): Promise<User> {
      const [user] = await db
        .insert(users)
        .values({
          clerkUserId: input.clerkUserId,
          email: input.email,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: {
            email: input.email,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user!;
    },

    async updateStatus(id: string, status: UserStatus, actor: AdminActor): Promise<User | null> {
      return db.transaction(async (tx) => {
        const [before] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
        if (!before) return null;

        const [after] = await tx
          .update(users)
          .set({ status, updatedAt: new Date() })
          .where(eq(users.id, id))
          .returning();

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'user.update_status',
            entityType: 'user',
            entityId: id,
            before: { status: before.status },
            after: { status },
          },
          tx,
        );

        return after ?? null;
      });
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;
