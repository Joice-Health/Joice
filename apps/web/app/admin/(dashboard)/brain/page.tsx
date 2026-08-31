'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Input, cn } from '@joice/ui';
import {
  useBrainSettings,
  useResetBrainSettings,
  useUpdateBrainSettings,
  type AdminBrain,
} from '@joice/api-client';
import { Card, ErrorState, PageHeader, Toggle } from '@/components/admin/ui';
import { MODEL_PRESETS } from '@/components/admin/model-presets';
import { LastEvalLine } from '@/components/admin/eval/last-eval-line';

type BrainForm = AdminBrain['resolved'];

const REWRITE_MODEL_PRESETS = [
  { value: 'us.amazon.nova-lite-v1:0', label: 'Amazon Nova Lite (fast)' },
  { value: 'us.amazon.nova-pro-v1:0', label: 'Amazon Nova Pro' },
] as const;

const VOICE_PRESETS = ['Ruth', 'Danielle', 'Joanna', 'Salli', 'Tiffany', 'Matthew', 'Stephen'] as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const textareaClass =
  'glass w-full rounded-card px-4 py-3 text-sm text-ink outline-none placeholder:text-muted/60 focus-visible:ring-2 focus-visible:ring-brand-300/50';
const selectClass =
  'glass h-11 rounded-card px-4 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-300/50';

/**
 * Admin control panel for the chatbot brain. Edits the single admin-managed
 * config that drives persona, tone, guardrails, retrieval, model, and voice —
 * changes go live within ~30 seconds and every save is audit-logged. The
 * safety floor shown at the bottom is code-level and not editable here.
 */
export default function AdminBrainPage() {
  const query = useBrainSettings();
  const update = useUpdateBrainSettings();
  const reset = useResetBrainSettings();

  const [form, setForm] = useState<BrainForm | null>(null);
  const [topicDraft, setTopicDraft] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const seededAt = useRef<number>(0);

  // Seed the form from the resolved config; re-seed after a reset (dataUpdatedAt moves).
  useEffect(() => {
    if (query.data && query.dataUpdatedAt > seededAt.current && (form === null || reset.isSuccess)) {
      seededAt.current = query.dataUpdatedAt;
      setForm(query.data.resolved);
    }
  }, [query.data, query.dataUpdatedAt, form, reset.isSuccess]);

  if (query.isError) {
    return (
      <>
        <PageHeader title="Brain" />
        <Card>
          <ErrorState error={query.error} />
        </Card>
      </>
    );
  }
  if (!form || !query.data) {
    return (
      <>
        <PageHeader title="Brain" />
        <Card>
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        </Card>
      </>
    );
  }

  const set = <K extends keyof BrainForm>(key: K, value: BrainForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const numberInput = (key: 'topK' | 'maxAnswerTokens', min: number, max: number) => (
    <Input
      type="number"
      min={min}
      max={max}
      value={form[key]}
      onChange={(e) => set(key, Math.round(Number(e.target.value)) || min)}
      className="h-11 max-w-32"
    />
  );

  const addTopic = () => {
    const topic = topicDraft.trim();
    if (!topic || form.restrictedTopics.includes(topic) || form.restrictedTopics.length >= 20) return;
    set('restrictedTopics', [...form.restrictedTopics, topic]);
    setTopicDraft('');
  };

  const modelIsPreset = MODEL_PRESETS.some((m) => m.value === form.model);

  const save = () =>
    update.mutate(form, {
      onSuccess: () => setSavedAt(Date.now()),
    });

  return (
    <>
      <PageHeader title="Brain">
        <Button
          variant="ghost"
          disabled={reset.isPending}
          onClick={() => {
            if (confirm('Reset ALL brain settings to the built-in defaults?')) {
              setForm(null); // re-seed from the refetched resolved config
              reset.mutate();
            }
          }}
        >
          Reset to defaults
        </Button>
        <Button variant="solid" onClick={save} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </PageHeader>

      <p className="-mt-3 mb-6 text-sm text-muted">
        Changes go live within ~30 seconds. Test on <span className="font-mono">/ask</span> after
        saving. Every save is recorded in the audit log.
      </p>

      <div className="flex flex-col gap-6">
        {/* --- Persona & tone --- */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-ink">Persona &amp; tone</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              <Field label="Name">
                <Input
                  value={form.personaName}
                  onChange={(e) => set('personaName', e.target.value)}
                  className="h-11 max-w-xs"
                />
              </Field>
              <Field
                label="Voice (spoken answers)"
                hint="Polly generative-engine voices only; others fail to synthesize."
              >
                <select
                  value={form.pollyVoiceId}
                  onChange={(e) => set('pollyVoiceId', e.target.value)}
                  className={selectClass}
                >
                  {VOICE_PRESETS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                  {!VOICE_PRESETS.includes(form.pollyVoiceId as (typeof VOICE_PRESETS)[number]) ? (
                    <option value={form.pollyVoiceId}>{form.pollyVoiceId}</option>
                  ) : null}
                </select>
              </Field>
            </div>
            <Field label="Who the assistant is" hint="Completes “You are {name}, …” in the prompt.">
              <textarea
                value={form.personaDescription}
                onChange={(e) => set('personaDescription', e.target.value)}
                rows={2}
                maxLength={1000}
                className={textareaClass}
              />
            </Field>
            <Field label="Tone instructions" hint="How it should sound, e.g. “Warm and encouraging, like a coach. Short sentences.”">
              <textarea
                value={form.toneInstructions}
                onChange={(e) => set('toneInstructions', e.target.value)}
                rows={2}
                maxLength={2000}
                className={textareaClass}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink">How it refers to its knowledge</span>
              {(
                [
                  ['natural', 'Talks like a person', 'Never mentions notes, documents, or sources; the knowledge is simply its own.'],
                  ['cite-notes', 'References the clinical notes', 'May say things like “our clinical notes describe…”.'],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="attributionStyle"
                    checked={form.attributionStyle === value}
                    onChange={() => set('attributionStyle', value)}
                    className="mt-1 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm text-ink">{label}</span>
                    <span className="block text-xs text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Toggle
                checked={form.showCitations}
                onChange={(v) => set('showCitations', v)}
                label="Show citations"
              />
              <span className="text-sm text-ink">
                Show citations{' '}
                <span className="text-xs text-muted">([n] markers in answers + source chips under them)</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Toggle
                checked={form.showToolActivity}
                onChange={(v) => set('showToolActivity', v)}
                label="Show tool activity"
              />
              <span className="text-sm text-ink">
                Show tool activity{' '}
                <span className="text-xs text-muted">
                  (tool mode only: the live status line while it searches + chips under the
                  answer naming what it checked; off, tool names never reach the browser)
                </span>
              </span>
            </div>
          </div>
        </Card>

        {/* --- Messages & copy --- */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-ink">Messages &amp; copy</h2>
          <div className="flex flex-col gap-4">
            <Field label="When the notes don’t cover a question" hint="Returned verbatim instead of an answer.">
              <textarea
                value={form.notCoveredMessage}
                onChange={(e) => set('notCoveredMessage', e.target.value)}
                rows={2}
                maxLength={1000}
                className={textareaClass}
              />
            </Field>
            <Field label="Clinician handoff" hint="Used when a question needs individual medical judgment.">
              <textarea
                value={form.clinicianHandoffMessage}
                onChange={(e) => set('clinicianHandoffMessage', e.target.value)}
                rows={2}
                maxLength={500}
                className={textareaClass}
              />
            </Field>
            <Field label="Chat intro (empty state on /ask)">
              <textarea
                value={form.emptyStateHint}
                onChange={(e) => set('emptyStateHint', e.target.value)}
                rows={2}
                maxLength={300}
                className={textareaClass}
              />
            </Field>
            <div className="flex flex-wrap gap-4">
              <Field label="Input placeholder">
                <Input
                  value={form.inputPlaceholder}
                  onChange={(e) => set('inputPlaceholder', e.target.value)}
                  maxLength={200}
                  className="h-11 w-96 max-w-full"
                />
              </Field>
            </div>
            <Field
              label="Disclaimer line"
              hint="⚠ Shown under the chat on every visit; copy changes here require counsel review."
            >
              <Input
                value={form.disclaimer}
                onChange={(e) => set('disclaimer', e.target.value)}
                maxLength={200}
                className="h-11 w-full max-w-xl"
              />
            </Field>
          </div>
        </Card>

        {/* --- Companion (pre-onboarding capture) --- */}
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">Companion (pre-onboarding)</h2>
          <p className="mb-4 text-sm text-muted">
            The words the capture flow says on first contact. The fields it collects and their
            validation are fixed in code; only this copy is editable.
          </p>
          <div className="flex flex-col gap-4">
            <Field
              label="Capture intro"
              hint="Woven in after the visitor's first answer, just before the name question."
            >
              <textarea
                value={form.companionGreeting}
                onChange={(e) => set('companionGreeting', e.target.value)}
                rows={2}
                maxLength={400}
                className={textareaClass}
              />
            </Field>
            <div className="flex flex-wrap gap-4">
              <Field label="Ask for name">
                <Input
                  value={form.companionNamePrompt}
                  onChange={(e) => set('companionNamePrompt', e.target.value)}
                  maxLength={200}
                  className="h-11 w-96 max-w-full"
                />
              </Field>
              <Field label="Ask for email">
                <Input
                  value={form.companionEmailPrompt}
                  onChange={(e) => set('companionEmailPrompt', e.target.value)}
                  maxLength={200}
                  className="h-11 w-96 max-w-full"
                />
              </Field>
              <Field label="Ask for goal">
                <Input
                  value={form.companionGoalPrompt}
                  onChange={(e) => set('companionGoalPrompt', e.target.value)}
                  maxLength={200}
                  className="h-11 w-96 max-w-full"
                />
              </Field>
            </div>
            <Field label="Conversion prompt" hint="Offered once capture is complete.">
              <textarea
                value={form.companionConversionPrompt}
                onChange={(e) => set('companionConversionPrompt', e.target.value)}
                rows={2}
                maxLength={400}
                className={textareaClass}
              />
            </Field>
            <Field label="Conversion button label">
              <Input
                value={form.companionConversionCtaLabel}
                onChange={(e) => set('companionConversionCtaLabel', e.target.value)}
                maxLength={60}
                className="h-11 w-72 max-w-full"
              />
            </Field>
          </div>
        </Card>

        {/* --- Guardrails --- */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-ink">Guardrails</h2>
          <div className="flex flex-col gap-4">
            <Field
              label="Restricted topics"
              hint="The bot declines these and points members to the clinical team, even if the notes cover them. Max 20."
            >
              <div className="flex flex-wrap items-center gap-2">
                {form.restrictedTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-400/15 px-3 py-1 text-sm text-brand-800"
                  >
                    {topic}
                    <button
                      type="button"
                      aria-label={`Remove ${topic}`}
                      onClick={() => set('restrictedTopics', form.restrictedTopics.filter((t) => t !== topic))}
                      className="text-brand-700 hover:text-brand-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <Input
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTopic();
                    }
                  }}
                  placeholder="e.g. pregnancy"
                  className="h-9 max-w-48 text-sm"
                />
                <Button variant="outline" size="md" onClick={addTopic} className="h-9 px-3 text-sm">
                  Add
                </Button>
              </div>
            </Field>
            <Field
              label="Additional instructions"
              hint={`Appended to the prompt after everything else: the free-form knob. ${form.customInstructions.length}/4000`}
            >
              <textarea
                value={form.customInstructions}
                onChange={(e) => set('customInstructions', e.target.value)}
                rows={4}
                maxLength={4000}
                className={cn(textareaClass, 'font-mono text-xs')}
              />
            </Field>
          </div>
        </Card>

        {/* --- Retrieval & model --- */}
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-ink">Retrieval &amp; model</h2>
          <div className="flex flex-wrap gap-6">
            <Field label="Notes per answer (topK)" hint="How many note excerpts to consider. 1–20.">
              {numberInput('topK', 1, 20)}
            </Field>
            <Field label="Match threshold" hint="0–1. How closely a note must match before it’s used. Higher = stricter, more “not covered”.">
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={form.similarityFloor}
                onChange={(e) => set('similarityFloor', Math.min(1, Math.max(0, Number(e.target.value) || 0)))}
                className="h-11 max-w-32"
              />
            </Field>
            <Field label="Max answer length (tokens)" hint="128–4096.">
              {numberInput('maxAnswerTokens', 128, 4096)}
            </Field>
            <Field label="Model" hint="Anthropic models need Bedrock model access approved on the AWS account.">
              <div className="flex gap-2">
                <select
                  value={modelIsPreset ? form.model : 'custom'}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') set('model', e.target.value);
                  }}
                  className={selectClass}
                >
                  {MODEL_PRESETS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
                {!modelIsPreset ? (
                  <Input
                    value={form.model}
                    onChange={(e) => set('model', e.target.value)}
                    placeholder="Bedrock model id"
                    className="h-11 w-72 max-w-full font-mono text-xs"
                  />
                ) : null}
              </div>
            </Field>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-ink/10 pt-4">
            <div className="flex items-center gap-3">
              <Toggle
                checked={form.queryRewriting}
                onChange={(v) => set('queryRewriting', v)}
                label="Follow-up understanding"
              />
              <span className="text-sm text-ink">
                Follow-up understanding{' '}
                <span className="text-xs text-muted">
                  (rewrites “is there a protocol for that?” into a standalone search using the
                  conversation — adds a beat of latency on follow-ups only)
                </span>
              </span>
            </div>
            {form.queryRewriting ? (
              <Field label="Rewrite model" hint="Small + fast is right here; it only writes search queries.">
                <select
                  value={
                    REWRITE_MODEL_PRESETS.some((m) => m.value === form.rewriteModel)
                      ? form.rewriteModel
                      : form.rewriteModel
                  }
                  onChange={(e) => set('rewriteModel', e.target.value)}
                  className={selectClass}
                >
                  {REWRITE_MODEL_PRESETS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                  {!REWRITE_MODEL_PRESETS.some((m) => m.value === form.rewriteModel) ? (
                    <option value={form.rewriteModel}>{form.rewriteModel}</option>
                  ) : null}
                </select>
              </Field>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-ink/10 pt-4">
            <div className="flex items-center gap-3">
              <Toggle
                checked={form.toolsEnabled}
                onChange={(v) => set('toolsEnabled', v)}
                label="Tool-calling answers"
              />
              <span className="text-sm text-ink">
                Tool-calling answers{' '}
                <span className="text-xs text-muted">
                  (the model decides when to search the notes or the catalogue, and can flag
                  clinician handoffs — off runs the classic retrieve-then-answer pipeline. This
                  toggle is the rollback switch; changes land within ~30s, no deploy.)
                </span>
              </span>
            </div>
            <LastEvalLine />
            {form.toolsEnabled ? (
              <Field
                label="Max tool rounds"
                hint="1–5. Each round is an extra model call; this caps cost and latency per answer."
              >
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={form.maxToolRounds}
                  onChange={(e) =>
                    set('maxToolRounds', Math.min(5, Math.max(1, Math.round(Number(e.target.value)) || 1)))
                  }
                  className="h-11 max-w-32"
                />
              </Field>
            ) : null}
            <div className="flex items-center gap-3">
              <Toggle
                checked={form.promptCache}
                onChange={(v) => set('promptCache', v)}
                label="Prompt caching"
              />
              <span className="text-sm text-ink">
                Prompt caching{' '}
                <span className="text-xs text-muted">
                  (Bedrock caches the static prompt prefix — pays off mainly with tool-calling
                  on. Models that don&rsquo;t support it fall back automatically.)
                </span>
              </span>
            </div>
          </div>
        </Card>

        {/* --- Safety floor (read-only) --- */}
        <Card className="border border-brand-400/20">
          <h2 className="mb-2 text-lg font-semibold text-ink">Always enforced</h2>
          <p className="mb-3 text-sm text-muted">
            These rules are built into the code and cannot be changed or removed from this page.
          </p>
          <pre className="rounded-card bg-canvas p-4 font-mono text-xs whitespace-pre-wrap text-ink">
            {form.toolsEnabled && query.data.toolSafetyFloor
              ? query.data.toolSafetyFloor
              : query.data.safetyFloor}
          </pre>
        </Card>

        <div className="flex items-center gap-3">
          <Button variant="solid" onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          {savedAt && !update.isPending && !update.isError ? (
            <span className="text-sm text-muted">Saved. Live within ~30s.</span>
          ) : null}
        </div>
        {update.isError ? <ErrorState error={update.error} /> : null}
        {reset.isError ? <ErrorState error={reset.error} /> : null}
      </div>
    </>
  );
}
