import { deriveTraits, type DeriveContext, type DerivationTrace } from './derive';
import { isDerivedTrait } from './traits';
import type { TraitMap } from '../rules/evaluate';

/**
 * The profile fold. Observations are append-only facts ("source S said trait
 * T was V at time X"); the profile is what we currently believe, one value per
 * trait, with provenance. The fold is pure so the same function serves the
 * session service (project the current answers), the claim (re-project for the
 * member), the simulator and any backfill.
 *
 * Precedence: a clinician beats the visitor, the visitor beats the companion,
 * the companion beats a system stamp; within a source the latest observation
 * wins. Derived traits are never read from observations, always recomputed.
 */

export const OBSERVATION_SOURCES = ['clinician', 'onboarding', 'companion', 'system', 'derived'] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

/** Higher wins. Derived is recomputed, so it never competes. */
export const SOURCE_PRECEDENCE: Readonly<Record<ObservationSource, number>> = {
  clinician: 4,
  onboarding: 3,
  companion: 2,
  system: 1,
  derived: 0,
};

export const PROJECTOR_VERSION = 1;

export interface ObservationLike {
  trait: string;
  value: unknown;
  source: ObservationSource;
  /** 0..1; ties on precedence and time are broken by confidence. */
  confidence?: number;
  observedAt: Date | string;
}

export interface ProjectedTrait {
  value: unknown;
  source: ObservationSource;
  observedAt: string;
}

export interface ProfileProjection {
  /** Trait key to value with provenance. Derived traits carry source `derived`. */
  traits: Record<string, ProjectedTrait>;
  /** The same values without provenance, the shape rules evaluate over. */
  flat: TraitMap;
  segment: string | null;
  trace: DerivationTrace[];
  projectorVersion: number;
  projectedAt: string;
}

function isoOf(value: Date | string): string {
  return typeof value === 'string' ? new Date(value).toISOString() : value.toISOString();
}

function wins(candidate: ObservationLike, incumbent: ObservationLike): boolean {
  const p = SOURCE_PRECEDENCE[candidate.source] - SOURCE_PRECEDENCE[incumbent.source];
  if (p !== 0) return p > 0;
  const t = new Date(candidate.observedAt).getTime() - new Date(incumbent.observedAt).getTime();
  if (t !== 0) return t > 0;
  return (candidate.confidence ?? 1) > (incumbent.confidence ?? 1);
}

/**
 * Fold observations into a profile. Observations for derived traits, and
 * observations whose value is null or undefined, are ignored.
 */
export function projectObservations(
  observations: readonly ObservationLike[],
  ctx: DeriveContext,
): ProfileProjection {
  const chosen = new Map<string, ObservationLike>();
  for (const obs of observations) {
    if (obs.source === 'derived' || isDerivedTrait(obs.trait)) continue;
    if (obs.value === null || obs.value === undefined) continue;
    const incumbent = chosen.get(obs.trait);
    if (!incumbent || wins(obs, incumbent)) chosen.set(obs.trait, obs);
  }

  const traits: Record<string, ProjectedTrait> = {};
  const base: Record<string, unknown> = {};
  for (const [trait, obs] of chosen) {
    traits[trait] = { value: obs.value, source: obs.source, observedAt: isoOf(obs.observedAt) };
    base[trait] = obs.value;
  }

  const derived = deriveTraits(base, ctx);
  const projectedAt = ctx.now.toISOString();
  for (const entry of derived.trace) {
    traits[entry.trait] = { value: entry.value, source: 'derived', observedAt: projectedAt };
  }

  return {
    traits,
    flat: derived.traits,
    segment: typeof derived.traits.segment === 'string' ? derived.traits.segment : null,
    trace: derived.trace,
    projectorVersion: PROJECTOR_VERSION,
    projectedAt,
  };
}

/**
 * Answers on a session's current path, expressed as observations from the
 * visitor (or from the companion when the visitor confirmed a carried value).
 * The engine's walk decides the path; this only reshapes it.
 */
export function answersAsObservations(
  entries: ReadonlyArray<{ trait: string; value: unknown; source: 'onboarding' | 'companion' }>,
  observedAt: Date,
): ObservationLike[] {
  return entries.map((e) => ({ trait: e.trait, value: e.value, source: e.source, observedAt }));
}
