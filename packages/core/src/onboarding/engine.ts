import { z } from 'zod';
import {
  getTrait,
  isCustomTrait,
  sensitivityOf,
  traitValueSchema,
  type Sensitivity,
} from '../profile/traits';
import { ageOn, deriveTraits, type DeriveContext } from '../profile/derive';
import { evaluateCondition, type SettingsMap, type TraitMap, type WhyNode } from '../rules/evaluate';
import { usStateName } from '@joice/utils';
import {
  TRAIT_TYPE_FOR_QUESTION,
  type FlowDefinition,
  type FlowGate,
  type FlowQuestion,
  type FlowSection,
  type GateOutcome,
  type GateReason,
} from './schemas';

/**
 * The intake engine. Pure: a definition, a session snapshot and a context in,
 * the next step out. No db, no clock of its own, no I/O. The same function
 * serves GET /session, POST /answer, POST /back and the admin simulator, and
 * the test is a table of (answers) -> (expected step).
 *
 * Shape, in one paragraph: walk the sections in order; skip a section whose
 * show-when is false; within it, skip questions whose show-when is false; the
 * first eligible question that is neither answered nor skipped is the step.
 * Traits are projected incrementally from the answers on that path, with
 * derived traits (age, state status, segment) recomputed after every answer,
 * so a later rule only ever sees answers that are currently valid. When a
 * section has no question left, its gates run in order and the first that
 * holds ends the flow. No section left means complete.
 *
 * Two invariants the service relies on: a date of birth under the minimum age
 * is evaluated against the age gate BEFORE it is written, and is never written
 * (`persisted: false`); and answering re-runs eligibility downstream and prunes
 * answers to questions that are no longer shown, returning them as `pruned`.
 */

export const SETTING_MINIMUM_AGE = 'onboarding.minimumAge';

export interface EngineContext extends DeriveContext {
  /** Whether health-tier questions may be asked (both PHI keys on). */
  phiEnabled?: boolean;
}

export interface CarryOver {
  firstName?: string;
  email?: string;
  goal?: string;
}

export interface GateOutcomeRecord {
  gateKey: string;
  sectionKey: string;
  outcome: GateOutcome;
  reason: GateReason;
  copyKey: string;
  /** Set for state gates, so copy can say the state's name. */
  stateCode?: string;
}

export interface SessionSnapshot {
  /** Question key to value. Only answers on the current path project to traits. */
  answers: Readonly<Record<string, unknown>>;
  /** Optional questions the visitor chose not to answer. */
  skipped: readonly string[];
  /** Set while the visitor has stepped back; cleared by the next answer. */
  cursorQuestionKey: string | null;
  /** Terminal once set: the session was gated. */
  gateOutcome: GateOutcomeRecord | null;
  carryOver: CarryOver | null;
}

export const EMPTY_SNAPSHOT: SessionSnapshot = Object.freeze({
  answers: {},
  skipped: [],
  cursorQuestionKey: null,
  gateOutcome: null,
  carryOver: null,
});

/** What the browser is allowed to see of a question: no rules, no binding. */
export interface QuestionView {
  key: string;
  type: FlowQuestion['type'];
  copy: FlowQuestion['copy'];
  options?: FlowQuestion['options'];
  constraints?: FlowQuestion['constraints'];
  required: boolean;
  sensitivity: Sensitivity;
}

export interface SummaryRow {
  questionKey: string;
  label: string;
  value: string;
}

export interface Progress {
  /** Index of the current section among sections that are (so far) eligible. */
  sectionIndex: number;
  sectionCount: number;
  answered: number;
  remainingEstimate: number;
  /** 0..100, answered over answered + remaining. */
  percent: number;
}

export type Step =
  | {
      kind: 'question';
      section: { key: string; title: string; intro?: string };
      question: QuestionView;
      /** The current answer, or the carried-over value when there is none. */
      value: unknown;
      carriedOver: boolean;
      canGoBack: boolean;
    }
  | { kind: 'gate'; gate: GateOutcomeRecord }
  | { kind: 'complete'; summary: SummaryRow[]; segment: string | null };

export interface PathEntry {
  sectionKey: string;
  questionKey: string;
  state: 'answered' | 'skipped' | 'pending';
}

export interface Walk {
  traits: TraitMap;
  path: PathEntry[];
  /** Sections whose show-when held (or had none), in order. */
  sections: FlowSection[];
  next: { section: FlowSection; question: FlowQuestion } | null;
  gate: GateOutcomeRecord | null;
  complete: boolean;
  trace: Array<{ path: string; why: WhyNode }>;
}

export interface NextResult {
  step: Step;
  progress: Progress;
  traits: TraitMap;
  trace: Walk['trace'];
}

export type AnswerErrorCode = 'unknown_question' | 'not_eligible' | 'invalid_value' | 'required' | 'gated';

export interface AnswerError {
  code: AnswerErrorCode;
  questionKey: string;
  message: string;
}

export interface AcceptedAnswer {
  questionKey: string;
  trait: string;
  value: unknown;
  /** False when the age gate refused a date of birth: nothing was written. */
  persisted: boolean;
  /** Where the value came from: the visitor, or the companion (confirmed by the visitor). */
  source: 'onboarding' | 'companion';
}

export type ApplyResult =
  | {
      ok: true;
      snapshot: SessionSnapshot;
      accepted: AcceptedAnswer;
      /** Answers removed because their question is no longer shown. */
      pruned: string[];
      /** Set when this answer ended the flow at a gate. */
      gate: GateOutcomeRecord | null;
    }
  | { ok: false; error: AnswerError };

/* ------------------------------------------------------------------------- */
/* Walking                                                                   */
/* ------------------------------------------------------------------------- */

function settingsFor(ctx: EngineContext): SettingsMap {
  return { [SETTING_MINIMUM_AGE]: ctx.minimumAge };
}

function isAnswered(snap: SessionSnapshot, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(snap.answers, key) && snap.answers[key] !== undefined;
}

/**
 * Walk the definition against a snapshot. `stopAtGates: false` keeps walking
 * past a matching gate, which is how pruning decides what is still "shown"
 * without treating a gate as a branch.
 */
export function walk(
  def: FlowDefinition,
  snap: SessionSnapshot,
  ctx: EngineContext,
  options: { stopAtGates?: boolean } = {},
): Walk {
  const stopAtGates = options.stopAtGates ?? true;
  const settings = settingsFor(ctx);
  const derive = (base: TraitMap) =>
    deriveTraits(base, { ...ctx, segmentRules: def.segmentRules }).traits;

  let traits: TraitMap = derive({});
  const path: PathEntry[] = [];
  const sections: FlowSection[] = [];
  const trace: Walk['trace'] = [];
  let next: Walk['next'] = null;
  let gate: GateOutcomeRecord | null = null;

  outer: for (const [si, section] of def.sections.entries()) {
    if (section.showIf) {
      const ev = evaluateCondition(section.showIf, traits, settings);
      trace.push({ path: `sections.${si}.showIf`, why: ev.why });
      if (!ev.value) continue;
    }
    sections.push(section);
    let complete = true;
    for (const qKey of section.questions) {
      const question = def.questions[qKey];
      if (!question) continue; // the validator refuses this; be lenient at runtime
      if (question.showIf) {
        const ev = evaluateCondition(question.showIf, traits, settings);
        trace.push({ path: `questions.${qKey}.showIf`, why: ev.why });
        if (!ev.value) continue;
      }
      if (isAnswered(snap, qKey)) {
        traits = derive({ ...traits, [question.trait]: snap.answers[qKey] });
        path.push({ sectionKey: section.key, questionKey: qKey, state: 'answered' });
        continue;
      }
      if (!question.required && snap.skipped.includes(qKey)) {
        path.push({ sectionKey: section.key, questionKey: qKey, state: 'skipped' });
        continue;
      }
      path.push({ sectionKey: section.key, questionKey: qKey, state: 'pending' });
      next = { section, question };
      complete = false;
      break outer;
    }
    if (complete && stopAtGates) {
      const hit = matchGate(section, traits, settings, trace, si);
      if (hit) {
        gate = hit;
        break;
      }
    }
  }

  return { traits, path, sections, next, gate, complete: next === null && gate === null, trace };
}

function matchGate(
  section: FlowSection,
  traits: TraitMap,
  settings: SettingsMap,
  trace: Walk['trace'],
  sectionIndex: number,
): GateOutcomeRecord | null {
  for (const [gi, g] of section.gates.entries()) {
    const ev = evaluateCondition(g.when, traits, settings);
    trace.push({ path: `sections.${sectionIndex}.gates.${gi}.when`, why: ev.why });
    if (ev.value) return gateRecord(section, g, traits);
  }
  return null;
}

function gateRecord(section: FlowSection, g: FlowGate, traits: TraitMap): GateOutcomeRecord {
  const stateCode = typeof traits.us_state === 'string' ? traits.us_state : undefined;
  return {
    gateKey: g.key,
    sectionKey: section.key,
    outcome: g.outcome,
    reason: g.reason,
    copyKey: g.copyKey,
    ...(g.reason === 'state' && stateCode ? { stateCode } : {}),
  };
}

/* ------------------------------------------------------------------------- */
/* Next step                                                                 */
/* ------------------------------------------------------------------------- */

export function next(def: FlowDefinition, snap: SessionSnapshot, ctx: EngineContext): NextResult {
  if (snap.gateOutcome) {
    const w = walk(def, snap, ctx);
    return { step: { kind: 'gate', gate: snap.gateOutcome }, progress: progressFor(def, w, ctx), traits: w.traits, trace: w.trace };
  }

  const w = walk(def, snap, ctx);
  const progress = progressFor(def, w, ctx);

  if (w.gate) {
    return { step: { kind: 'gate', gate: w.gate }, progress, traits: w.traits, trace: w.trace };
  }

  // A back cursor shows an earlier on-path question with its current value.
  const cursor = snap.cursorQuestionKey;
  if (cursor && w.path.some((p) => p.questionKey === cursor)) {
    const entry = w.path.find((p) => p.questionKey === cursor)!;
    const section = def.sections.find((s) => s.key === entry.sectionKey)!;
    const question = def.questions[cursor]!;
    return {
      step: questionStep(section, question, snap, w),
      progress,
      traits: w.traits,
      trace: w.trace,
    };
  }

  if (w.next) {
    return {
      step: questionStep(w.next.section, w.next.question, snap, w),
      progress,
      traits: w.traits,
      trace: w.trace,
    };
  }

  return {
    step: { kind: 'complete', summary: summaryFor(def, snap, ctx), segment: typeof w.traits.segment === 'string' ? w.traits.segment : null },
    progress,
    traits: w.traits,
    trace: w.trace,
  };
}

function questionStep(section: FlowSection, question: FlowQuestion, snap: SessionSnapshot, w: Walk): Step {
  const answered = isAnswered(snap, question.key);
  const carried = carriedValue(question, snap.carryOver);
  const index = w.path.findIndex((p) => p.questionKey === question.key);
  const canGoBack = index > 0;
  return {
    kind: 'question',
    section: { key: section.key, title: section.title, ...(section.intro ? { intro: section.intro } : {}) },
    question: toView(question),
    value: answered ? snap.answers[question.key] : carried !== undefined ? carried : null,
    carriedOver: !answered && carried !== undefined,
    canGoBack,
  };
}

export function toView(question: FlowQuestion): QuestionView {
  return {
    key: question.key,
    type: question.type,
    copy: question.copy,
    ...(question.options ? { options: question.options } : {}),
    ...(question.constraints ? { constraints: question.constraints } : {}),
    required: question.required,
    sensitivity: sensitivityOf(question.trait) ?? 'marketing',
  };
}

/** Where an answer came from: the companion when it equals the carried value, else the visitor. */
export function answerSource(
  question: FlowQuestion,
  value: unknown,
  carry: CarryOver | null,
): AcceptedAnswer['source'] {
  const carried = carriedValue(question, carry);
  return carried !== undefined && sameValue(carried, value) ? 'companion' : 'onboarding';
}

/** The companion's value for a question, when its trait is one the companion captures. */
export function carriedValue(question: FlowQuestion, carry: CarryOver | null): unknown {
  if (!carry) return undefined;
  switch (question.trait) {
    case 'first_name':
      return carry.firstName || undefined;
    case 'email':
      return carry.email || undefined;
    case 'goal':
      return carry.goal || undefined;
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------------------- */
/* Progress and summary                                                      */
/* ------------------------------------------------------------------------- */

export function progressFor(def: FlowDefinition, w: Walk, ctx: EngineContext): Progress {
  const settings = settingsFor(ctx);
  const answered = w.path.filter((p) => p.state !== 'pending').length;
  const currentSectionKey = w.next?.section.key ?? w.gate?.sectionKey ?? w.sections.at(-1)?.key ?? null;

  // Sections and questions not yet reached count when their show-when is absent
  // or already holds on the traits so far; the estimate is optimistic on purpose.
  let remaining = w.path.filter((p) => p.state === 'pending').length;
  let sectionCount = w.sections.length;
  const reachedIndex = currentSectionKey ? def.sections.findIndex((s) => s.key === currentSectionKey) : def.sections.length;
  for (const [si, section] of def.sections.entries()) {
    if (si <= reachedIndex) continue;
    if (section.showIf && !evaluateCondition(section.showIf, w.traits, settings).value) continue;
    sectionCount += 1;
    for (const qKey of section.questions) {
      const q = def.questions[qKey];
      if (!q) continue;
      if (q.showIf && !evaluateCondition(q.showIf, w.traits, settings).value) continue;
      remaining += 1;
    }
  }
  // Questions after the pending one in the current section.
  if (w.next) {
    const after = w.next.section.questions.slice(w.next.section.questions.indexOf(w.next.question.key) + 1);
    for (const qKey of after) {
      const q = def.questions[qKey];
      if (!q) continue;
      if (q.showIf && !evaluateCondition(q.showIf, w.traits, settings).value) continue;
      remaining += 1;
    }
  }

  const sectionIndex = Math.max(0, w.sections.findIndex((s) => s.key === currentSectionKey));
  const total = answered + remaining;
  return {
    sectionIndex,
    sectionCount: Math.max(sectionCount, 1),
    answered,
    remainingEstimate: remaining,
    percent: total === 0 ? 100 : Math.round((answered / total) * 100),
  };
}

export function summaryFor(def: FlowDefinition, snap: SessionSnapshot, ctx: EngineContext): SummaryRow[] {
  const w = walk(def, snap, ctx, { stopAtGates: false });
  const rows: SummaryRow[] = [];
  for (const entry of w.path) {
    if (entry.state !== 'answered') continue;
    const q = def.questions[entry.questionKey];
    if (!q || q.trait.startsWith('consent_')) continue;
    rows.push({ questionKey: q.key, label: q.copy.label, value: formatValue(q, snap.answers[q.key]) });
  }
  return rows;
}

export function formatValue(question: FlowQuestion, value: unknown): string {
  if (value === null || value === undefined) return '';
  switch (question.type) {
    case 'single_select':
      return question.options?.find((o) => o.value === value)?.label ?? String(value);
    case 'multi_select':
      return Array.isArray(value)
        ? value.map((v) => question.options?.find((o) => o.value === v)?.label ?? String(v)).join(', ')
        : String(value);
    case 'us_state':
      return usStateName(String(value));
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'height_weight': {
      const hw = value as { heightCm?: number; weightKg?: number };
      return `${hw.heightCm ?? '?'} cm, ${hw.weightKg ?? '?'} kg`;
    }
    default:
      return String(value);
  }
}

/* ------------------------------------------------------------------------- */
/* Answering                                                                 */
/* ------------------------------------------------------------------------- */

/** The value schema for a question: its trait's, or its own options for custom traits, plus constraints. */
export function answerSchemaFor(question: FlowQuestion): z.ZodTypeAny {
  const registered = getTrait(question.trait);
  const produced = TRAIT_TYPE_FOR_QUESTION[question.type];
  const vocabulary = question.options?.map((o) => o.value);
  let schema: z.ZodTypeAny =
    registered && !isCustomTrait(question.trait)
      ? traitValueSchema(registered.type, registered.values)
      : traitValueSchema(produced, vocabulary);

  // Options narrow the vocabulary further: a select only accepts what it showed.
  if (vocabulary && question.type === 'single_select') {
    schema = z.enum(vocabulary as [string, ...string[]]);
  }
  if (vocabulary && question.type === 'multi_select') {
    schema = z
      .array(z.enum(vocabulary as [string, ...string[]]))
      .min(1)
      .refine((arr) => new Set(arr).size === arr.length, 'No repeats');
  }

  const c = question.constraints;
  if (c) {
    if (question.type === 'number' || question.type === 'scale') {
      let n = z.number().finite();
      if (c.min !== undefined) n = n.min(c.min);
      if (c.max !== undefined) n = n.max(c.max);
      schema = c.step !== undefined ? n.refine((v) => Number.isInteger((v - (c.min ?? 0)) / c.step!), 'Off step') : n;
    }
    if (question.type === 'text' && c.maxLength !== undefined) {
      schema = z.string().trim().min(1).max(c.maxLength);
    }
    if (question.type === 'date') {
      schema = schema.refine(
        (v: string) => (!c.minDate || v >= c.minDate) && (!c.maxDate || v <= c.maxDate),
        'Date is out of range',
      );
    }
  }
  return schema;
}

export function applyAnswer(
  def: FlowDefinition,
  snap: SessionSnapshot,
  ctx: EngineContext,
  questionKey: string,
  rawValue: unknown,
): ApplyResult {
  const question = def.questions[questionKey];
  if (!question) {
    return { ok: false, error: { code: 'unknown_question', questionKey, message: 'That question is not in this flow' } };
  }
  if (snap.gateOutcome) {
    return { ok: false, error: { code: 'gated', questionKey, message: 'This session has ended' } };
  }

  const before = walk(def, snap, ctx);
  const onPath = before.path.some((p) => p.questionKey === questionKey);
  if (!onPath) {
    return { ok: false, error: { code: 'not_eligible', questionKey, message: 'That question is not being asked right now' } };
  }

  const parsed = answerSchemaFor(question).safeParse(rawValue);
  if (!parsed.success) {
    return { ok: false, error: { code: 'invalid_value', questionKey, message: parsed.error.issues[0]?.message ?? 'Invalid value' } };
  }
  const value: unknown = parsed.data;

  // Dates of birth are not allowed in the future or before the constraint floor.
  if (question.trait === 'date_of_birth' && typeof value === 'string') {
    const age = ageOn(value, ctx.now);
    if (age === null) {
      return { ok: false, error: { code: 'invalid_value', questionKey, message: 'Enter a real date of birth' } };
    }
  }

  const source = answerSource(question, value, snap.carryOver);

  // The age gate is checked BEFORE the date of birth is written: a minor's
  // date of birth never reaches the session row.
  if (question.trait === 'date_of_birth') {
    const section = before.path.find((p) => p.questionKey === questionKey)?.sectionKey;
    const sectionDef = def.sections.find((s) => s.key === section);
    if (sectionDef) {
      const tentative = deriveTraits({ ...before.traits, date_of_birth: value }, { ...ctx, segmentRules: def.segmentRules }).traits;
      const settings = settingsFor(ctx);
      for (const g of sectionDef.gates) {
        if (g.reason !== 'age') continue;
        if (evaluateCondition(g.when, tentative, settings).value) {
          const gate = gateRecord(sectionDef, g, tentative);
          return {
            ok: true,
            snapshot: { ...snap, cursorQuestionKey: null, gateOutcome: gate },
            accepted: { questionKey, trait: question.trait, value, persisted: false, source },
            pruned: [],
            gate,
          };
        }
      }
    }
  }

  const answers = { ...snap.answers, [questionKey]: value };
  const skipped = snap.skipped.filter((k) => k !== questionKey);
  let nextSnap: SessionSnapshot = { ...snap, answers, skipped, cursorQuestionKey: null };

  // Re-run eligibility past any gate and drop answers whose question is now
  // hidden by its own or its section's show-when.
  const after = walk(def, nextSnap, ctx, { stopAtGates: false });
  const pruned = Object.keys(answers).filter((k) => k !== questionKey && isHidden(def, k, after.traits, settingsFor(ctx)));
  if (pruned.length > 0) {
    const kept = Object.fromEntries(Object.entries(answers).filter(([k]) => !pruned.includes(k)));
    nextSnap = { ...nextSnap, answers: kept };
  }

  const gated = walk(def, nextSnap, ctx);
  if (gated.gate) {
    nextSnap = { ...nextSnap, gateOutcome: gated.gate };
  }

  return {
    ok: true,
    snapshot: nextSnap,
    accepted: { questionKey, trait: question.trait, value, persisted: true, source },
    pruned,
    gate: gated.gate,
  };
}

/**
 * A question is hidden when its section's or its own show-when is false on the
 * current traits. Questions without a show-when are never hidden, so an answer
 * is only ever pruned because a rule now excludes it, not because the walk has
 * not reached it yet.
 */
export function isHidden(def: FlowDefinition, questionKey: string, traits: TraitMap, settings: SettingsMap): boolean {
  const section = def.sections.find((s) => s.questions.includes(questionKey));
  const question = def.questions[questionKey];
  if (!section || !question) return true;
  if (section.showIf && !evaluateCondition(section.showIf, traits, settings).value) return true;
  if (question.showIf && !evaluateCondition(question.showIf, traits, settings).value) return true;
  return false;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applySkip(
  def: FlowDefinition,
  snap: SessionSnapshot,
  ctx: EngineContext,
  questionKey: string,
): ApplyResult {
  const question = def.questions[questionKey];
  if (!question) {
    return { ok: false, error: { code: 'unknown_question', questionKey, message: 'That question is not in this flow' } };
  }
  if (snap.gateOutcome) {
    return { ok: false, error: { code: 'gated', questionKey, message: 'This session has ended' } };
  }
  if (question.required) {
    return { ok: false, error: { code: 'required', questionKey, message: 'This one we need an answer to' } };
  }
  const before = walk(def, snap, ctx);
  if (!before.path.some((p) => p.questionKey === questionKey)) {
    return { ok: false, error: { code: 'not_eligible', questionKey, message: 'That question is not being asked right now' } };
  }
  const answers = Object.fromEntries(Object.entries(snap.answers).filter(([k]) => k !== questionKey));
  const skipped = snap.skipped.includes(questionKey) ? [...snap.skipped] : [...snap.skipped, questionKey];
  const nextSnap: SessionSnapshot = { ...snap, answers, skipped, cursorQuestionKey: null };
  const gated = walk(def, nextSnap, ctx);
  return {
    ok: true,
    snapshot: gated.gate ? { ...nextSnap, gateOutcome: gated.gate } : nextSnap,
    accepted: { questionKey, trait: question.trait, value: null, persisted: false, source: 'onboarding' },
    pruned: [],
    gate: gated.gate,
  };
}

/** Step back to the previous question on the current path. No-op at the start or once gated. */
export function goBack(def: FlowDefinition, snap: SessionSnapshot, ctx: EngineContext): SessionSnapshot {
  if (snap.gateOutcome) return snap;
  const w = walk(def, snap, ctx);
  const currentKey = snap.cursorQuestionKey ?? w.next?.question.key ?? null;
  const index = currentKey ? w.path.findIndex((p) => p.questionKey === currentKey) : w.path.length;
  const previous = w.path[index - 1];
  if (!previous) return snap;
  return { ...snap, cursorQuestionKey: previous.questionKey };
}
