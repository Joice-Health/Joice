'use client';

import { useState } from 'react';
import {
  useAdminFlowVersions,
  useSimulateFlow,
  type SimulateResult,
} from '@joice/api-client';
import { GOAL_VALUES } from '@joice/core/schemas';
import { US_STATES } from '@joice/utils';
import { Button, Input, cn } from '@joice/ui';
import { Badge, Card, ErrorState, Table, Td, Th } from '@/components/admin/ui';

/**
 * "What will this person see, in what order, and why." A persona (state, date
 * of birth, goal, anything else by question key) runs through the real engine
 * against a chosen version; the result is the path, the gates, the derived
 * traits and segment, and the why-trace for every rule that fired. Nothing is
 * persisted; publish still goes through the report.
 */
export function SimulatorPanel() {
  const versions = useAdminFlowVersions();
  const simulate = useSimulateFlow();
  const [versionId, setVersionId] = useState<string>('');
  const [state, setState] = useState('CA');
  const [dob, setDob] = useState('1990-06-15');
  const [goal, setGoal] = useState<string>('weight-metabolic');
  const [extra, setExtra] = useState('{\n  "weight_tried": ["diet"],\n  "weight_timeline": "6mo",\n  "peptide_experience": "none",\n  "first_name": "Sim",\n  "consent_terms": true\n}');
  const [minimumAge, setMinimumAge] = useState('');
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = versions.data?.items ?? [];
  const effectiveVersion = versionId || items.find((v) => v.status === 'published')?.id || '';

  async function run() {
    setError(null);
    let persona: Record<string, unknown>;
    try {
      persona = { us_state: state, date_of_birth: dob, goal, ...(JSON.parse(extra || '{}') as Record<string, unknown>) };
    } catch {
      setError('The extra answers are not valid JSON.');
      return;
    }
    try {
      const res = await simulate.mutateAsync({
        versionId: effectiveVersion,
        persona,
        ...(minimumAge ? { context: { minimumAge: Number(minimumAge) } } : {}),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed.');
    }
  }

  if (versions.error) return <ErrorState error={versions.error} />;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="mono-label text-muted">Version</span>
            <select
              value={effectiveVersion}
              onChange={(e) => setVersionId(e.target.value)}
              className="h-10 rounded-full bg-canvas px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
            >
              {items.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} ({v.status})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="mono-label text-muted">State</span>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-10 rounded-full bg-canvas px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
            >
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="mono-label text-muted">Date of birth</span>
            <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="h-10 px-3 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="mono-label text-muted">Goal</span>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="h-10 rounded-full bg-canvas px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
            >
              {GOAL_VALUES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <label className="flex flex-col gap-1">
            <span className="mono-label text-muted">More answers, by question key (JSON)</span>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={6}
              className="rounded-2xl bg-canvas p-3 font-mono text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
            />
          </label>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="mono-label text-muted">Minimum age override</span>
              <Input value={minimumAge} placeholder="live setting" inputMode="numeric" onChange={(e) => setMinimumAge(e.target.value)} className="h-10 max-w-32 px-3 text-sm" />
            </label>
            <Button variant="solid" onClick={run} disabled={simulate.isPending || !effectiveVersion} className="self-start">
              {simulate.isPending ? 'Running…' : 'Run the engine +'}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      {result ? <ResultView result={result} /> : null}
    </div>
  );
}

function ResultView({ result }: { result: SimulateResult }) {
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={result.stoppedAt === 'complete' ? 'active' : result.stoppedAt === 'gate' ? 'suspended' : 'pending'}>
            {result.stoppedAt === 'complete' ? 'completes' : result.stoppedAt === 'gate' ? 'hits a gate' : result.stoppedAt}
          </Badge>
          {result.segment ? <span className="mono-label text-muted">segment: {result.segment}</span> : null}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Step</Th>
              <Th>Section</Th>
              <Th>Question</Th>
              <Th>Answer</Th>
            </tr>
          </thead>
          <tbody>
            {result.path.map((step, i) => (
              <tr key={i}>
                <Td>
                  <span className={cn('mono-label', step.kind === 'gate' ? 'text-red-700' : 'text-muted')}>
                    {step.kind}
                    {step.error ? ' (refused)' : step.skipped ? ' (skipped)' : ''}
                  </span>
                </Td>
                <Td>{step.sectionKey ?? ''}</Td>
                <Td>{step.questionKey ?? (step.kind === 'gate' ? String(step.value ?? '') : '')}</Td>
                <Td className="max-w-64 truncate">{step.error ?? formatValue(step.kind === 'gate' ? undefined : step.value)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <p className="mono-label text-muted">Why: every rule the engine evaluated, in order</p>
        <ul className="mt-3 flex flex-col gap-2">
          {result.trace.map((entry, i) => (
            <li key={i}>
              <details>
                <summary className="cursor-pointer text-sm text-ink">
                  <span className="mono-label mr-2 text-muted">{entry.path}</span>
                  <WhySummary why={entry.why} />
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-xl bg-canvas p-3 text-xs">{JSON.stringify(entry.why, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="mono-label text-muted">Protocols this persona matches</p>
        <p className="mt-1 text-xs text-muted">
          A recommendation preview from the stored protocol rules: ranked, clinician review
          always required, never shown to a member.
        </p>
        {result.protocols.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No protocol rule matches these traits.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {result.protocols.map((match) => (
              <li key={match.protocolKey}>
                <details>
                  <summary className="cursor-pointer text-sm text-ink">
                    <span className="mono-label mr-2 text-muted">[ {match.protocolKey} ]</span>
                    {match.label}
                    <span className="mono-label ml-2 text-muted">priority {match.priority}</span>
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-canvas p-3 text-xs">{JSON.stringify(match.why, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <p className="mono-label text-muted">Derived traits at the end</p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-canvas p-3 text-xs">{JSON.stringify(result.traits, null, 2)}</pre>
      </Card>
    </>
  );
}

function WhySummary({ why }: { why: SimulateResult['trace'][number]['why'] }) {
  const result = (why as { result?: boolean }).result;
  return <Badge tone={result ? 'active' : 'pending'}>{result ? 'matched' : 'did not match'}</Badge>;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  return String(value);
}
