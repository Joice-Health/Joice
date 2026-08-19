import { type Database, and, count, eq, gte, lte, onboardingEvents, sql } from '@joice/db';
import type { FunnelQuery } from './admin-schemas';

export const ONBOARDING_EVENTS = [
  'session_started',
  'step_viewed',
  'step_answered',
  'step_skipped',
  'step_back',
  'answers_pruned',
  'gate_hit',
  'notify_submitted',
  'completed',
  'claimed',
  'restarted',
] as const;
export type OnboardingEventName = (typeof ONBOARDING_EVENTS)[number];

export interface OnboardingEventInput {
  event: OnboardingEventName;
  sessionId: string;
  flowVersionId: string;
  sectionKey?: string | null;
  questionKey?: string | null;
  /** An enum-ish label (gate outcome, reason); never an answer value. */
  outcome?: string | null;
}

export interface FunnelReport {
  starts: number;
  completions: number;
  registrations: number;
  gates: Record<string, number>;
  questions: Array<{ questionKey: string; viewed: number; answered: number; skipped: number }>;
}

/**
 * Funnel events. Keys and outcomes only, never values, so the admin funnel and
 * GTM carry the same shape and neither carries PII. Recording never fails a
 * request: errors are logged and swallowed.
 */
export function createOnboardingEventsService(db: Database) {
  return {
    async record(input: OnboardingEventInput): Promise<void> {
      try {
        await db.insert(onboardingEvents).values({
          event: input.event,
          sessionId: input.sessionId,
          flowVersionId: input.flowVersionId,
          sectionKey: input.sectionKey ?? null,
          questionKey: input.questionKey ?? null,
          outcome: input.outcome ?? null,
        });
      } catch (err) {
        console.error(`[onboarding] event ${input.event} not recorded:`, err);
      }
    },

    async funnel({ versionId, from, to }: FunnelQuery): Promise<FunnelReport> {
      const where = and(
        eq(onboardingEvents.flowVersionId, versionId),
        from ? gte(onboardingEvents.occurredAt, new Date(from)) : undefined,
        to ? lte(onboardingEvents.occurredAt, new Date(to)) : undefined,
      );
      const rows = await db
        .select({
          event: onboardingEvents.event,
          questionKey: onboardingEvents.questionKey,
          outcome: onboardingEvents.outcome,
          // Distinct sessions, so a refresh loop does not inflate the funnel.
          sessions: sql<number>`count(distinct ${onboardingEvents.sessionId})`.mapWith(Number),
          total: count(),
        })
        .from(onboardingEvents)
        .where(where)
        .groupBy(onboardingEvents.event, onboardingEvents.questionKey, onboardingEvents.outcome);

      const report: FunnelReport = { starts: 0, completions: 0, registrations: 0, gates: {}, questions: [] };
      const byQuestion = new Map<string, { viewed: number; answered: number; skipped: number }>();
      const q = (key: string) => {
        let entry = byQuestion.get(key);
        if (!entry) {
          entry = { viewed: 0, answered: 0, skipped: 0 };
          byQuestion.set(key, entry);
        }
        return entry;
      };
      for (const row of rows) {
        switch (row.event) {
          case 'session_started':
            report.starts += row.sessions;
            break;
          case 'completed':
            report.completions += row.sessions;
            break;
          case 'claimed':
            report.registrations += row.sessions;
            break;
          case 'gate_hit':
            report.gates[row.outcome ?? 'unknown'] = (report.gates[row.outcome ?? 'unknown'] ?? 0) + row.sessions;
            break;
          case 'step_viewed':
            if (row.questionKey) q(row.questionKey).viewed += row.sessions;
            break;
          case 'step_answered':
            if (row.questionKey) q(row.questionKey).answered += row.sessions;
            break;
          case 'step_skipped':
            if (row.questionKey) q(row.questionKey).skipped += row.sessions;
            break;
        }
      }
      report.questions = [...byQuestion.entries()].map(([questionKey, v]) => ({ questionKey, ...v }));
      return report;
    },
  };
}

export type OnboardingEventsService = ReturnType<typeof createOnboardingEventsService>;
