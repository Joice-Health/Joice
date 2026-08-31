'use client';

import { use, useState } from 'react';
import { Button } from '@joice/ui';
import {
  useBrainSettings,
  useEvalRun,
  useUpdateBrainSettings,
  type BrainSettingsPatchInput,
} from '@joice/api-client';
import {
  Badge,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  PanelSkeleton,
} from '@/components/admin/ui';
import { RunResults } from '@/components/admin/eval/run-results';
import { relativeTime } from '@/components/admin/eval/form';

const CRUMBS = [{ href: '/admin/eval', label: 'Eval console' }];

/**
 * One run: the header numbers, what was overridden, per-question outcomes
 * (polling every 2s while it executes), the comparison against the previous
 * run of the same mode, and the promote button that applies a winning
 * experiment's overrides to the live settings through the api's audited
 * endpoint.
 */
export default function AdminEvalRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useEvalRun(id);
  const previous = useEvalRun(detail.data?.previousRunId ?? null);
  const settings = useBrainSettings();
  const promote = useUpdateBrainSettings();
  const [confirming, setConfirming] = useState(false);
  const [promoted, setPromoted] = useState(false);

  if (detail.isPending) {
    return (
      <>
        <PageHeader breadcrumbs={CRUMBS} title="Eval run" />
        <PanelSkeleton />
      </>
    );
  }
  if (detail.isError) return <ErrorState error={detail.error} />;
  const { run, results } = detail.data!;

  const overrides = run.overridesApplied as Record<string, unknown>;
  const overrideKeys = Object.keys(overrides);
  const resolved = settings.data?.resolved as Record<string, unknown> | undefined;

  const modeLabel =
    run.mode === 'full' ? (run.toolsEnabled ? 'full + tools' : 'full') : 'retrieval';
  const progress =
    run.status === 'running' ? `${results.length} of ${run.totalCases} graded` : null;

  const applyOverrides = async () => {
    try {
      await promote.mutateAsync(overrides as BrainSettingsPatchInput);
      setConfirming(false);
      setPromoted(true);
    } catch {
      // promote.isError renders below; the confirm box stays open for retry.
    }
  };

  return (
    <>
      <PageHeader breadcrumbs={CRUMBS} title="Eval run" />

      <Panel className="mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Badge tone={run.status}>{run.status}</Badge>
          <span className="display text-xl text-ink tabular-nums">
            {run.passedCases !== null ? `${run.passedCases}/${run.totalCases}` : progress}
          </span>
          <span className="text-muted">{modeLabel}</span>
          <span className="text-muted">as {run.audience}</span>
          <span className="font-mono text-xs text-muted">{run.model}</span>
          {run.totalP50Ms !== null ? (
            <span className="text-muted">
              total p50 {run.totalP50Ms}ms / p95 {run.totalP95Ms}ms
              {run.firstTokenP50Ms !== null
                ? ` · first token p50 ${run.firstTokenP50Ms}ms`
                : ''}
            </span>
          ) : null}
          {run.inputTokens !== null ? (
            <span className="text-muted">
              {run.inputTokens} in / {run.outputTokens ?? 0} out tokens
            </span>
          ) : null}
          <span className="ml-auto text-muted">
            {run.triggeredByEmail ?? run.triggeredBy} · {relativeTime(run.startedAt)}
          </span>
        </div>
        {run.error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {run.error}
          </p>
        ) : null}

        {overrideKeys.length > 0 ? (
          <div className="mt-4 border-t border-line/60 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono-label text-ink">Overrides tried:</span>
              {overrideKeys.map((key) => (
                <span
                  key={key}
                  className="rounded-full bg-brand-100 px-2.5 py-0.5 font-mono text-[11px] text-brand-800"
                >
                  {key} = {JSON.stringify(overrides[key])}
                </span>
              ))}
              {run.status === 'completed' && !promoted ? (
                <Button
                  variant="outline"
                  className="ml-auto"
                  onClick={() => setConfirming((c) => !c)}
                  disabled={promote.isPending}
                >
                  Apply these settings +
                </Button>
              ) : null}
              {promoted ? (
                <span className="ml-auto text-sm text-brand-700">
                  Applied. Live within ~30s; audit-logged.
                </span>
              ) : null}
            </div>
            {confirming ? (
              <div className="mt-3 rounded-xl bg-canvas/70 p-4 text-sm">
                <p className="mb-2 text-ink">
                  This saves the overrides to the LIVE settings (audit-logged as a normal
                  settings change):
                </p>
                <ul className="mb-3 space-y-1 font-mono text-xs text-muted">
                  {overrideKeys.map((key) => (
                    <li key={key}>
                      {key}: {resolved ? JSON.stringify(resolved[key]) : '?'} {'->'}{' '}
                      <span className="text-ink">{JSON.stringify(overrides[key])}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button
                    variant="solid"
                    onClick={() => void applyOverrides()}
                    disabled={promote.isPending}
                  >
                    {promote.isPending ? 'Applying…' : 'Confirm +'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
                {promote.isError ? <ErrorState error={promote.error} /> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted">
            Full configuration this run executed with
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-canvas p-3 font-mono text-xs text-ink">
            {JSON.stringify(run.configSnapshot, null, 2)}
          </pre>
        </details>
      </Panel>

      <Panel>
        <PanelHeader>Questions</PanelHeader>
        <RunResults results={results} previous={previous.data ?? null} current={run} />
      </Panel>
    </>
  );
}
