import { type Database, type FeatureFlag, featureFlags, asc, eq } from '@joice/db';
import type { AuditService } from './audit-service';
import type { AdminActor, CreateFeatureFlagInput, UpdateFeatureFlagInput } from './schemas';

export interface FeatureFlagServiceOptions {
  /** Cache lifetime for evaluateAll(). Toggles are visible within this window. */
  cacheTtlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export function createFeatureFlagService(
  db: Database,
  audit: AuditService,
  { cacheTtlMs = 30_000, now = () => Date.now() }: FeatureFlagServiceOptions = {},
) {
  let cache: { value: Record<string, boolean>; expiresAt: number } | undefined;

  const invalidate = () => {
    cache = undefined;
  };

  async function getByKey(key: string): Promise<FeatureFlag | undefined> {
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
    return flag;
  }

  return {
    async list(): Promise<FeatureFlag[]> {
      return db.select().from(featureFlags).orderBy(asc(featureFlags.key));
    },

    /**
     * Flag map for runtime consumers (`{ key: enabled }`), cached in-memory.
     * Mutations through this service invalidate the cache immediately; other
     * instances converge within the TTL.
     */
    async evaluateAll(): Promise<Record<string, boolean>> {
      if (cache && cache.expiresAt > now()) return cache.value;
      const flags = await db.select().from(featureFlags);
      const value = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
      cache = { value, expiresAt: now() + cacheTtlMs };
      return value;
    },

    async create(input: CreateFeatureFlagInput, actor: AdminActor): Promise<FeatureFlag> {
      const flag = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(featureFlags)
          .values({
            key: input.key,
            description: input.description ?? null,
            enabled: input.enabled,
          })
          .returning();

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'flag.create',
            entityType: 'feature_flag',
            entityId: row!.id,
            after: { key: row!.key, enabled: row!.enabled, description: row!.description },
          },
          tx,
        );

        return row!;
      });
      invalidate();
      return flag;
    },

    async update(
      id: string,
      input: UpdateFeatureFlagInput,
      actor: AdminActor,
    ): Promise<FeatureFlag | null> {
      const flag = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(featureFlags)
          .where(eq(featureFlags.id, id))
          .limit(1);
        if (!before) return null;

        const [after] = await tx
          .update(featureFlags)
          .set({
            ...(input.enabled !== undefined && { enabled: input.enabled }),
            ...(input.description !== undefined && { description: input.description }),
            updatedAt: new Date(),
          })
          .where(eq(featureFlags.id, id))
          .returning();

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action:
              input.enabled !== undefined && input.description === undefined
                ? 'flag.toggle'
                : 'flag.update',
            entityType: 'feature_flag',
            entityId: id,
            before: { enabled: before.enabled, description: before.description },
            after: { enabled: after!.enabled, description: after!.description },
          },
          tx,
        );

        return after!;
      });
      invalidate();
      return flag;
    },

    async remove(id: string, actor: AdminActor): Promise<boolean> {
      const removed = await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(featureFlags)
          .where(eq(featureFlags.id, id))
          .limit(1);
        if (!before) return false;

        await tx.delete(featureFlags).where(eq(featureFlags.id, id));

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'flag.delete',
            entityType: 'feature_flag',
            entityId: id,
            before: { key: before.key, enabled: before.enabled },
          },
          tx,
        );

        return true;
      });
      invalidate();
      return removed;
    },

    getByKey,
  };
}

export type FeatureFlagService = ReturnType<typeof createFeatureFlagService>;
