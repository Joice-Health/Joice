'use client';

import { useState } from 'react';
import { Button, Input } from '@joice/ui';
import {
  useCreateEvalCase,
  useDeleteEvalCase,
  useEvalCases,
  useUpdateEvalCase,
  type EvalCaseView,
} from '@joice/api-client';
import { Card, EmptyState, ErrorState, Table, Td, Th, Toggle } from '@/components/admin/ui';
import { Field, selectClass, textareaClass } from './form';

/** The four tools a case can expect; must track the brain's toolbelt. */
const TOOL_OPTIONS = [
  'search_notes',
  'search_catalogue',
  'request_clinician_handoff',
  'flag_intent',
] as const;

interface Draft {
  id: string | null; // null = creating
  question: string;
  expectSources: string; // one path per line in the editor
  expectRefusal: boolean;
  expectTool: string; // '' = none
  mustCite: boolean;
  tags: string; // comma separated in the editor
  notes: string;
}

const emptyDraft: Draft = {
  id: null,
  question: '',
  expectSources: '',
  expectRefusal: false,
  expectTool: '',
  mustCite: false,
  tags: '',
  notes: '',
};

const draftFrom = (c: EvalCaseView): Draft => ({
  id: c.id,
  question: c.question,
  expectSources: (c.expectSources ?? []).join('\n'),
  expectRefusal: c.expectRefusal,
  expectTool: c.expectTool ?? '',
  mustCite: c.mustCite,
  tags: (c.tags ?? []).join(', '),
  notes: c.notes ?? '',
});

function expectationSummary(c: EvalCaseView): string {
  const parts: string[] = [];
  if (c.expectSources?.length) parts.push(`cites ${c.expectSources.length} source${c.expectSources.length > 1 ? 's' : ''}`);
  if (c.mustCite && !c.expectSources?.length) parts.push('must cite');
  if (c.expectRefusal) parts.push('must decline');
  if (c.expectTool) parts.push(`uses ${c.expectTool}`);
  return parts.join(' · ') || 'no expectations';
}

/**
 * The golden set: every question the eval grades against. Add a question the
 * moment the companion handles something badly and it becomes a permanent
 * regression test. Disabling keeps a question (and its history) without
 * running it; deleting never erases past results.
 */
export function CasesSection() {
  const cases = useEvalCases();
  const create = useCreateEvalCase();
  const update = useUpdateEvalCase();
  const remove = useDeleteEvalCase();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!draft) return;
    setError(null);
    const body = {
      question: draft.question.trim(),
      expectSources: draft.expectSources
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      expectRefusal: draft.expectRefusal,
      ...(draft.expectTool ? { expectTool: draft.expectTool } : {}),
      mustCite: draft.mustCite,
      tags: draft.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };
    try {
      if (draft.id) await update.mutateAsync({ id: draft.id, patch: body });
      else await create.mutateAsync(body);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the question.');
    }
  };

  const destroy = async (c: EvalCaseView) => {
    if (!window.confirm(`Delete "${c.question}"? Past results keep their copy.`)) return;
    await remove.mutateAsync(c.id).catch(() => {});
  };

  const saving = create.isPending || update.isPending;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Benchmark questions</h2>
        <Button variant="outline" onClick={() => setDraft({ ...emptyDraft })} disabled={!!draft}>
          Add a question +
        </Button>
      </div>

      {cases.isError ? <ErrorState error={cases.error} /> : null}

      {draft ? (
        <div className="mb-6 rounded-card bg-canvas/70 p-4">
          <div className="flex flex-col gap-4">
            <Field label="Question" hint="Asked exactly as a visitor would.">
              <textarea
                value={draft.question}
                onChange={(e) => set('question', e.target.value)}
                rows={2}
                maxLength={1000}
                className={textareaClass}
              />
            </Field>
            <div className="flex flex-wrap gap-6">
              <Field
                label="Expected sources"
                hint="One note path per line, e.g. monographs/bpc-157.md. The answer must cite each."
              >
                <textarea
                  value={draft.expectSources}
                  onChange={(e) => set('expectSources', e.target.value)}
                  rows={3}
                  className={`${textareaClass} w-80 font-mono text-xs`}
                />
              </Field>
              <Field label="Expected tool" hint="Only judged when tool mode is on.">
                <select
                  value={draft.expectTool}
                  onChange={(e) => set('expectTool', e.target.value)}
                  className={selectClass}
                >
                  <option value="">None</option>
                  {TOOL_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-col gap-3 pt-1">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={draft.expectRefusal}
                    onChange={(e) => set('expectRefusal', e.target.checked)}
                  />
                  Must decline (off-topic question)
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={draft.mustCite}
                    onChange={(e) => set('mustCite', e.target.checked)}
                  />
                  Must cite something
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <Field label="Tags" hint="Comma separated, for your own grouping.">
                <Input value={draft.tags} onChange={(e) => set('tags', e.target.value)} className="h-11 w-72" />
              </Field>
              <Field label="Notes">
                <Input value={draft.notes} onChange={(e) => set('notes', e.target.value)} className="h-11 w-96" />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => void save()} disabled={saving || draft.question.trim().length === 0}>
                {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add question'}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
              {error ? (
                <span className="text-sm text-red-600" role="alert">
                  {error}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {(cases.data ?? []).length === 0 && !cases.isPending ? (
        <EmptyState>No questions yet. Add the first one above.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Question</Th>
              <Th>Expectations</Th>
              <Th>Tags</Th>
              <Th>Enabled</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {(cases.data ?? []).map((c) => (
              <tr key={c.id} className={c.enabled ? undefined : 'opacity-60'}>
                <Td className="max-w-md">{c.question}</Td>
                <Td className="text-muted">{expectationSummary(c)}</Td>
                <Td className="text-muted">{(c.tags ?? []).join(', ')}</Td>
                <Td>
                  <Toggle
                    checked={c.enabled}
                    onChange={(enabled) => void update.mutateAsync({ id: c.id, patch: { enabled } })}
                    disabled={update.isPending}
                    label={`Enable ${c.question}`}
                  />
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setDraft(draftFrom(c))}
                    className="mono-label mr-3 text-muted hover:text-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void destroy(c)}
                    className="mono-label text-red-600/80 hover:text-red-700"
                  >
                    Delete
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-xs text-muted">Runs use up to 100 enabled questions.</p>
    </Card>
  );
}
