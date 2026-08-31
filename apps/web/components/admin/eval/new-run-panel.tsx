'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@joice/ui';
import {
  EvalRunActiveError,
  useBrainSettings,
  useEvalCases,
  useStartEvalRun,
  type StartEvalRunBody,
} from '@joice/api-client';
import { AUDIENCE_TIERS, AUDIENCE_TIER_LABELS, type AudienceTier } from '@joice/brain/schemas';
import { ErrorState, Panel, PanelHeader, Skeleton, Toggle } from '@/components/admin/ui';
import { AdminSelect, Field } from '@/components/admin/fields';
import { MODEL_PRESETS } from '@/components/admin/model-presets';

type Mode = 'retrieval' | 'full';

/** The knobs a run may override; everything else rides the stored settings. */
interface Knobs {
  model: string;
  toolsEnabled: boolean;
  topK: number;
  similarityFloor: number;
  maxToolRounds: number;
  promptCache: boolean;
  maxAnswerTokens: number;
}

/**
 * Start a run: pick the mode, optionally experiment with settings for this
 * run only, see what it will roughly cost, go. Only knobs that differ from
 * the stored settings are sent as overrides, so a run's "overrides applied"
 * record is honest.
 */
export function NewRunPanel({ hasActiveRun }: { hasActiveRun: boolean }) {
  const router = useRouter();
  const settings = useBrainSettings();
  const cases = useEvalCases();
  const start = useStartEvalRun();

  const [mode, setMode] = useState<Mode>('full');
  const [audience, setAudience] = useState<AudienceTier>('subscriber');
  const [knobs, setKnobs] = useState<Knobs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  const resolved = settings.data?.resolved;
  useEffect(() => {
    if (seeded.current || !resolved) return;
    seeded.current = true;
    setKnobs({
      model: resolved.model,
      toolsEnabled: resolved.toolsEnabled,
      topK: resolved.topK,
      similarityFloor: resolved.similarityFloor,
      maxToolRounds: resolved.maxToolRounds,
      promptCache: resolved.promptCache,
      maxAnswerTokens: resolved.maxAnswerTokens,
    });
  }, [resolved]);

  // Never vanish: a hidden panel with "Start one above" pointing at nothing
  // is how this shipped broken the first time. Loading and error states render
  // the card, and a failed settings fetch is visible and retryable.
  if (settings.isError) {
    return (
      <Panel className="mb-6">
        <PanelHeader>New run</PanelHeader>
        <p className="mb-2 text-sm text-muted">
          The brain settings could not be loaded, and a run needs them as its baseline.
        </p>
        <ErrorState error={settings.error} />
        <Button variant="outline" onClick={() => void settings.refetch()}>
          Try again
        </Button>
      </Panel>
    );
  }
  if (!resolved || !knobs) {
    return (
      <Panel className="mb-6">
        <PanelHeader>New run</PanelHeader>
        <Skeleton className="h-3 w-56" />
        <Skeleton className="mt-3 h-3 w-40" />
      </Panel>
    );
  }

  const set = <K extends keyof Knobs>(key: K, value: Knobs[K]) =>
    setKnobs((prev) => (prev ? { ...prev, [key]: value } : prev));

  const overrides: StartEvalRunBody['overrides'] = {};
  for (const key of Object.keys(knobs) as (keyof Knobs)[]) {
    if (knobs[key] !== resolved[key]) {
      (overrides as Record<string, unknown>)[key] = knobs[key];
    }
  }
  const overrideCount = Object.keys(overrides).length;

  const enabledCases = (cases.data ?? []).filter((c) => c.enabled).length;
  const costHint =
    mode === 'retrieval'
      ? `${enabledCases} questions, embeddings only, about a cent.`
      : knobs.toolsEnabled
        ? `${enabledCases} questions, up to ${enabledCases * (knobs.maxToolRounds + 1)} model calls through the tool loop.`
        : `${enabledCases} questions, roughly ${enabledCases * 2} model calls (a query rewrite plus an answer each).`;

  const modelIsPreset = MODEL_PRESETS.some((m) => m.value === knobs.model);

  const run = async () => {
    setError(null);
    try {
      const { run } = await start.mutateAsync({ mode, audience, overrides });
      router.push(`/admin/eval/${run.id}`);
    } catch (err) {
      setError(
        err instanceof EvalRunActiveError
          ? 'A run is already in progress.'
          : err instanceof Error
            ? err.message
            : 'Could not start the run.',
      );
    }
  };

  return (
    <Panel className="mb-6">
      <PanelHeader>New run</PanelHeader>

      <div className="flex flex-wrap items-end gap-6">
        <Field label="What to test" hint="Retrieval checks search only; full grades real answers.">
          <AdminSelect value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="retrieval">Retrieval only (cheap)</option>
            <option value="full">Full answers</option>
          </AdminSelect>
        </Field>

        {mode === 'full' ? (
          <Field
            label="Run as"
            hint="Which lifecycle stage the benchmark simulates; subscriber sees every tool."
          >
            <AdminSelect
              value={audience}
              onChange={(e) => setAudience(e.target.value as AudienceTier)}
            >
              {AUDIENCE_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {AUDIENCE_TIER_LABELS[tier]}
                </option>
              ))}
            </AdminSelect>
          </Field>
        ) : null}

        <Field label="Model" hint="For this run only; live settings stay untouched.">
          <div className="flex gap-2">
            <AdminSelect
              value={modelIsPreset ? knobs.model : 'custom'}
              // 'custom' empties the model so the free-text input appears;
              // the Run button stays disabled until an id is typed.
              onChange={(e) => set('model', e.target.value === 'custom' ? '' : e.target.value)}
            >
              {MODEL_PRESETS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </AdminSelect>
            {!modelIsPreset ? (
              <Input
                value={knobs.model}
                onChange={(e) => set('model', e.target.value)}
                placeholder="Bedrock model id"
                className="h-10 w-72 max-w-full bg-canvas font-code text-xs"
              />
            ) : null}
          </div>
        </Field>
      </div>

      {mode === 'full' ? (
        <details className="mt-4">
          <summary className="mono-label cursor-pointer text-ink">
            Experiment with settings{overrideCount > 0 ? ` (${overrideCount} changed)` : ''}
          </summary>
          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div className="flex items-center gap-2">
              <Toggle
                checked={knobs.toolsEnabled}
                onChange={(v) => set('toolsEnabled', v)}
                label="Tool mode"
              />
              <span className="text-sm text-ink">Tool mode</span>
            </div>
            <Field label="Notes per answer (topK)">
              <Input
                type="number"
                min={1}
                max={20}
                value={knobs.topK}
                onChange={(e) => set('topK', Math.min(20, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
                className="h-10 max-w-28 bg-canvas text-sm"
              />
            </Field>
            <Field label="Match threshold">
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={knobs.similarityFloor}
                onChange={(e) =>
                  set('similarityFloor', Math.min(1, Math.max(0, Number(e.target.value) || 0)))
                }
                className="h-10 max-w-28 bg-canvas text-sm"
              />
            </Field>
            {knobs.toolsEnabled ? (
              <Field label="Max tool rounds">
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={knobs.maxToolRounds}
                  onChange={(e) =>
                    set('maxToolRounds', Math.min(5, Math.max(1, Math.round(Number(e.target.value)) || 1)))
                  }
                  className="h-10 max-w-28 bg-canvas text-sm"
                />
              </Field>
            ) : null}
            <Field label="Max answer tokens">
              <Input
                type="number"
                min={128}
                max={4096}
                value={knobs.maxAnswerTokens}
                onChange={(e) => set('maxAnswerTokens', Math.min(4096, Math.max(128, Math.round(Number(e.target.value)) || 128)))}
                className="h-10 max-w-32 bg-canvas text-sm"
              />
            </Field>
            <div className="flex items-center gap-2">
              <Toggle
                checked={knobs.promptCache}
                onChange={(v) => set('promptCache', v)}
                label="Prompt caching"
              />
              <span className="text-sm text-ink">Prompt caching</span>
            </div>
          </div>
        </details>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button
          variant="solid"
          onClick={() => void run()}
          disabled={hasActiveRun || start.isPending || enabledCases === 0 || knobs.model.trim().length === 0}
        >
          {start.isPending ? 'Starting…' : hasActiveRun ? 'A run is in progress' : 'Run the eval +'}
        </Button>
        <span className="text-sm text-muted">{costHint}</span>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
