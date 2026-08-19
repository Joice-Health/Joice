import { describe, expect, test } from 'bun:test';
import { DEFAULT_INTAKE_FLOW } from './default-flow';
import {
  EMPTY_SNAPSHOT,
  applyAnswer,
  applySkip,
  goBack,
  next,
  walk,
  type EngineContext,
  type SessionSnapshot,
  type Step,
} from './engine';
import { validateFlowDefinition } from './validate-flow';
import { ageBand, ageOn, deriveTraits } from '../profile/derive';

const report = validateFlowDefinition(DEFAULT_INTAKE_FLOW, { phiEnabled: false });
if (!report.ok) throw new Error('fixture must validate');
const DEF = report.definition;

const ctx: EngineContext = {
  minimumAge: 18,
  serviceAreas: { CA: 'open', NY: 'notify', TX: 'closed' },
  now: new Date('2026-08-19T12:00:00Z'),
};

const snap = (answers: Record<string, unknown>, extra: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...EMPTY_SNAPSHOT,
  answers,
  ...extra,
});

/** Apply answers in order, asserting each is accepted; returns the final snapshot. */
function play(entries: Array<[string, unknown]>, start: SessionSnapshot = EMPTY_SNAPSHOT): SessionSnapshot {
  let current = start;
  for (const [key, value] of entries) {
    const r = applyAnswer(DEF, current, ctx, key, value);
    if (!r.ok) throw new Error(`${key}: ${r.error.code} ${r.error.message}`);
    current = r.snapshot;
  }
  return current;
}

const stepOf = (s: SessionSnapshot): Step => next(DEF, s, ctx).step;
const questionKey = (s: SessionSnapshot): string | null => {
  const st = stepOf(s);
  return st.kind === 'question' ? st.question.key : null;
};

const ADULT = '2000-01-01';

describe('derived traits', () => {
  test('age counts whole years with the birthday boundary', () => {
    const now = new Date('2026-08-19T00:00:00Z');
    expect(ageOn('2008-08-19', now)).toBe(18);
    expect(ageOn('2008-08-20', now)).toBe(17);
    expect(ageOn('2000-02-29', now)).toBe(26);
    expect(ageOn('2030-01-01', now)).toBeNull();
    expect(ageOn('nope', now)).toBeNull();
    expect(ageBand(17)).toBe('under_18');
    expect(ageBand(34)).toBe('25_34');
    expect(ageBand(70)).toBe('65_plus');
  });

  test('state status defaults to notify and segment picks the highest priority', () => {
    const { traits, trace } = deriveTraits(
      { us_state: 'WY', goal: 'weight-metabolic', peptide_experience: 'some', date_of_birth: ADULT },
      { ...ctx, segmentRules: DEF.segmentRules },
    );
    expect(traits.state_status).toBe('notify');
    expect(traits.segment).toBe('weight-experienced');
    expect(traits.age_eligible).toBe(true);
    expect(trace.map((t) => t.trait)).toEqual(['age', 'age_band', 'age_eligible', 'state_status', 'segment']);
  });
});

describe('the matrix', () => {
  test('1. nothing answered: us_state first, no back', () => {
    const st = stepOf(EMPTY_SNAPSHOT);
    expect(st.kind).toBe('question');
    if (st.kind !== 'question') return;
    expect(st.question.key).toBe('us_state');
    expect(st.section.key).toBe('eligibility');
    expect(st.canGoBack).toBe(false);
    expect(st.question.sensitivity).toBe('marketing');
    expect((st.question as unknown as Record<string, unknown>).showIf).toBeUndefined();
    expect((st.question as unknown as Record<string, unknown>).trait).toBeUndefined();
  });

  test('2. state answered: date of birth next', () => {
    expect(questionKey(play([['us_state', 'CA']]))).toBe('date_of_birth');
  });

  test('3. adult in an open state: goal next, section index 1', () => {
    const s = play([['us_state', 'CA'], ['date_of_birth', ADULT]]);
    const r = next(DEF, s, ctx);
    expect(r.step.kind).toBe('question');
    expect(questionKey(s)).toBe('goal');
    expect(r.progress.sectionIndex).toBe(1);
    expect(r.progress.answered).toBe(2);
    expect(r.traits.age).toBe(26);
    expect(r.traits.state_status).toBe('open');
  });

  test('4. a minor: gate stop/age, date of birth never written', () => {
    const s = play([['us_state', 'CA']]);
    const r = applyAnswer(DEF, s, ctx, 'date_of_birth', '2010-01-01');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.accepted.persisted).toBe(false);
    expect(r.snapshot.answers.date_of_birth).toBeUndefined();
    expect(r.gate).toMatchObject({ outcome: 'stop', reason: 'age', copyKey: 'gate.under_age' });
    expect(r.snapshot.gateOutcome).toEqual(r.gate);
    const st = stepOf(r.snapshot);
    expect(st.kind).toBe('gate');
  });

  test('5. seventeen until tomorrow: still a minor', () => {
    const r = applyAnswer(DEF, play([['us_state', 'CA']]), ctx, 'date_of_birth', '2008-08-20');
    expect(r.ok && r.gate?.reason).toBe('age');
  });

  test('6. eighteen today: continues', () => {
    const s = play([['us_state', 'CA'], ['date_of_birth', '2008-08-19']]);
    expect(questionKey(s)).toBe('goal');
  });

  test('7. notify state: gate notify with the state code', () => {
    const s = play([['us_state', 'NY'], ['date_of_birth', ADULT]]);
    const st = stepOf(s);
    expect(st).toMatchObject({ kind: 'gate', gate: { outcome: 'notify', reason: 'state', stateCode: 'NY' } });
    expect(s.gateOutcome?.outcome).toBe('notify');
  });

  test('8. closed state: gate closed', () => {
    const s = play([['us_state', 'TX'], ['date_of_birth', ADULT]]);
    expect(stepOf(s)).toMatchObject({ kind: 'gate', gate: { outcome: 'closed', reason: 'state' } });
  });

  test('9. a gated session refuses further answers', () => {
    const s = play([['us_state', 'NY'], ['date_of_birth', ADULT]]);
    const r = applyAnswer(DEF, s, ctx, 'goal', 'energy');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('gated');
  });

  test('10. goal energy: the weight section is skipped, goal_note hidden', () => {
    const s = play([['us_state', 'CA'], ['date_of_birth', ADULT], ['goal', 'energy']]);
    expect(questionKey(s)).toBe('peptide_experience');
    const w = walk(DEF, s, ctx);
    expect(w.sections.map((x) => x.key)).toEqual(['eligibility', 'goal', 'about']);
  });

  test('11. goal not-sure: goal_note is shown and optional', () => {
    const s = play([['us_state', 'CA'], ['date_of_birth', ADULT], ['goal', 'not-sure']]);
    const st = stepOf(s);
    expect(st.kind === 'question' && st.question.key).toBe('goal_note');
    expect(st.kind === 'question' && st.question.required).toBe(false);
  });

  test('12. skipping goal_note, then finishing: complete with a summary', () => {
    let s = play([['us_state', 'CA'], ['date_of_birth', ADULT], ['goal', 'not-sure']]);
    const sk = applySkip(DEF, s, ctx, 'goal_note');
    expect(sk.ok).toBe(true);
    if (!sk.ok) return;
    s = sk.snapshot;
    expect(questionKey(s)).toBe('peptide_experience');
    s = play([['peptide_experience', 'none'], ['first_name', 'Sam'], ['consent_terms', true]], s);
    // consent_marketing is optional: it is asked, then skipped.
    expect(questionKey(s)).toBe('consent_marketing');
    const sk2 = applySkip(DEF, s, ctx, 'consent_marketing');
    if (!sk2.ok) throw new Error(sk2.error.message);
    const r = next(DEF, sk2.snapshot, ctx);
    expect(r.step.kind).toBe('complete');
    if (r.step.kind !== 'complete') return;
    expect(r.step.segment).toBe('explorer');
    expect(r.step.summary.map((row) => [row.questionKey, row.value])).toEqual([
      ['us_state', 'California'],
      ['date_of_birth', ADULT],
      ['goal', 'Not sure yet'],
      ['peptide_experience', 'New to them'],
      ['first_name', 'Sam'],
    ]);
    expect(r.progress.percent).toBe(100);
  });

  test('13. back after three answers shows date of birth with its value', () => {
    const s = goBack(DEF, play([['us_state', 'CA'], ['date_of_birth', ADULT]]), ctx);
    expect(s.cursorQuestionKey).toBe('date_of_birth');
    const st = stepOf(s);
    expect(st).toMatchObject({ kind: 'question', question: { key: 'date_of_birth' }, value: ADULT, canGoBack: true });
  });

  test('14. back then a minor date of birth: gate age', () => {
    const s = goBack(DEF, play([['us_state', 'CA'], ['date_of_birth', ADULT], ['goal', 'energy']]), ctx);
    expect(s.cursorQuestionKey).toBe('goal');
    const s2 = goBack(DEF, s, ctx);
    expect(s2.cursorQuestionKey).toBe('date_of_birth');
    const r = applyAnswer(DEF, s2, ctx, 'date_of_birth', '2010-01-01');
    expect(r.ok && r.gate?.reason).toBe('age');
    expect(r.ok && r.accepted.persisted).toBe(false);
    // The old adult date of birth stays as it was: nothing new was written.
    expect(r.ok && r.snapshot.answers.date_of_birth).toBe(ADULT);
  });

  test('15. answering ahead of the path is refused', () => {
    const r = applyAnswer(DEF, play([['us_state', 'CA']]), ctx, 'goal', 'energy');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('not_eligible');
  });

  test('16. an unknown state code is refused', () => {
    const r = applyAnswer(DEF, EMPTY_SNAPSHOT, ctx, 'us_state', 'ZZ');
    expect(r.ok === false && r.error.code).toBe('invalid_value');
  });

  test('17. a multi select with an unknown option is refused', () => {
    const s = play([['us_state', 'CA'], ['date_of_birth', ADULT], ['goal', 'weight-metabolic']]);
    expect(questionKey(s)).toBe('weight_tried');
    const bad = applyAnswer(DEF, s, ctx, 'weight_tried', ['diet', 'surgery']);
    expect(bad.ok === false && bad.error.code).toBe('invalid_value');
    const empty = applyAnswer(DEF, s, ctx, 'weight_tried', []);
    expect(empty.ok).toBe(false);
    const good = applyAnswer(DEF, s, ctx, 'weight_tried', ['diet', 'training']);
    expect(good.ok).toBe(true);
  });

  test('18. an impossible date is refused', () => {
    const s = play([['us_state', 'CA']]);
    expect(applyAnswer(DEF, s, ctx, 'date_of_birth', '2026-13-40').ok).toBe(false);
    expect(applyAnswer(DEF, s, ctx, 'date_of_birth', '2030-01-01').ok).toBe(false);
    expect(applyAnswer(DEF, s, ctx, 'date_of_birth', '1850-01-01').ok).toBe(false);
  });

  test('19. changing the state to notify after the goal was answered: gate, goal kept', () => {
    let s = play([['us_state', 'CA'], ['date_of_birth', ADULT], ['goal', 'energy']]);
    s = goBack(DEF, goBack(DEF, goBack(DEF, s, ctx), ctx), ctx);
    expect(s.cursorQuestionKey).toBe('us_state');
    const r = applyAnswer(DEF, s, ctx, 'us_state', 'NY');
    expect(r.ok && r.gate?.outcome).toBe('notify');
    expect(r.ok && r.pruned).toEqual([]);
    expect(r.ok && r.snapshot.answers.goal).toBe('energy');
  });

  test('20. a carried-over goal confirmed is source companion, a changed one is onboarding', () => {
    const carried = snap({}, { carryOver: { firstName: 'Sam', goal: 'energy', email: 's@example.com' } });
    let s = play([['us_state', 'CA'], ['date_of_birth', ADULT]], carried);
    const st = stepOf(s);
    expect(st).toMatchObject({ kind: 'question', question: { key: 'goal' }, value: 'energy', carriedOver: true });
    const confirmed = applyAnswer(DEF, s, ctx, 'goal', 'energy');
    expect(confirmed.ok && confirmed.accepted.source).toBe('companion');
    const changed = applyAnswer(DEF, s, ctx, 'goal', 'stress-sleep');
    expect(changed.ok && changed.accepted.source).toBe('onboarding');
    s = confirmed.ok ? confirmed.snapshot : s;
    s = play([['peptide_experience', 'none']], s);
    const nameStep = stepOf(s);
    expect(nameStep).toMatchObject({ kind: 'question', question: { key: 'first_name' }, value: 'Sam', carriedOver: true });
  });

  test('21. a hidden section is excluded from the estimate', () => {
    const energy = next(DEF, play([['us_state', 'CA'], ['date_of_birth', ADULT], ['goal', 'energy']]), ctx);
    const weight = next(DEF, play([['us_state', 'CA'], ['date_of_birth', ADULT], ['goal', 'weight-metabolic']]), ctx);
    expect(weight.progress.remainingEstimate).toBe(energy.progress.remainingEstimate + 2);
    expect(weight.progress.sectionCount).toBe(energy.progress.sectionCount + 1);
  });

  test('22. changing the goal away from weight prunes the weight answers', () => {
    let s = play([
      ['us_state', 'CA'],
      ['date_of_birth', ADULT],
      ['goal', 'weight-metabolic'],
      ['weight_tried', ['diet']],
      ['weight_timeline', '3mo'],
    ]);
    expect(questionKey(s)).toBe('peptide_experience');
    s = goBack(DEF, goBack(DEF, goBack(DEF, s, ctx), ctx), ctx);
    expect(s.cursorQuestionKey).toBe('goal');
    const r = applyAnswer(DEF, s, ctx, 'goal', 'energy');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pruned.sort()).toEqual(['weight_timeline', 'weight_tried']);
    expect(r.snapshot.answers.weight_tried).toBeUndefined();
    expect(questionKey(r.snapshot)).toBe('peptide_experience');
  });

  test('23. a required question cannot be skipped; an unknown one is unknown', () => {
    const s = play([['us_state', 'CA']]);
    expect(applySkip(DEF, s, ctx, 'date_of_birth').ok === false && applySkip(DEF, s, ctx, 'date_of_birth')).toMatchObject({
      ok: false,
      error: { code: 'required' },
    });
    expect(applyAnswer(DEF, s, ctx, 'mystery', 1)).toMatchObject({ ok: false, error: { code: 'unknown_question' } });
    expect(goBack(DEF, EMPTY_SNAPSHOT, ctx)).toBe(EMPTY_SNAPSHOT);
  });

  test('24. the trace names every show-when and gate evaluated', () => {
    const r = next(DEF, play([['us_state', 'NY'], ['date_of_birth', ADULT]]), ctx);
    const paths = r.trace.map((t) => t.path);
    expect(paths).toContain('sections.0.gates.0.when');
    expect(paths).toContain('sections.0.gates.1.when');
    const ageGate = r.trace.find((t) => t.path === 'sections.0.gates.0.when')!.why;
    expect(ageGate).toMatchObject({ kind: 'leaf', trait: 'age', op: 'lt', expected: 18, actual: 26, result: false });
  });
});
