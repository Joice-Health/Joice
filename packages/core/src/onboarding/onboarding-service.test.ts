import { describe, expect, test } from 'bun:test';
import type { NewOnboardingSession, OnboardingFlowVersion, OnboardingSession } from '@joice/db';
import { DEFAULT_INTAKE_FLOW } from './default-flow';
import { createOnboardingService, OnboardingServiceError } from './onboarding-service';
import type { SessionStore } from './session-store';
import type { FlowDefinition } from './schemas';
import { logicHash, validateFlowDefinition } from './validate-flow';
import type { ObservationLike } from '../profile/projector';
import type { NewObservationInput } from '../profile/profile-service';

/* ------------------------------------------------------------------------- */
/* Fakes                                                                     */
/* ------------------------------------------------------------------------- */

const report = validateFlowDefinition(DEFAULT_INTAKE_FLOW, { phiEnabled: false });
if (!report.ok) throw new Error('fixture');
const DEF: FlowDefinition = report.definition;

let ids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

function memoryStore(): SessionStore & { rows: OnboardingSession[] } {
  const rows: OnboardingSession[] = [];
  const now = () => new Date('2026-08-19T12:00:00Z');
  return {
    rows,
    async findCurrent(anon) {
      return [...rows].reverse().find((r) => r.anonymousSessionId === anon) ?? null;
    },
    async findById(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async findByMember(memberId) {
      return [...rows].reverse().find((r) => r.memberId === memberId) ?? null;
    },
    async create(values: NewOnboardingSession) {
      const row = {
        id: uuid(),
        memberId: null,
        status: 'in_progress',
        answers: {},
        skipped: [],
        cursorQuestionKey: null,
        carryOver: null,
        gateOutcome: null,
        ipHash: null,
        completedAt: null,
        claimedAt: null,
        lastActivityAt: now(),
        createdAt: new Date(now().getTime() + rows.length),
        updatedAt: now(),
        ...values,
      } as OnboardingSession;
      rows.push(row);
      return row;
    },
    async update(id, patch) {
      const row = rows.find((r) => r.id === id)!;
      Object.assign(row, patch, { updatedAt: now() });
      return row;
    },
    async markAbandonedIdle(before) {
      let n = 0;
      for (const r of rows) {
        if (r.status === 'in_progress' && r.lastActivityAt < before) {
          r.status = 'abandoned';
          n += 1;
        }
      }
      return n;
    },
    async listUnclaimedBefore(before, limit) {
      return rows.filter((r) => r.status !== 'registered' && r.lastActivityAt < before).slice(0, limit);
    },
    async deleteMany(idList) {
      for (const id of idList) {
        const i = rows.findIndex((r) => r.id === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
  };
}

async function versionRow(def: FlowDefinition, version: number, hash?: string): Promise<OnboardingFlowVersion> {
  return {
    id: uuid(),
    flowId: 'flow-1',
    version,
    status: 'published',
    schemaVersion: 1,
    definition: def as unknown as Record<string, unknown>,
    logicHash: hash ?? (await logicHash(def)),
    notes: null,
    validationReport: null,
    createdBy: 'system',
    publishedBy: 'system',
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function fakes(published: OnboardingFlowVersion, versions: OnboardingFlowVersion[] = [published]) {
  const calls = {
    observations: [] as Array<Record<string, unknown>>,
    projections: [] as Array<{ key: unknown; segment: string | null; traits: Record<string, unknown> }>,
    purged: [] as string[],
    attached: [] as Array<Record<string, unknown>>,
    events: [] as Array<{ event: string; questionKey?: string | null; outcome?: string | null }>,
    requests: [] as Array<Record<string, unknown>>,
    marketing: [] as Array<Record<string, unknown>>,
  };
  const byId = new Map(versions.map((v) => [v.id, v]));
  const flows = {
    async getPublished() {
      return { flow: { id: 'flow-1', key: 'intake', name: 'Intake', publishedVersionId: published.id, createdAt: new Date(), updatedAt: new Date() }, version: published, definition: published.definition as unknown as FlowDefinition };
    },
    async getVersion(id: string) {
      const v = byId.get(id);
      return v ? { version: v, definition: v.definition as unknown as FlowDefinition } : null;
    },
  };
  const otherObservations: ObservationLike[] = [];
  const profiles = {
    async recordObservations(rows: readonly NewObservationInput[]) {
      calls.observations.push(...(rows as unknown as Record<string, unknown>[]));
    },
    async upsertProjection(key: unknown, projection: { segment: string | null; flat: Record<string, unknown> }) {
      calls.projections.push({ key, segment: projection.segment, traits: projection.flat });
      return {} as never;
    },
    async attachToMember(input: Record<string, unknown>) {
      calls.attached.push(input);
      return { reproject: false };
    },
    async listObservations() {
      return otherObservations.map((o) => ({ ...o, confidence: o.confidence ?? 1, observedAt: new Date(o.observedAt) })) as never;
    },
    async purgeSession(input: { onboardingSessionId: string }) {
      calls.purged.push(input.onboardingSessionId);
    },
  };
  const sessions = memoryStore();
  const service = createOnboardingService({
    sessions,
    flows,
    profiles,
    serviceAreas: { map: async () => ({ CA: 'open', NY: 'notify', TX: 'closed' }) },
    config: { get: async () => ({ minimumAge: 18 }) },
    events: { record: async (e) => void calls.events.push({ event: e.event, questionKey: e.questionKey, outcome: e.outcome }) },
    requests: { request: async (r) => { calls.requests.push(r); return { row: {} as never, created: true }; } },
    marketing: { serviceAreaRequested: async () => {}, intakeCompleted: async (p) => void calls.marketing.push(p as unknown as Record<string, unknown>) },
    now: () => new Date('2026-08-19T12:00:00Z'),
  });
  return { service, sessions, calls, otherObservations };
}

const ADULT = '2000-01-01';
const COOKIE = 'anon-cookie-1';

async function answerAll(service: ReturnType<typeof fakes>['service'], entries: Array<[string, unknown]>) {
  let last;
  for (const [questionKey, value] of entries) {
    last = await service.answer({ anonymousSessionId: COOKIE, questionKey, value });
    if (!last.ok) throw new Error(`${questionKey}: ${last.code} ${last.message}`);
  }
  return last!;
}

/* ------------------------------------------------------------------------- */

describe('onboarding service', () => {
  test('loadOrCreate pins a new session to the published version and asks the first question', async () => {
    const v1 = await versionRow(DEF, 1);
    const { service, sessions, calls } = fakes(v1);
    const state = await service.loadOrCreate({ anonymousSessionId: COOKIE, carryOver: { firstName: 'Sam', goal: 'energy' } });
    expect(state.status).toBe('in_progress');
    expect(state.flowVersion).toBe(1);
    expect(state.step.kind === 'question' && state.step.question.key).toBe('us_state');
    expect(state.copy.carriedTitle).toBe('Hi Sam. Two quick things first.');
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]!.flowVersionId).toBe(v1.id);
    expect(sessions.rows[0]!.carryOver).toEqual({ firstName: 'Sam', goal: 'energy' });
    expect(calls.events.map((e) => e.event)).toEqual(['session_started', 'step_viewed']);
    // A second load resumes the same session and keeps the carry-over.
    const again = await service.loadOrCreate({ anonymousSessionId: COOKIE });
    expect(again.sessionId).toBe(state.sessionId);
    expect(sessions.rows).toHaveLength(1);
  });

  test('answers persist, observations are recorded with their source, completion projects the profile', async () => {
    const v1 = await versionRow(DEF, 1);
    const { service, sessions, calls } = fakes(v1);
    await service.loadOrCreate({ anonymousSessionId: COOKIE, carryOver: { goal: 'energy', firstName: 'Sam' } });
    const done = await answerAll(service, [
      ['us_state', 'CA'],
      ['date_of_birth', ADULT],
      ['goal', 'energy'],
      ['peptide_experience', 'none'],
      ['first_name', 'Samantha'],
      ['consent_terms', true],
    ]);
    expect(done.ok && done.state.step.kind === 'question' && done.state.step.question.key).toBe('consent_marketing');
    const skipped = await service.skip({ anonymousSessionId: COOKIE, questionKey: 'consent_marketing' });
    expect(skipped.ok && skipped.state.status).toBe('completed');
    expect(skipped.ok && skipped.state.step.kind).toBe('complete');
    if (skipped.ok && skipped.state.step.kind === 'complete') {
      expect(skipped.state.step.nextHref).toBe('/sign-up');
      expect(skipped.state.step.segment).toBe('energy');
    }
    expect(sessions.rows[0]!.completedAt).not.toBeNull();
    const goalObs = calls.observations.find((o) => o.trait === 'goal')!;
    expect(goalObs).toMatchObject({ value: 'energy', source: 'companion', questionKey: 'goal' });
    expect(calls.observations.find((o) => o.trait === 'first_name')).toMatchObject({ value: 'Samantha', source: 'onboarding' });
    expect(calls.projections).toHaveLength(1);
    expect(calls.projections[0]).toMatchObject({ key: { anonymousSessionId: COOKIE }, segment: 'energy' });
    expect(calls.projections[0]!.traits.age).toBe(26);
    expect(calls.events.map((e) => e.event)).toContain('completed');
  });

  test('a minor is gated, nothing is kept, and the profile is purged', async () => {
    const { service, sessions, calls } = fakes(await versionRow(DEF, 1));
    await service.loadOrCreate({ anonymousSessionId: COOKIE });
    await answerAll(service, [['us_state', 'CA']]);
    const r = await service.answer({ anonymousSessionId: COOKIE, questionKey: 'date_of_birth', value: '2012-05-05' });
    expect(r.ok && r.state.status).toBe('gated_age');
    expect(r.ok && r.state.step.kind === 'gate' && r.state.step.gate.copy.title).toBe('Joice is for adults 18 and over.');
    expect(sessions.rows[0]!.answers).toEqual({});
    expect(calls.observations.find((o) => o.trait === 'date_of_birth')).toBeUndefined();
    expect(calls.purged).toEqual([sessions.rows[0]!.id]);
    expect(calls.events.map((e) => e.outcome)).toContain('stop_age');
    const again = await service.answer({ anonymousSessionId: COOKIE, questionKey: 'goal', value: 'energy' });
    expect(again.ok).toBe(false);
    expect(!again.ok && again.code).toBe('gated');
  });

  test('a notify state gates with state copy, and notify records a request once', async () => {
    const { service, sessions, calls } = fakes(await versionRow(DEF, 1));
    await service.loadOrCreate({ anonymousSessionId: COOKIE, carryOver: { email: 's@example.com', firstName: 'Sam' } });
    const r = await answerAll(service, [['us_state', 'NY'], ['date_of_birth', ADULT]]);
    expect(r.ok && r.state.status).toBe('gated_state');
    if (r.ok && r.state.step.kind === 'gate') {
      expect(r.state.step.gate).toMatchObject({ outcome: 'notify', stateCode: 'NY', stateName: 'New York', notifySubmitted: false });
      expect(r.state.step.gate.copy.title).toBe('We are not in New York yet.');
      expect(r.state.step.gate.copy.cta).toBe('Tell me when New York opens +');
    }
    const n = await service.notify({ anonymousSessionId: COOKIE, email: 's@example.com' });
    expect(n.ok && n.state.step.kind === 'gate' && n.state.step.gate.notifySubmitted).toBe(true);
    expect(calls.requests).toEqual([
      { email: 's@example.com', firstName: 'Sam', stateCode: 'NY', onboardingSessionId: sessions.rows[0]!.id, ipHash: null },
    ]);
    // Notify on a session that is not gated is refused.
    const { service: s2 } = fakes(await versionRow(DEF, 1));
    await s2.loadOrCreate({ anonymousSessionId: COOKIE });
    const bad = await s2.notify({ anonymousSessionId: COOKIE, email: 'x@example.com' });
    expect(!bad.ok && bad.code).toBe('not_gated');
  });

  test('a copy-only publish moves an in-progress session forward; a logic change does not', async () => {
    const copyChanged = structuredClone(DEF);
    copyChanged.copy['intro.title'] = 'Hello.';
    const logicChanged = structuredClone(DEF);
    logicChanged.sections[2]!.showIf = { trait: 'goal', op: 'in', value: ['weight-metabolic', 'energy'] };

    const v1 = await versionRow(DEF, 1);
    const v2copy = await versionRow(copyChanged, 2);
    const v3logic = await versionRow(logicChanged, 3);
    expect(v1.logicHash).toBe(v2copy.logicHash);
    expect(v1.logicHash).not.toBe(v3logic.logicHash);

    // Session on v1; published is v2 (copy only): forwarded.
    const a = fakes(v2copy, [v1, v2copy]);
    await a.sessions.create({ flowVersionId: v1.id, anonymousSessionId: COOKIE, status: 'in_progress', answers: { us_state: 'CA' }, skipped: [] });
    const s = await a.service.loadOrCreate({ anonymousSessionId: COOKIE });
    expect(s.flowVersion).toBe(2);
    expect(s.copy.introTitle).toBe('Hello.');
    expect(a.sessions.rows[0]!.flowVersionId).toBe(v2copy.id);

    // Session on v1; published is v3 (logic changed): stays on v1.
    const b = fakes(v3logic, [v1, v3logic]);
    await b.sessions.create({ flowVersionId: v1.id, anonymousSessionId: COOKIE, status: 'in_progress', answers: {}, skipped: [] });
    const t = await b.service.loadOrCreate({ anonymousSessionId: COOKIE });
    expect(t.flowVersion).toBe(1);
  });

  test('claim requires a verified email, links once, refuses another member, and syncs marketing with the consent flag', async () => {
    const { service, sessions, calls } = fakes(await versionRow(DEF, 1));
    await service.loadOrCreate({ anonymousSessionId: COOKIE });
    await answerAll(service, [
      ['us_state', 'CA'],
      ['date_of_birth', ADULT],
      ['goal', 'stress-sleep'],
      ['peptide_experience', 'some'],
      ['first_name', 'Sam'],
      ['consent_terms', true],
      ['consent_marketing', true],
    ]);
    const member = { id: 'mem-1', email: 'sam@example.com', emailVerified: true };
    await expect(service.claim({ anonymousSessionId: COOKIE, member: { ...member, emailVerified: false } })).rejects.toBeInstanceOf(OnboardingServiceError);

    const first = await service.claim({ anonymousSessionId: COOKIE, member });
    expect(first.alreadyClaimed).toBe(false);
    expect(first.state.status).toBe('registered');
    expect(first.state.memberId).toBe('mem-1');
    expect(sessions.rows[0]!.claimedAt).not.toBeNull();
    expect(calls.attached[0]).toMatchObject({ memberId: 'mem-1', anonymousSessionId: COOKIE });
    // Re-projected under the member key, on top of the completion projection.
    expect(calls.projections.at(-1)).toMatchObject({ key: { memberId: 'mem-1' }, segment: 'sleep-first' });
    expect(calls.marketing[0]).toMatchObject({ email: 'sam@example.com', firstName: 'Sam', goal: 'stress-sleep', segment: 'sleep-first', stateCode: 'CA', consentMarketing: true, eventId: 'intake:mem-1' });

    const second = await service.claim({ anonymousSessionId: COOKIE, member });
    expect(second.alreadyClaimed).toBe(true);
    expect(calls.marketing).toHaveLength(1);

    await expect(service.claim({ anonymousSessionId: COOKIE, member: { ...member, id: 'mem-2' } })).rejects.toMatchObject({ code: 'forbidden' });
    expect(await service.stateForMember('mem-1')).toMatchObject({ status: 'registered' });
  });

  test('a gated session cannot be claimed', async () => {
    const { service } = fakes(await versionRow(DEF, 1));
    await service.loadOrCreate({ anonymousSessionId: COOKIE });
    await answerAll(service, [['us_state', 'TX'], ['date_of_birth', ADULT]]);
    await expect(
      service.claim({ anonymousSessionId: COOKIE, member: { id: 'm', email: 'e@example.com', emailVerified: true } }),
    ).rejects.toMatchObject({ code: 'not_claimable' });
  });

  test('restart abandons and purges the current session and starts fresh', async () => {
    const { service, sessions, calls } = fakes(await versionRow(DEF, 1));
    await service.loadOrCreate({ anonymousSessionId: COOKIE });
    await answerAll(service, [['us_state', 'CA']]);
    const fresh = await service.restart({ anonymousSessionId: COOKIE });
    expect(sessions.rows).toHaveLength(2);
    expect(sessions.rows[0]!.status).toBe('abandoned');
    expect(calls.purged).toEqual([sessions.rows[0]!.id]);
    expect(fresh.step.kind === 'question' && fresh.step.question.key).toBe('us_state');
    expect(fresh.sessionId).toBe(sessions.rows[1]!.id);
  });

  test('back moves the cursor and the next answer clears it', async () => {
    const { service, sessions } = fakes(await versionRow(DEF, 1));
    await service.loadOrCreate({ anonymousSessionId: COOKIE });
    await answerAll(service, [['us_state', 'CA'], ['date_of_birth', ADULT]]);
    const b = await service.back({ anonymousSessionId: COOKIE });
    expect(b.ok && b.state.step.kind === 'question' && b.state.step.question.key).toBe('date_of_birth');
    expect(sessions.rows[0]!.cursorQuestionKey).toBe('date_of_birth');
    await answerAll(service, [['date_of_birth', '1999-09-09']]);
    expect(sessions.rows[0]!.cursorQuestionKey).toBeNull();
  });

  test('sweep abandons idle sessions and purges old unclaimed ones, never registered', async () => {
    const { service, sessions, calls } = fakes(await versionRow(DEF, 1));
    const old = new Date('2026-01-01T00:00:00Z');
    await sessions.create({ flowVersionId: 'v', anonymousSessionId: 'a', status: 'in_progress', answers: {}, skipped: [], lastActivityAt: old });
    await sessions.create({ flowVersionId: 'v', anonymousSessionId: 'b', status: 'completed', answers: {}, skipped: [], lastActivityAt: old });
    await sessions.create({ flowVersionId: 'v', anonymousSessionId: 'c', status: 'registered', memberId: 'm', answers: {}, skipped: [], lastActivityAt: old });
    await sessions.create({ flowVersionId: 'v', anonymousSessionId: 'd', status: 'in_progress', answers: {}, skipped: [] });
    const dry = await service.sweep({ idleDays: 30, purgeDays: 90, dryRun: true });
    expect(dry).toEqual({ abandoned: 0, purged: 2 });
    expect(sessions.rows).toHaveLength(4);
    const real = await service.sweep({ idleDays: 30, purgeDays: 90 });
    expect(real).toEqual({ abandoned: 1, purged: 2 });
    expect(sessions.rows.map((r) => r.anonymousSessionId)).toEqual(['c', 'd']);
    expect(calls.purged).toHaveLength(2);
  });
});
