'use client';

import type { EvalResultView, EvalRunDetail } from '@joice/api-client';
import { Badge, EmptyState } from '@/components/admin/ui';

type CompareMark = 'fixed' | 'regressed' | null;

/**
 * Per-question outcomes, expandable to the full answer, citations, tools and
 * timings. When the previous run of the same mode is supplied, questions that
 * flipped are marked: fixed (was failing, now passes) or regressed.
 */
export function RunResults({
  results,
  previous,
  current,
}: {
  results: EvalResultView[];
  previous?: EvalRunDetail | null;
  /** The run these results belong to, for the cross-audience caveat. */
  current?: EvalRunDetail['run'] | null;
}) {
  if (results.length === 0) return <EmptyState>No results yet.</EmptyState>;

  const previousByKey = new Map<string, boolean>();
  for (const r of previous?.results ?? []) {
    previousByKey.set(r.caseId ?? r.question, r.pass);
  }
  const markFor = (r: EvalResultView): CompareMark => {
    const before = previousByKey.get(r.caseId ?? r.question);
    if (before === undefined || before === r.pass) return null;
    return r.pass ? 'fixed' : 'regressed';
  };

  const marks = results.map(markFor);
  const fixed = marks.filter((m) => m === 'fixed').length;
  const regressed = marks.filter((m) => m === 'regressed').length;

  return (
    <div>
      {previous && (fixed > 0 || regressed > 0) ? (
        <p className="mb-3 text-sm text-muted">
          vs the previous {previous.run.mode} run: {fixed} fixed, {regressed} regressed.
          {current && previous.run.audience !== current.audience
            ? ` Note: that run simulated ${previous.run.audience}, this one ${current.audience}; different belts, so treat the comparison loosely.`
            : ''}
        </p>
      ) : null}
      <ul className="divide-y divide-line/60">
        {results.map((result, i) => {
          const mark = marks[i];
          return (
            <li key={result.id}>
              <details className="group py-2.5">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <Badge tone={result.pass ? 'pass' : 'fail'}>
                    {result.pass ? 'pass' : 'fail'}
                  </Badge>
                  {mark ? (
                    <span
                      className={
                        mark === 'fixed' ? 'text-xs text-brand-700' : 'text-xs text-danger'
                      }
                    >
                      {mark}
                    </span>
                  ) : null}
                  <span className="text-sm text-ink">{result.question}</span>
                  <span className="ml-auto text-xs text-muted">
                    {result.totalMs !== null ? `${result.totalMs}ms` : ''}
                  </span>
                </summary>
                <div className="mt-2 space-y-2 pl-1 text-sm">
                  <p className="text-muted">{result.detail}</p>
                  {result.answer ? (
                    <p className="whitespace-pre-wrap rounded-xl bg-canvas/70 p-3 text-ink">
                      {result.answer}
                    </p>
                  ) : null}
                  {Array.isArray(result.citations) && result.citations.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(result.citations as { sourcePath?: string }[]).map((c, j) => (
                        <span
                          key={j}
                          className="rounded-full bg-brand-100 px-2.5 py-0.5 font-mono text-[10px] text-brand-800"
                        >
                          {c.sourcePath ?? 'source'}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted">
                    {result.toolsCalled && result.toolsCalled.length > 0
                      ? `tools: ${result.toolsCalled.join(', ')} · `
                      : ''}
                    {result.firstTokenMs !== null ? `first token ${result.firstTokenMs}ms · ` : ''}
                    {result.inputTokens !== null
                      ? `${result.inputTokens} in / ${result.outputTokens ?? 0} out tokens`
                      : ''}
                  </p>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
