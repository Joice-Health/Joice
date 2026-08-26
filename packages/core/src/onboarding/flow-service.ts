import {
  type Database,
  type OnboardingFlow,
  type OnboardingFlowVersion,
  and,
  desc,
  eq,
  onboardingFlowVersions,
  onboardingFlows,
} from '@joice/db';
import type { AuditService, Tx } from '../admin/audit-service';
import type { AdminActor } from '../admin/schemas';
import { DEFAULT_INTAKE_FLOW } from './default-flow';
import { FLOW_KEY, FLOW_SCHEMA_VERSION, flowDefinitionSchema, type FlowDefinition } from './schemas';
import { logicHash, validateFlowDefinition, type ValidationReport } from './validate-flow';

export interface FlowServiceOptions {
  /** Both PHI keys on (PHI_READY env and the onboarding_health flag). */
  phiEnabled: () => Promise<boolean> | boolean;
  cacheTtlMs?: number;
  now?: () => number;
}

export interface PublishedFlow {
  flow: OnboardingFlow;
  version: OnboardingFlowVersion;
  definition: FlowDefinition;
}

export type FlowServiceErrorCode = 'not_found' | 'not_draft' | 'not_publishable' | 'unreadable';

export class FlowServiceError extends Error {
  constructor(
    public readonly code: FlowServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FlowServiceError';
  }
}

/**
 * Flow definitions and their versions. Drafts are edited in place; publish
 * validates, freezes the row, archives the previously published version and
 * moves the flow's pointer, all in one transaction with an `onboarding.publish`
 * audit row; rollback is a pointer move with its own audit row. The published
 * definition is cached ~30s for the session service; a definition this build
 * cannot read (newer schemaVersion, or one that fails the schema) is refused
 * rather than served, which is what keeps a rolled-back image safe.
 */
export function createFlowService(
  db: Database,
  audit: AuditService,
  { phiEnabled, cacheTtlMs = 30_000, now = () => Date.now() }: FlowServiceOptions,
) {
  const cache = new Map<string, { value: PublishedFlow; expiresAt: number }>();
  const invalidate = () => cache.clear();

  function readDefinition(row: OnboardingFlowVersion): FlowDefinition {
    if (row.schemaVersion > FLOW_SCHEMA_VERSION) {
      throw new FlowServiceError(
        'unreadable',
        `Flow version ${row.version} is schema ${row.schemaVersion}; this build reads up to ${FLOW_SCHEMA_VERSION}`,
      );
    }
    const parsed = flowDefinitionSchema.safeParse(row.definition);
    if (!parsed.success) {
      throw new FlowServiceError('unreadable', `Flow version ${row.version} does not parse: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
  }

  type Queryable = Database | Tx;

  async function getFlow(key: string, tx: Queryable = db): Promise<OnboardingFlow | null> {
    const [flow] = await tx.select().from(onboardingFlows).where(eq(onboardingFlows.key, key)).limit(1);
    return flow ?? null;
  }

  async function getVersionRow(id: string, tx: Queryable = db): Promise<OnboardingFlowVersion | null> {
    const [row] = await tx.select().from(onboardingFlowVersions).where(eq(onboardingFlowVersions.id, id)).limit(1);
    return row ?? null;
  }

  return {
    readDefinition,

    /** The published flow for a key, cached. Throws when none is published. */
    async getPublished(key: string = FLOW_KEY): Promise<PublishedFlow> {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now()) return hit.value;
      const flow = await getFlow(key);
      if (!flow?.publishedVersionId) throw new FlowServiceError('not_found', `No published flow for ${key}`);
      const version = await getVersionRow(flow.publishedVersionId);
      if (!version) throw new FlowServiceError('not_found', `Published version of ${key} is missing`);
      const value = { flow, version, definition: readDefinition(version) };
      cache.set(key, { value, expiresAt: now() + cacheTtlMs });
      return value;
    },

    /** A specific version with its parsed definition (what a session pins). */
    async getVersion(id: string): Promise<{ version: OnboardingFlowVersion; definition: FlowDefinition } | null> {
      const version = await getVersionRow(id);
      if (!version) return null;
      return { version, definition: readDefinition(version) };
    },

    async listFlows(): Promise<OnboardingFlow[]> {
      return db.select().from(onboardingFlows);
    },

    async listVersions(key: string = FLOW_KEY): Promise<OnboardingFlowVersion[]> {
      const flow = await getFlow(key);
      if (!flow) return [];
      return db
        .select()
        .from(onboardingFlowVersions)
        .where(eq(onboardingFlowVersions.flowId, flow.id))
        .orderBy(desc(onboardingFlowVersions.version));
    },

    /** Validate without saving (the editor's live report). */
    async validate(definition: unknown): Promise<ValidationReport> {
      const report = validateFlowDefinition(definition, { phiEnabled: await phiEnabled() });
      return { ok: report.ok, errors: report.errors, warnings: report.warnings };
    },

    /**
     * A new draft: a copy of the given version, else of the published one,
     * else the code default. Version numbers only ever go up.
     */
    async createDraft(
      key: string,
      input: { fromVersionId?: string; notes?: string },
      actor: AdminActor,
    ): Promise<OnboardingFlowVersion> {
      return db.transaction(async (tx) => {
        let flow = await getFlow(key, tx);
        if (!flow) {
          const [created] = await tx.insert(onboardingFlows).values({ key, name: key }).returning();
          flow = created!;
        }
        let source: unknown = DEFAULT_INTAKE_FLOW;
        const fromId = input.fromVersionId ?? flow.publishedVersionId ?? undefined;
        if (fromId) {
          const from = await getVersionRow(fromId, tx);
          if (!from) throw new FlowServiceError('not_found', 'Source version not found');
          source = from.definition;
        }
        const [latest] = await tx
          .select({ version: onboardingFlowVersions.version })
          .from(onboardingFlowVersions)
          .where(eq(onboardingFlowVersions.flowId, flow.id))
          .orderBy(desc(onboardingFlowVersions.version))
          .limit(1);
        const definition = flowDefinitionSchema.parse(source);
        const [row] = await tx
          .insert(onboardingFlowVersions)
          .values({
            flowId: flow.id,
            version: (latest?.version ?? 0) + 1,
            status: 'draft',
            schemaVersion: definition.schemaVersion,
            definition,
            notes: input.notes ?? null,
            createdBy: actor.clerkUserId,
          })
          .returning();
        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'onboarding.draft_created',
            entityType: 'onboarding_flow_version',
            entityId: row!.id,
            after: { version: row!.version, from: fromId ?? 'default' },
          },
          tx,
        );
        return row!;
      });
    },

    /** Save a draft's definition; the live report comes back with it. */
    async saveDraft(
      id: string,
      input: { definition: unknown; notes?: string },
      actor: AdminActor,
    ): Promise<{ version: OnboardingFlowVersion; report: ValidationReport }> {
      const report = await this.validate(input.definition);
      const version = await db.transaction(async (tx) => {
        const before = await getVersionRow(id, tx);
        if (!before) throw new FlowServiceError('not_found', 'Version not found');
        if (before.status !== 'draft') throw new FlowServiceError('not_draft', 'Only drafts can be edited');
        // Save even when the report has errors: the editor shows them; publish refuses them.
        const definition = flowDefinitionSchema.safeParse(input.definition);
        const [row] = await tx
          .update(onboardingFlowVersions)
          .set({
            definition: (definition.success ? definition.data : input.definition) as Record<string, unknown>,
            schemaVersion: definition.success ? definition.data.schemaVersion : before.schemaVersion,
            validationReport: report as unknown as Record<string, unknown>,
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            updatedAt: new Date(),
          })
          .where(eq(onboardingFlowVersions.id, id))
          .returning();
        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'onboarding.draft_saved',
            entityType: 'onboarding_flow_version',
            entityId: id,
            after: { version: row!.version, ok: report.ok, errors: report.errors.length, warnings: report.warnings.length },
          },
          tx,
        );
        return row!;
      });
      return { version, report };
    },

    /**
     * Publish a draft. Refused (with the report) when validation fails;
     * otherwise freezes the version, archives the previous published one,
     * moves the pointer and audits, atomically.
     */
    async publish(
      id: string,
      actor: AdminActor,
      input: { notes?: string } = {},
    ): Promise<{ ok: true; version: OnboardingFlowVersion } | { ok: false; report: ValidationReport }> {
      const target = await getVersionRow(id);
      if (!target) throw new FlowServiceError('not_found', 'Version not found');
      if (target.status !== 'draft') throw new FlowServiceError('not_publishable', 'Only drafts can be published');
      const result = validateFlowDefinition(target.definition, { phiEnabled: await phiEnabled() });
      if (!result.ok) return { ok: false, report: { ok: false, errors: result.errors, warnings: result.warnings } };
      const hash = await logicHash(result.definition);

      const version = await db.transaction(async (tx) => {
        const flow = await getFlow(FLOW_KEY, tx);
        const [flowRow] = flow ? [flow] : await tx.select().from(onboardingFlows).where(eq(onboardingFlows.id, target.flowId)).limit(1);
        if (!flowRow) throw new FlowServiceError('not_found', 'Flow not found');
        const previousId = flowRow.publishedVersionId;
        const publishedAt = new Date();
        const [row] = await tx
          .update(onboardingFlowVersions)
          .set({
            status: 'published',
            definition: result.definition,
            logicHash: hash,
            validationReport: { ok: true, errors: [], warnings: result.warnings } as unknown as Record<string, unknown>,
            publishedBy: actor.clerkUserId,
            publishedAt,
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            updatedAt: publishedAt,
          })
          .where(eq(onboardingFlowVersions.id, id))
          .returning();
        if (previousId && previousId !== id) {
          await tx
            .update(onboardingFlowVersions)
            .set({ status: 'archived', updatedAt: publishedAt })
            .where(and(eq(onboardingFlowVersions.id, previousId), eq(onboardingFlowVersions.status, 'published')));
        }
        await tx
          .update(onboardingFlows)
          .set({ publishedVersionId: id, updatedAt: publishedAt })
          .where(eq(onboardingFlows.id, flowRow.id));
        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'onboarding.publish',
            entityType: 'onboarding_flow',
            entityId: flowRow.key,
            before: { publishedVersionId: previousId },
            after: { publishedVersionId: id, version: row!.version, logicHash: hash, warnings: result.warnings.length },
          },
          tx,
        );
        return row!;
      });
      invalidate();
      return { ok: true, version };
    },

    /** Point the flow at an earlier published/archived version. */
    async rollback(key: string, versionId: string, actor: AdminActor): Promise<OnboardingFlowVersion> {
      const version = await db.transaction(async (tx) => {
        const flow = await getFlow(key, tx);
        if (!flow) throw new FlowServiceError('not_found', `Flow ${key} not found`);
        const target = await getVersionRow(versionId, tx);
        if (!target || target.flowId !== flow.id) throw new FlowServiceError('not_found', 'Version not found');
        if (target.status === 'draft') throw new FlowServiceError('not_publishable', 'Publish a draft instead of rolling back to it');
        const previousId = flow.publishedVersionId;
        const at = new Date();
        if (previousId && previousId !== versionId) {
          await tx
            .update(onboardingFlowVersions)
            .set({ status: 'archived', updatedAt: at })
            .where(eq(onboardingFlowVersions.id, previousId));
        }
        const [row] = await tx
          .update(onboardingFlowVersions)
          .set({ status: 'published', updatedAt: at })
          .where(eq(onboardingFlowVersions.id, versionId))
          .returning();
        await tx.update(onboardingFlows).set({ publishedVersionId: versionId, updatedAt: at }).where(eq(onboardingFlows.id, flow.id));
        await audit.record(
          {
            actorClerkUserId: actor.clerkUserId,
            actorEmail: actor.email,
            action: 'onboarding.rollback',
            entityType: 'onboarding_flow',
            entityId: key,
            before: { publishedVersionId: previousId },
            after: { publishedVersionId: versionId, version: row!.version },
          },
          tx,
        );
        return row!;
      });
      invalidate();
      return version;
    },
  };
}

export type FlowService = ReturnType<typeof createFlowService>;
