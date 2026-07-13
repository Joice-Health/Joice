import { type Database, type AppSetting, appSettings, asc, eq } from '@joice/db';
import type { AuditService } from './audit-service';
import type { AdminActor } from './schemas';

/** Runtime key/value settings (jsonb values), editable from the admin UI. */
export function createSettingsService(db: Database, audit: AuditService) {
  return {
    async list(): Promise<AppSetting[]> {
      return db.select().from(appSettings).orderBy(asc(appSettings.key));
    },

    async get(key: string): Promise<AppSetting | undefined> {
      const [setting] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, key))
        .limit(1);
      return setting;
    },

    async upsert(
      key: string,
      value: unknown,
      description: string | undefined,
      actor: AdminActor,
    ): Promise<AppSetting> {
      return db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, key))
          .limit(1);

        const [after] = await tx
          .insert(appSettings)
          .values({ key, value, description: description ?? null })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: {
              value,
              ...(description !== undefined && { description }),
              updatedAt: new Date(),
            },
          })
          .returning();

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: before ? 'setting.update' : 'setting.create',
            entityType: 'app_setting',
            entityId: key,
            before: before ? { value: before.value } : undefined,
            after: { value },
          },
          tx,
        );

        return after!;
      });
    },

    async remove(key: string, actor: AdminActor): Promise<boolean> {
      return db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.key, key))
          .limit(1);
        if (!before) return false;

        await tx.delete(appSettings).where(eq(appSettings.key, key));

        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'setting.delete',
            entityType: 'app_setting',
            entityId: key,
            before: { value: before.value },
          },
          tx,
        );

        return true;
      });
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
