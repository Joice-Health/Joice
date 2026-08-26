import type { NewOnboardingSession, OnboardingSession } from '@joice/db';
import { usStateName } from '@joice/utils';
import { answersAsObservations, projectObservations, type ObservationLike } from '../profile/projector';
import type { ProfileService } from '../profile/profile-service';
import type { ServiceAreaStatus } from '../profile/traits';
import {
  answerSource,
  applyAnswer,
  applySkip,
  goBack,
  next,
  summaryFor,
  walk,
  type CarryOver,
  type EngineContext,
  type GateOutcomeRecord,
  type SessionSnapshot,
} from './engine';
import type { OnboardingEventsService } from './events-service';
import type { FlowService } from './flow-service';
import { noopOnboardingMarketingPort, type OnboardingMarketingPort } from './marketing-port';
import type { FlowDefinition, GateView, SessionState, SessionStatus, StepView } from './schemas';
import type { ServiceAreaRequestService } from './service-area-request-service';
import type { SessionStore } from './session-store';

/**
 * The session service: the only thing that talks to the engine on behalf of a
 * visitor. It loads the session for a cookie, pins it to a flow version, runs
 * the engine, persists the snapshot, records observations and events, and
 * returns the state the browser renders. The engine decides what is next;
 * this decides what is stored.
 *
 * Rules that live here and nowhere else:
 * - Sessions pin a flow version. A copy-only publish (same logic hash) moves
 *   an in-progress session forward on its next request; a logic change never
 *   does.
 * - A gated session is terminal. A minor's date of birth is never stored (the
 *   engine refuses it) and the session's answers and observations are purged.
 * - Claim links a session to a member only when the member's email is
 *   verified, stamps observations, re-projects, and is idempotent.
 */

export interface OnboardingServiceDeps {
  sessions: SessionStore;
  flows: Pick<FlowService, 'getPublished' | 'getVersion'>;
  profiles: Pick<ProfileService, 'recordObservations' | 'upsertProjection' | 'attachToMember' | 'listObservations' | 'purgeSession'>;
  serviceAreas: { map(): Promise<Record<string, ServiceAreaStatus>> };
  config: { get(): Promise<{ minimumAge: number }> };
  events: Pick<OnboardingEventsService, 'record'>;
  requests: Pick<ServiceAreaRequestService, 'request'>;
  marketing?: OnboardingMarketingPort;
  now?: () => Date;
  /** Where the completion step sends the visitor (the sign-up page). */
  nextHref?: string;
}

export type ActionResult =
  | { ok: true; state: SessionState }
  | { ok: false; code: 'unknown_question' | 'not_eligible' | 'invalid_value' | 'required' | 'gated' | 'not_gated' | 'no_session' | 'forbidden'; message: string; questionKey?: string };

export class OnboardingServiceError extends Error {
  constructor(
    public readonly code: 'no_session' | 'forbidden' | 'not_claimable',
    message: string,
  ) {
    super(message);
    this.name = 'OnboardingServiceError';
  }
}

interface Loaded {
  session: OnboardingSession;
  definition: FlowDefinition;
  versionNumber: number;
  ctx: EngineContext;
}

export function createOnboardingService({
  sessions,
  flows,
  profiles,
  serviceAreas,
  config,
  events,
  requests,
  marketing = noopOnboardingMarketingPort,
  now = () => new Date(),
  nextHref = '/sign-up',
}: OnboardingServiceDeps) {
  /** Published versions are immutable, so definitions by id can be cached for the process. */
  const definitions = new Map<string, { definition: FlowDefinition; versionNumber: number; logicHash: string | null }>();

  async function definitionFor(versionId: string) {
    const hit = definitions.get(versionId);
    if (hit) return hit;
    const found = await flows.getVersion(versionId);
    if (!found) throw new OnboardingServiceError('no_session', 'The session points at a flow version that no longer exists');
    const value = { definition: found.definition, versionNumber: found.version.version, logicHash: found.version.logicHash };
    definitions.set(versionId, value);
    return value;
  }

  async function contextFor(definition: FlowDefinition): Promise<EngineContext> {
    const [settings, areas] = await Promise.all([config.get(), serviceAreas.map()]);
    return { minimumAge: settings.minimumAge, serviceAreas: areas, now: now(), segmentRules: definition.segmentRules };
  }

  function snapshotOf(session: OnboardingSession): SessionSnapshot {
    return {
      answers: session.answers,
      skipped: session.skipped,
      cursorQuestionKey: session.cursorQuestionKey,
      gateOutcome: (session.gateOutcome as GateOutcomeRecord | null) ?? null,
      carryOver: (session.carryOver as CarryOver | null) ?? null,
    };
  }

  function statusAfter(snap: SessionSnapshot, complete: boolean): SessionStatus {
    if (snap.gateOutcome) return snap.gateOutcome.reason === 'age' ? 'gated_age' : 'gated_state';
    return complete ? 'completed' : 'in_progress';
  }

  /**
   * Move an in-progress session forward when a newer published version has
   * the same logic hash (copy changed, logic did not).
   */
  async function forwardIfCopyOnly(session: OnboardingSession): Promise<OnboardingSession> {
    if (session.status !== 'in_progress') return session;
    const published = await flows.getPublished();
    if (published.version.id === session.flowVersionId) return session;
    const pinned = await definitionFor(session.flowVersionId);
    if (!pinned.logicHash || pinned.logicHash !== published.version.logicHash) return session;
    return sessions.update(session.id, { flowVersionId: published.version.id });
  }

  async function load(anonymousSessionId: string): Promise<Loaded | null> {
    let session = await sessions.findCurrent(anonymousSessionId);
    if (!session || session.status === 'abandoned') return null;
    session = await forwardIfCopyOnly(session);
    const { definition, versionNumber } = await definitionFor(session.flowVersionId);
    return { session, definition, versionNumber, ctx: await contextFor(definition) };
  }

  async function createSession(anonymousSessionId: string, input: { carryOver?: CarryOver; ipHash?: string | null }): Promise<Loaded> {
    const published = await flows.getPublished();
    const values: NewOnboardingSession = {
      flowVersionId: published.version.id,
      anonymousSessionId,
      status: 'in_progress',
      answers: {},
      skipped: [],
      carryOver: input.carryOver && Object.keys(input.carryOver).length > 0 ? (input.carryOver as Record<string, unknown>) : null,
      ipHash: input.ipHash ?? null,
      lastActivityAt: now(),
    };
    const session = await sessions.create(values);
    definitions.set(published.version.id, {
      definition: published.definition,
      versionNumber: published.version.version,
      logicHash: published.version.logicHash,
    });
    void events.record({ event: 'session_started', sessionId: session.id, flowVersionId: session.flowVersionId });
    return { session, definition: published.definition, versionNumber: published.version.version, ctx: await contextFor(published.definition) };
  }

  function renderCopy(template: string | undefined, vars: Record<string, string | undefined>): string {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
  }

  function gateView(def: FlowDefinition, gate: GateOutcomeRecord, snap: SessionSnapshot, notifySubmitted: boolean): GateView {
    const stateName = gate.stateCode ? usStateName(gate.stateCode) : undefined;
    const vars = { state_name: stateName, first_name: firstNameOf(def, snap) };
    const copy = def.copy;
    return {
      gateKey: gate.gateKey,
      sectionKey: gate.sectionKey,
      outcome: gate.outcome,
      reason: gate.reason,
      copy: {
        title: renderCopy(copy[`${gate.copyKey}.title`], vars),
        body: renderCopy(copy[`${gate.copyKey}.body`], vars),
        ...(copy[`${gate.copyKey}.cta`] ? { cta: renderCopy(copy[`${gate.copyKey}.cta`], vars) } : {}),
        ...(copy[`${gate.copyKey}.done`] ? { done: renderCopy(copy[`${gate.copyKey}.done`], vars) } : {}),
      },
      ...(gate.stateCode ? { stateCode: gate.stateCode, stateName } : {}),
      notifySubmitted,
    };
  }

  function firstNameOf(def: FlowDefinition, snap: SessionSnapshot): string | undefined {
    const q = Object.values(def.questions).find((x) => x.trait === 'first_name');
    const answered = q ? snap.answers[q.key] : undefined;
    if (typeof answered === 'string' && answered.trim()) return answered.trim();
    return snap.carryOver?.firstName || undefined;
  }

  function stateOf(loaded: Loaded): SessionState {
    const { session, definition, versionNumber, ctx } = loaded;
    const snap = snapshotOf(session);
    const result = next(definition, snap, ctx);
    let step: StepView;
    if (result.step.kind === 'gate') {
      const notifySubmitted = Boolean((session.gateOutcome as { notifySubmitted?: boolean } | null)?.notifySubmitted);
      step = { kind: 'gate', gate: gateView(definition, result.step.gate, snap, notifySubmitted) };
    } else if (result.step.kind === 'complete') {
      step = { kind: 'complete', copy: definition.completion, summary: result.step.summary, segment: result.step.segment, nextHref };
    } else {
      step = result.step;
    }
    const firstName = firstNameOf(definition, snap);
    const vars = { first_name: firstName };
    return {
      sessionId: session.id,
      flowVersion: versionNumber,
      status: session.status as SessionStatus,
      step,
      progress: result.progress,
      answers: summaryFor(definition, snap, ctx),
      carryOver: (session.carryOver as SessionState['carryOver']) ?? null,
      copy: {
        introTitle: renderCopy(definition.copy['intro.title'], vars) || 'Tell us where you are.',
        introBody: renderCopy(definition.copy['intro.body'], vars),
        ...(firstName && definition.copy['intro.carried.title']
          ? { carriedTitle: renderCopy(definition.copy['intro.carried.title'], vars), carriedBody: renderCopy(definition.copy['intro.carried.body'], vars) }
          : {}),
        ...(definition.copy['resume.note'] ? { resumeNote: definition.copy['resume.note'] } : {}),
      },
      memberId: session.memberId,
    };
  }

  async function persist(loaded: Loaded, snap: SessionSnapshot): Promise<Loaded> {
    const { definition, ctx } = loaded;
    const w = walk(definition, snap, ctx);
    const status = statusAfter(snap, w.complete);
    const patch: Partial<NewOnboardingSession> = {
      answers: snap.answers as Record<string, unknown>,
      skipped: [...snap.skipped],
      cursorQuestionKey: snap.cursorQuestionKey,
      gateOutcome: snap.gateOutcome
        ? { ...(loaded.session.gateOutcome as Record<string, unknown> | null), ...(snap.gateOutcome as unknown as Record<string, unknown>) }
        : null,
      status,
      lastActivityAt: now(),
      ...(status === 'completed' && !loaded.session.completedAt ? { completedAt: now() } : {}),
    };
    const session = await sessions.update(loaded.session.id, patch);
    return { ...loaded, session };
  }

  async function recordStepViewed(loaded: Loaded, state: SessionState) {
    if (state.step.kind === 'question') {
      void events.record({
        event: 'step_viewed',
        sessionId: loaded.session.id,
        flowVersionId: loaded.session.flowVersionId,
        sectionKey: state.step.section.key,
        questionKey: state.step.question.key,
      });
    }
  }

  /** Observations for the session's current path, plus anything other sources recorded. */
  async function observationsFor(loaded: Loaded, snap: SessionSnapshot): Promise<ObservationLike[]> {
    const { definition, ctx, session } = loaded;
    const w = walk(definition, snap, ctx, { stopAtGates: false });
    const entries = w.path
      .filter((p) => p.state === 'answered')
      .map((p) => {
        const q = definition.questions[p.questionKey]!;
        const value = snap.answers[p.questionKey];
        return { trait: q.trait, value, source: answerSource(q, value, snap.carryOver) };
      });
    const others = await profiles.listObservations({
      ...(session.memberId ? { memberId: session.memberId } : { onboardingSessionId: session.id }),
      sources: ['clinician', 'companion', 'system'],
    });
    return [
      ...answersAsObservations(entries, now()),
      ...others.map((o) => ({ trait: o.trait, value: o.value, source: o.source as ObservationLike['source'], confidence: o.confidence, observedAt: o.observedAt })),
    ];
  }

  async function project(loaded: Loaded, snap: SessionSnapshot): Promise<void> {
    const projection = projectObservations(await observationsFor(loaded, snap), loaded.ctx);
    const key = loaded.session.memberId ? { memberId: loaded.session.memberId } : { anonymousSessionId: loaded.session.anonymousSessionId };
    await profiles.upsertProjection(key, projection, loaded.session.flowVersionId);
  }

  const service = {
    /** GET /session: the current session for the cookie, or a new one. */
    async loadOrCreate(input: { anonymousSessionId: string; carryOver?: CarryOver; ipHash?: string | null }): Promise<SessionState> {
      let loaded = await load(input.anonymousSessionId);
      if (!loaded) {
        loaded = await createSession(input.anonymousSessionId, input);
      } else if (input.carryOver && Object.keys(input.carryOver).length > 0 && loaded.session.status === 'in_progress') {
        // Merge newly carried values in; never overwrite what the visitor already typed.
        const merged = { ...(input.carryOver as Record<string, unknown>), ...((loaded.session.carryOver as Record<string, unknown> | null) ?? {}) };
        loaded = { ...loaded, session: await sessions.update(loaded.session.id, { carryOver: merged }) };
      }
      const state = stateOf(loaded);
      void recordStepViewed(loaded, state);
      return state;
    },

    async answer(input: { anonymousSessionId: string; questionKey: string; value: unknown }): Promise<ActionResult> {
      const loaded = await load(input.anonymousSessionId);
      if (!loaded) return { ok: false, code: 'no_session', message: 'Start the intake first' };
      const snap = snapshotOf(loaded.session);
      const result = applyAnswer(loaded.definition, snap, loaded.ctx, input.questionKey, input.value);
      if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message, questionKey: input.questionKey };

      const sid = loaded.session.id;
      const vid = loaded.session.flowVersionId;
      const question = loaded.definition.questions[input.questionKey]!;
      const sectionKey = loaded.definition.sections.find((s) => s.questions.includes(input.questionKey))?.key ?? null;

      if (result.gate && result.gate.reason === 'age') {
        // A minor: nothing of theirs is kept beyond the fact that the gate fired.
        const purged: SessionSnapshot = { ...result.snapshot, answers: {}, skipped: [], cursorQuestionKey: null };
        const after = await persist(loaded, purged);
        await profiles.purgeSession({ onboardingSessionId: sid, anonymousSessionId: loaded.session.anonymousSessionId });
        void events.record({ event: 'gate_hit', sessionId: sid, flowVersionId: vid, sectionKey, outcome: `${result.gate.outcome}_${result.gate.reason}` });
        return { ok: true, state: stateOf(after) };
      }

      const wasCompleted = loaded.session.status === 'completed';
      const after = await persist(loaded, result.snapshot);
      if (result.accepted.persisted) {
        await profiles.recordObservations([
          {
            trait: result.accepted.trait,
            value: result.accepted.value,
            source: result.accepted.source,
            onboardingSessionId: sid,
            memberId: loaded.session.memberId,
            flowVersionId: vid,
            questionKey: input.questionKey,
            observedAt: now(),
          },
        ]);
      }
      void events.record({ event: 'step_answered', sessionId: sid, flowVersionId: vid, sectionKey, questionKey: question.key });
      if (result.pruned.length > 0) {
        void events.record({ event: 'answers_pruned', sessionId: sid, flowVersionId: vid, sectionKey, outcome: String(result.pruned.length) });
      }
      if (result.gate) {
        void events.record({ event: 'gate_hit', sessionId: sid, flowVersionId: vid, sectionKey: result.gate.sectionKey, outcome: `${result.gate.outcome}_${result.gate.reason}` });
      }
      if (after.session.status === 'completed' && !wasCompleted) {
        await project(after, result.snapshot);
        void events.record({ event: 'completed', sessionId: sid, flowVersionId: vid });
      }
      const state = stateOf(after);
      void recordStepViewed(after, state);
      return { ok: true, state };
    },

    async skip(input: { anonymousSessionId: string; questionKey: string }): Promise<ActionResult> {
      const loaded = await load(input.anonymousSessionId);
      if (!loaded) return { ok: false, code: 'no_session', message: 'Start the intake first' };
      const result = applySkip(loaded.definition, snapshotOf(loaded.session), loaded.ctx, input.questionKey);
      if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message, questionKey: input.questionKey };
      const wasCompleted = loaded.session.status === 'completed';
      const after = await persist(loaded, result.snapshot);
      const sectionKey = loaded.definition.sections.find((s) => s.questions.includes(input.questionKey))?.key ?? null;
      void events.record({ event: 'step_skipped', sessionId: loaded.session.id, flowVersionId: loaded.session.flowVersionId, sectionKey, questionKey: input.questionKey });
      if (after.session.status === 'completed' && !wasCompleted) {
        await project(after, result.snapshot);
        void events.record({ event: 'completed', sessionId: loaded.session.id, flowVersionId: loaded.session.flowVersionId });
      }
      const state = stateOf(after);
      void recordStepViewed(after, state);
      return { ok: true, state };
    },

    async back(input: { anonymousSessionId: string }): Promise<ActionResult> {
      const loaded = await load(input.anonymousSessionId);
      if (!loaded) return { ok: false, code: 'no_session', message: 'Start the intake first' };
      if (loaded.session.gateOutcome) return { ok: false, code: 'gated', message: 'This session has ended' };
      const snap = goBack(loaded.definition, snapshotOf(loaded.session), loaded.ctx);
      const after = await persist(loaded, snap);
      void events.record({ event: 'step_back', sessionId: loaded.session.id, flowVersionId: loaded.session.flowVersionId, questionKey: snap.cursorQuestionKey });
      return { ok: true, state: stateOf(after) };
    },

    /** Abandon the current session (if any) and start a fresh one on the published flow. */
    async restart(input: { anonymousSessionId: string; carryOver?: CarryOver; ipHash?: string | null }): Promise<SessionState> {
      const current = await sessions.findCurrent(input.anonymousSessionId);
      if (current && current.status !== 'registered') {
        await sessions.update(current.id, { status: 'abandoned' });
        await profiles.purgeSession({ onboardingSessionId: current.id, anonymousSessionId: current.anonymousSessionId });
        void events.record({ event: 'restarted', sessionId: current.id, flowVersionId: current.flowVersionId });
      }
      const loaded = await createSession(input.anonymousSessionId, input);
      return stateOf(loaded);
    },

    /** "Tell me when my state opens." Only meaningful on a notify gate. */
    async notify(input: { anonymousSessionId: string; email: string; firstName?: string; ipHash?: string | null }): Promise<ActionResult> {
      const loaded = await load(input.anonymousSessionId);
      if (!loaded) return { ok: false, code: 'no_session', message: 'Start the intake first' };
      const gate = loaded.session.gateOutcome as (GateOutcomeRecord & { notifySubmitted?: boolean }) | null;
      if (!gate || gate.outcome !== 'notify' || !gate.stateCode) {
        return { ok: false, code: 'not_gated', message: 'There is nothing to be notified about' };
      }
      await requests.request({
        email: input.email,
        firstName: input.firstName ?? firstNameOf(loaded.definition, snapshotOf(loaded.session)) ?? null,
        stateCode: gate.stateCode,
        onboardingSessionId: loaded.session.id,
        ipHash: input.ipHash ?? null,
      });
      const session = await sessions.update(loaded.session.id, {
        gateOutcome: { ...(gate as unknown as Record<string, unknown>), notifySubmitted: true },
        lastActivityAt: now(),
      });
      void events.record({ event: 'notify_submitted', sessionId: session.id, flowVersionId: session.flowVersionId, outcome: gate.stateCode });
      return { ok: true, state: stateOf({ ...loaded, session }) };
    },

    /**
     * Link the session and its profile to a member. Verified email only;
     * idempotent for the same member; refused for a different member.
     */
    async claim(input: {
      anonymousSessionId: string;
      member: { id: string; email: string; emailVerified: boolean; firstName?: string | null };
    }): Promise<{ state: SessionState; alreadyClaimed: boolean }> {
      if (!input.member.emailVerified) throw new OnboardingServiceError('not_claimable', 'Verify your email to save your answers');
      const loaded = await load(input.anonymousSessionId);
      if (!loaded) throw new OnboardingServiceError('no_session', 'There is no intake to save');
      const { session } = loaded;
      if (session.memberId && session.memberId !== input.member.id) {
        throw new OnboardingServiceError('forbidden', 'This intake belongs to another account');
      }
      if (session.memberId === input.member.id) return { state: stateOf(loaded), alreadyClaimed: true };
      if (session.gateOutcome) throw new OnboardingServiceError('not_claimable', 'This intake ended at a gate');

      await profiles.attachToMember({
        onboardingSessionId: session.id,
        anonymousSessionId: session.anonymousSessionId,
        memberId: input.member.id,
      });
      const updated = await sessions.update(session.id, {
        memberId: input.member.id,
        status: 'registered',
        claimedAt: now(),
        lastActivityAt: now(),
      });
      const after: Loaded = { ...loaded, session: updated };
      const snap = snapshotOf(updated);
      // Always re-project under the member key: the anonymous projection may be
      // stale (claim can happen before completion) and the member may already
      // carry observations from another source or device.
      await project(after, snap);
      void events.record({ event: 'claimed', sessionId: updated.id, flowVersionId: updated.flowVersionId });

      const traits = walk(loaded.definition, snap, loaded.ctx, { stopAtGates: false }).traits;
      void marketing
        .intakeCompleted({
          email: input.member.email,
          firstName: (typeof traits.first_name === 'string' ? traits.first_name : input.member.firstName) ?? null,
          goal: typeof traits.goal === 'string' ? traits.goal : null,
          segment: typeof traits.segment === 'string' ? traits.segment : null,
          stateCode: typeof traits.us_state === 'string' ? traits.us_state : null,
          consentMarketing: traits.consent_marketing === true,
          completedAt: now(),
          eventId: `intake:${input.member.id}`,
        })
        .catch((err) => console.error(`[onboarding] marketing sync failed for member ${input.member.id}:`, err));

      return { state: stateOf(after), alreadyClaimed: false };
    },

    /** The member's session state (for /welcome after sign-in on a new device). */
    async stateForMember(memberId: string): Promise<SessionState | null> {
      const session = await sessions.findByMember(memberId);
      if (!session) return null;
      const { definition, versionNumber } = await definitionFor(session.flowVersionId);
      return stateOf({ session, definition, versionNumber, ctx: await contextFor(definition) });
    },

    /**
     * Retention. Idle in-progress sessions become abandoned; unclaimed sessions
     * older than the purge window lose their answers, observations and profile.
     * Registered sessions are never touched.
     */
    async sweep(input: { idleDays: number; purgeDays: number; dryRun?: boolean; batch?: number }): Promise<{ abandoned: number; purged: number }> {
      const ms = 24 * 60 * 60 * 1000;
      const at = now().getTime();
      const idleBefore = new Date(at - input.idleDays * ms);
      const purgeBefore = new Date(at - input.purgeDays * ms);
      const purgeable = await sessions.listUnclaimedBefore(purgeBefore, input.batch ?? 500);
      if (input.dryRun) {
        return { abandoned: 0, purged: purgeable.length };
      }
      const abandoned = await sessions.markAbandonedIdle(idleBefore);
      for (const s of purgeable) {
        await profiles.purgeSession({ onboardingSessionId: s.id, anonymousSessionId: s.anonymousSessionId });
      }
      await sessions.deleteMany(purgeable.map((s) => s.id));
      return { abandoned, purged: purgeable.length };
    },
  };

  return service;
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;
