'use client';

import { useMemo, useState } from 'react';
import {
  PublishRefusedError,
  useAdminFlowVersion,
  useAdminFlowVersions,
  useAdminFlows,
  useCreateFlowVersion,
  usePublishFlowVersion,
  useSaveFlowVersion,
  type AdminPhiStatus,
  type ValidationReportView,
} from '@joice/api-client';
import { flowDefinitionSchema, type FlowDefinition, type FlowQuestion } from '@joice/core/schemas';
import { Button, Input, cn } from '@joice/ui';
import { Badge, Card, EmptyState, ErrorState } from '@/components/admin/ui';
import { ConditionBuilder } from './condition-builder';
import { QuestionEditor } from './question-editor';
import { ValidationReportPanel } from './validation-report';

/**
 * The flow editor. Admins edit a DRAFT (published versions are frozen; the
 * button to make a draft copies the published definition), reorder and reword
 * sections and questions, bind traits, build show-when rules, then Save (which
 * returns the live validation report) and Publish (which refuses with the
 * report until it is clean). Locked sections wear their badge and keep their
 * structure; the validator enforces it server-side regardless.
 */
export function FlowEditor() {
  const versions = useAdminFlowVersions();
  const flowList = useAdminFlows();
  const createDraft = useCreateFlowVersion();
  const draftRow = versions.data?.items.find((v) => v.status === 'draft');
  const publishedRow = versions.data?.items.find((v) => v.status === 'published');
  const phi = flowList.data?.phi;

  if (versions.isPending) return <p className="mono-label text-muted">Loading…</p>;
  if (versions.error) return <ErrorState error={versions.error} />;

  if (!draftRow) {
    return (
      <Card>
        <EmptyState>No draft right now. The published version is live; make a draft to change it.</EmptyState>
        <div className="mt-4 flex justify-center">
          <Button
            variant="solid"
            disabled={createDraft.isPending}
            onClick={() => createDraft.mutate({ notes: publishedRow ? `From v${publishedRow.version}` : undefined })}
          >
            {createDraft.isPending ? 'Creating…' : 'Make a draft +'}
          </Button>
        </div>
      </Card>
    );
  }
  return <DraftEditor draftId={draftRow.id} draftVersion={draftRow.version} phi={phi} />;
}

function DraftEditor({
  draftId,
  draftVersion,
  phi,
}: {
  draftId: string;
  draftVersion: number;
  phi: AdminPhiStatus | undefined;
}) {
  const version = useAdminFlowVersion(draftId);
  const save = useSaveFlowVersion();
  const publish = usePublishFlowVersion();
  const [draft, setDraft] = useState<FlowDefinition | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReportView | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // The stored definition parses through the same schema the server uses.
  const stored = useMemo(() => {
    if (!version.data) return null;
    const parsed = flowDefinitionSchema.safeParse(version.data.definition);
    return parsed.success ? parsed.data : null;
  }, [version.data]);
  const definition = draft ?? stored;

  if (version.isPending) return <p className="mono-label text-muted">Loading the draft…</p>;
  if (version.error || !definition) return <ErrorState error={version.error ?? new Error("The draft definition does not parse on this build.")} />;

  const dirty = draft !== null;
  const update = (next: FlowDefinition) => setDraft(next);
  const setQuestion = (key: string, q: FlowQuestion) =>
    update({ ...definition, questions: { ...definition.questions, [key]: q } });

  async function onSave() {
    setMessage(null);
    try {
      const result = await save.mutateAsync({ id: draftId, definition: definition! });
      setReport(result.report);
      setDraft(null);
      setMessage('Saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  async function onPublish() {
    setMessage(null);
    try {
      if (dirty) await save.mutateAsync({ id: draftId, definition: definition! });
      await publish.mutateAsync({ id: draftId });
      setDraft(null);
      setReport(null);
      setMessage(`Published v${draftVersion}. Live sessions keep their logic unless only copy changed.`);
    } catch (err) {
      if (err instanceof PublishRefusedError) {
        setReport(err.report);
        setMessage('Not published: the report below says why.');
        return;
      }
      setMessage(err instanceof Error ? err.message : 'Publish failed.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge tone="pending">draft v{draftVersion}</Badge>
          {phi ? <Badge tone={phi.unlocked ? 'on' : 'suspended'}>{phi.unlocked ? 'health unlocked' : 'health locked'}</Badge> : null}
          {dirty ? <span className="mono-label text-muted">unsaved changes</span> : null}
        </div>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={save.isPending || !dirty}>
            {save.isPending ? 'Saving…' : 'Save draft'}
          </Button>
          <Button variant="solid" onClick={onPublish} disabled={publish.isPending || save.isPending}>
            {publish.isPending ? 'Publishing…' : 'Publish +'}
          </Button>
        </div>
        {phi && !phi.unlocked ? (
          <p className="basis-full text-xs text-muted">
            Medical questions can be drafted, never published: publishing is locked until the Before-PHI
            checklist is complete and both PHI keys are on. Keys now: infrastructure (PHI_READY){' '}
            {phi.ready ? 'on' : 'off'}, health flag {phi.flag ? 'on' : 'off'}.
          </p>
        ) : null}
        {message ? <p className="mono-label basis-full text-muted">{message}</p> : null}
      </Card>

      {report ? (
        <Card>
          <ValidationReportPanel report={report} />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(240px,1fr)_2fr]">
        <Card className="self-start">
          <SectionList definition={definition} selected={selected} onSelect={setSelected} onChange={update} />
        </Card>
        <Card>
          {selected && definition.questions[selected] ? (
            <QuestionEditor definition={definition} questionKey={selected} onChange={(q) => setQuestion(selected, q)} />
          ) : (
            <EmptyState>Pick a question on the left to edit it.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}

function SectionList({
  definition,
  selected,
  onSelect,
  onChange,
}: {
  definition: FlowDefinition;
  selected: string | null;
  onSelect: (key: string) => void;
  onChange: (next: FlowDefinition) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const moveSection = (index: number, delta: number) => {
    const sections = [...definition.sections];
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const [row] = sections.splice(index, 1);
    sections.splice(target, 0, row!);
    onChange({ ...definition, sections });
  };
  const moveQuestion = (sectionIndex: number, questionIndex: number, delta: number) => {
    const sections = definition.sections.map((s, i) => {
      if (i !== sectionIndex) return s;
      const questions = [...s.questions];
      const target = questionIndex + delta;
      if (target < 0 || target >= questions.length) return s;
      const [q] = questions.splice(questionIndex, 1);
      questions.splice(target, 0, q!);
      return { ...s, questions };
    });
    onChange({ ...definition, sections });
  };
  const addQuestion = (sectionIndex: number) => {
    const base = 'new_question';
    let key = base;
    for (let i = 2; definition.questions[key]; i += 1) key = `${base}_${i}`;
    const question: FlowQuestion = {
      key,
      trait: `custom.${key}`,
      type: 'single_select',
      copy: { label: 'New question' },
      options: [{ value: 'yes', label: 'Yes' }],
      required: true,
      locked: false,
    };
    onChange({
      ...definition,
      questions: { ...definition.questions, [key]: question },
      sections: definition.sections.map((s, i) => (i === sectionIndex ? { ...s, questions: [...s.questions, key] } : s)),
    });
    onSelect(key);
  };
  const addSection = () => {
    const title = newTitle.trim();
    if (!title) return;
    const key = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'section';
    if (definition.sections.some((s) => s.key === key)) return;
    onChange({ ...definition, sections: [...definition.sections, { key, title, questions: [], gates: [], locked: false }] });
    setNewTitle('');
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {definition.sections.map((section, si) => (
        <div key={section.key}>
          <div className="flex items-center gap-2">
            <p className="mono-label flex-1 text-ink">{section.title}</p>
            {section.locked ? <Badge tone="pending">locked</Badge> : null}
            <button type="button" aria-label={`Move ${section.title} up`} className="text-muted hover:text-ink" onClick={() => moveSection(si, -1)}>
              ↑
            </button>
            <button type="button" aria-label={`Move ${section.title} down`} className="text-muted hover:text-ink" onClick={() => moveSection(si, 1)}>
              ↓
            </button>
          </div>
          {section.showIf ? (
            <div className="mt-2">
              <ConditionBuilder
                definition={definition}
                value={section.showIf}
                onChange={(showIf) =>
                  onChange({ ...definition, sections: definition.sections.map((s, i) => (i === si ? { ...s, showIf } : s)) })
                }
                label="Section shows when"
              />
            </div>
          ) : null}
          <ul className="mt-2 flex flex-col">
            {section.questions.map((qKey, qi) => (
              <li key={qKey} className="flex items-center gap-2 border-b border-line py-1.5">
                <button
                  type="button"
                  onClick={() => onSelect(qKey)}
                  className={cn('flex-1 truncate text-left text-sm', selected === qKey ? 'text-ink' : 'text-muted hover:text-ink')}
                >
                  {definition.questions[qKey]?.copy.label ?? qKey}
                </button>
                <button type="button" aria-label={`Move ${qKey} up`} className="text-muted hover:text-ink" onClick={() => moveQuestion(si, qi, -1)}>
                  ↑
                </button>
                <button type="button" aria-label={`Move ${qKey} down`} className="text-muted hover:text-ink" onClick={() => moveQuestion(si, qi, 1)}>
                  ↓
                </button>
              </li>
            ))}
          </ul>
          {!section.locked ? (
            <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => addQuestion(si)}>
              Add a question +
            </Button>
          ) : null}
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-2">
          <Input value={newTitle} placeholder="Section title" onChange={(e) => setNewTitle(e.target.value)} className="h-9 px-3 text-sm" />
          <Button type="button" size="sm" onClick={addSection}>
            Add
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
          Add a section +
        </Button>
      )}
    </div>
  );
}
