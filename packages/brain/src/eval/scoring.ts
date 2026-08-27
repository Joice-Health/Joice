/**
 * Deterministic eval scoring, shared by the admin console and the CLI script
 * (apps/brain/scripts/eval.ts) so the two front ends can never drift apart.
 * Extracted verbatim from the script; the detail strings are part of the
 * contract because run history compares them across time.
 *
 * Browser-safe: pure functions, no imports.
 */

/** What a golden case expects. Field names match the stored eval_cases row. */
export interface EvalExpectations {
  question: string;
  /** Every listed source must appear in the retrieved or cited set. */
  expectSources?: string[] | null;
  /** An off-corpus question: the honest outcome is a decline with no citations. */
  expectRefusal?: boolean | null;
  /** Tool mode: this tool should be among those called. */
  expectTool?: string | null;
  mustCite?: boolean | null;
}

export interface CaseScore {
  pass: boolean;
  detail: string;
  /** True when the mode cannot judge this case (retrieval mode, no expectSources). */
  skipped?: boolean;
}

/**
 * The ways models actually phrase a decline. Errs broad on purpose: a false
 * PASS is worse than a false FAIL, but a detector that flags honest refusals
 * trains people to ignore the eval.
 */
export const REFUSAL_SHAPES: readonly RegExp[] = [
  /\b(doesn'?t|does not|don'?t|can'?t|cannot|won'?t|unable to)\b.{0,80}\b(cover|answer|help|provide|advis|advice|assist|speak|write|create|share)/i,
  /\b(outside|beyond|not within|not in)\b.{0,40}\b(scope|library|notes|knowledge)\b/i,
  /\bno (information|notes?|research)\b/i,
  /\bnot (something|a topic)\b/i,
  /\bi(?:'|’)?m sorry,? but\b/i,
  /\brecommend (checking|consulting|speaking)\b/i,
];

export function soundsLikeRefusal(answer: string, notCoveredMessage: string): boolean {
  return (
    answer.includes(notCoveredMessage) || REFUSAL_SHAPES.some((shape) => shape.test(answer))
  );
}

/** Nearest-rank percentile over an ascending-sorted array; 0 when empty. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/**
 * Retrieval mode: did the top-k contain every expected source? A case with no
 * expectSources cannot be judged by retrieval alone and passes as skipped.
 */
export function scoreRetrievalCase(
  c: EvalExpectations,
  retrievedPaths: ReadonlySet<string>,
  topK: number,
): CaseScore {
  if (!c.expectSources || c.expectSources.length === 0) {
    return { pass: true, detail: 'skipped (no expectSources; needs --full)', skipped: true };
  }
  const missing = c.expectSources.filter((s) => !retrievedPaths.has(s));
  return missing.length === 0
    ? { pass: true, detail: `recall ok (${retrievedPaths.size} chunks)` }
    : { pass: false, detail: `missing from top-${topK}: ${missing.join(', ')}` };
}

/**
 * Full mode: refusal shape (zero citations AND the text reads as a decline),
 * citation honesty (mustCite, per-source presence), and tool choice (only
 * judged when tool mode is on, since classic mode never calls tools).
 */
export function scoreFullCase(
  c: EvalExpectations,
  observed: {
    answer: string;
    citedPaths: ReadonlySet<string>;
    toolsCalled: ReadonlySet<string>;
  },
  opts: { notCoveredMessage: string; toolsEnabled: boolean },
): CaseScore {
  const { answer, citedPaths, toolsCalled } = observed;
  const problems: string[] = [];

  if (c.expectRefusal) {
    if (citedPaths.size > 0) {
      problems.push(`expected refusal but cited: ${[...citedPaths].join(', ')}`);
    } else if (!soundsLikeRefusal(answer, opts.notCoveredMessage)) {
      problems.push(`expected refusal but got an uncited answer: "${answer.slice(0, 120)}…"`);
    }
  }
  if (c.mustCite && citedPaths.size === 0) problems.push('expected citations, got none');
  for (const s of c.expectSources ?? []) {
    if (!citedPaths.has(s)) problems.push(`expected citation of ${s}`);
  }
  if (c.expectTool && opts.toolsEnabled && !toolsCalled.has(c.expectTool)) {
    problems.push(
      `expected tool ${c.expectTool}; called: ${[...toolsCalled].join(', ') || 'none'}`,
    );
  }

  return {
    pass: problems.length === 0,
    detail:
      problems.join('; ') ||
      `ok (${citedPaths.size} citations${toolsCalled.size ? `, tools: ${[...toolsCalled].join(',')}` : ''})`,
  };
}
