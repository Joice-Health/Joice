import {
  EMPTY_SNAPSHOT,
  applyAnswer,
  applySkip,
  next,
  type CarryOver,
  type EngineContext,
  type SessionSnapshot,
} from './engine';
import type { WhyNode } from '../rules/evaluate';
import type { FlowDefinition } from './schemas';

/**
 * Run a persona through a definition: answer each question the engine asks
 * from the persona's answers (skip optional ones it has no answer for), stop
 * at the first question it cannot answer, a gate, or completion. The admin
 * simulator and tests both use this; nothing is persisted.
 */
export interface SimulationStep {
  kind: 'question' | 'gate' | 'complete';
  sectionKey?: string;
  questionKey?: string;
  value?: unknown;
  answered?: boolean;
  skipped?: boolean;
  error?: string;
}

export interface SimulationResult {
  path: SimulationStep[];
  stoppedAt: 'unanswered' | 'gate' | 'complete' | 'error';
  traits: Record<string, unknown>;
  segment: string | null;
  trace: Array<{ path: string; why: WhyNode }>;
  snapshot: SessionSnapshot;
}

export function simulate(
  def: FlowDefinition,
  persona: Readonly<Record<string, unknown>>,
  ctx: EngineContext,
  options: { carryOver?: CarryOver; maxSteps?: number } = {},
): SimulationResult {
  let snap: SessionSnapshot = { ...EMPTY_SNAPSHOT, carryOver: options.carryOver ?? null };
  const path: SimulationStep[] = [];
  const max = options.maxSteps ?? 200;

  for (let i = 0; i < max; i += 1) {
    const r = next(def, snap, ctx);
    if (r.step.kind === 'gate') {
      path.push({ kind: 'gate', sectionKey: r.step.gate.sectionKey, value: r.step.gate.outcome });
      return finish('gate', r.traits, r.trace, snap, path);
    }
    if (r.step.kind === 'complete') {
      path.push({ kind: 'complete' });
      return finish('complete', r.traits, r.trace, snap, path);
    }
    const key = r.step.question.key;
    if (Object.prototype.hasOwnProperty.call(persona, key)) {
      const applied = applyAnswer(def, snap, ctx, key, persona[key]);
      if (!applied.ok) {
        path.push({ kind: 'question', sectionKey: r.step.section.key, questionKey: key, value: persona[key], answered: false, error: applied.error.message });
        return finish('error', r.traits, r.trace, snap, path);
      }
      path.push({ kind: 'question', sectionKey: r.step.section.key, questionKey: key, value: persona[key], answered: applied.accepted.persisted });
      snap = applied.snapshot;
      continue;
    }
    if (!r.step.question.required) {
      const skipped = applySkip(def, snap, ctx, key);
      if (skipped.ok) {
        path.push({ kind: 'question', sectionKey: r.step.section.key, questionKey: key, skipped: true });
        snap = skipped.snapshot;
        continue;
      }
    }
    path.push({ kind: 'question', sectionKey: r.step.section.key, questionKey: key, answered: false });
    return finish('unanswered', r.traits, r.trace, snap, path);
  }
  const r = next(def, snap, ctx);
  return finish('error', r.traits, r.trace, snap, path);
}

function finish(
  stoppedAt: SimulationResult['stoppedAt'],
  traits: Readonly<Record<string, unknown>>,
  trace: SimulationResult['trace'],
  snapshot: SessionSnapshot,
  path: SimulationStep[],
): SimulationResult {
  return {
    path,
    stoppedAt,
    traits: { ...traits },
    segment: typeof traits.segment === 'string' ? traits.segment : null,
    trace,
    snapshot,
  };
}
