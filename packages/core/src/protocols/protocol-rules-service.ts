import { z } from 'zod';
import { type Database, appSettings, eq } from '@joice/db';
import type { AuditService } from '../admin/audit-service';
import type { AdminActor } from '../admin/schemas';
import { validateCondition, type ConditionIssue } from '../rules/validate';
import { DEFAULT_PROTOCOL_RULES } from './default-rules';
import { protocolRulesSchema, type ProtocolRules } from './schemas';

export const PROTOCOL_RULES_KEY = 'protocol_rules';

const storedSchema = z.object({ rules: protocolRulesSchema }).strict();

export interface ProtocolRulesOptions {
  cacheTtlMs?: number;
  now?: () => number;
}

export class ProtocolRulesInvalidError extends Error {
  constructor(readonly issues: Array<ConditionIssue & { rule: string }>) {
    super('Protocol rules reference unknown traits or invalid operators');
    this.name = 'ProtocolRulesInvalidError';
  }
}

/**
 * The protocol rules row (`app_settings.key = 'protocol_rules'`), the same
 * shape as the onboarding config service: one zod-validated row merged onto
 * code defaults (a stale or invalid row falls back to the example set, never
 * breaks the simulator), cached ~30s, every write audited on its own action so
 * rule changes never hide among flow or gate edits. Not a table on purpose:
 * protocols are not a domain yet, and the settings row keeps the sketch
 * admin-editable without a migration when the editor arrives.
 */
export function createProtocolRulesService(
  db: Database,
  audit: AuditService,
  { cacheTtlMs = 30_000, now = () => Date.now() }: ProtocolRulesOptions = {},
) {
  let cache: { value: ProtocolRules; expiresAt: number } | undefined;

  const resolve = (stored: unknown): ProtocolRules => {
    const parsed = storedSchema.safeParse(stored ?? undefined);
    return parsed.success ? parsed.data.rules : DEFAULT_PROTOCOL_RULES;
  };

  async function readStored(): Promise<unknown> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PROTOCOL_RULES_KEY)).limit(1);
    return row?.value;
  }

  return {
    /** The active rule set: the stored row, or the code defaults. */
    async get(): Promise<ProtocolRules> {
      if (cache && cache.expiresAt > now()) return cache.value;
      const value = resolve(await readStored());
      cache = { value, expiresAt: now() + cacheTtlMs };
      return value;
    },

    /**
     * Replace the rule set. Refuses rules whose conditions reference unknown
     * traits or type-invalid operators, with the same issue shape the flow
     * editor's condition builder shows.
     */
    async save(rules: ProtocolRules, actor: AdminActor): Promise<ProtocolRules> {
      const parsed = protocolRulesSchema.parse(rules);
      const issues = parsed.flatMap((rule) =>
        validateCondition(rule.when, { customTypes: {} }).map((issue) => ({ ...issue, rule: rule.protocolKey })),
      );
      if (issues.length > 0) throw new ProtocolRulesInvalidError(issues);

      const next = await db.transaction(async (tx) => {
        const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, PROTOCOL_RULES_KEY)).limit(1);
        const before = resolve(row?.value);
        const value = { rules: parsed };
        await tx
          .insert(appSettings)
          .values({ key: PROTOCOL_RULES_KEY, value, description: 'Protocol rules: conditions over traits, simulator preview only' })
          .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'protocols.rules_saved',
            entityType: 'protocol_rules',
            entityId: PROTOCOL_RULES_KEY,
            before,
            after: parsed,
          },
          tx,
        );
        return parsed;
      });
      cache = undefined;
      return next;
    },
  };
}

export type ProtocolRulesService = ReturnType<typeof createProtocolRulesService>;
