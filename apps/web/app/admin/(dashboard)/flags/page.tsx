'use client';

import { useState, type FormEvent } from 'react';
import { Button, Input } from '@joice/ui';
import {
  useCreateFlag,
  useDeleteFlag,
  useFeatureFlags,
  useUpdateFlag,
} from '@joice/api-client';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Table,
  TableSkeleton,
  Td,
  Th,
  Toggle,
} from '@/components/admin/ui';
import { useConfirm } from '@/components/admin/confirm';
import { useToast } from '@/components/admin/toast';

export default function AdminFlagsPage() {
  const query = useFeatureFlags();
  const createFlag = useCreateFlag();
  const updateFlag = useUpdateFlag();
  const deleteFlag = useDeleteFlag();
  const toast = useToast();
  const confirm = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');

  function onCreate(e: FormEvent) {
    e.preventDefault();
    createFlag.mutate(
      { key: key.trim(), description: description.trim() || undefined, enabled: false },
      {
        onSuccess: () => {
          toast(`Flag ${key.trim()} created, off.`);
          setKey('');
          setDescription('');
          setShowForm(false);
        },
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Create failed.', { tone: 'danger' }),
      },
    );
  }

  function setFlag(id: string, flagKey: string, enabled: boolean) {
    updateFlag.mutate(
      { id, enabled },
      {
        onSuccess: () => toast(`${flagKey} is now ${enabled ? 'on' : 'off'}.`),
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Toggle failed.', { tone: 'danger' }),
      },
    );
  }

  async function onDelete(id: string, flagKey: string) {
    const ok = await confirm({
      title: `Delete flag ${flagKey}?`,
      body: 'Code reading it will see it as off.',
      confirmLabel: 'Delete +',
      danger: true,
    });
    if (!ok) return;
    deleteFlag.mutate(id, {
      onSuccess: () => toast(`Flag ${flagKey} deleted.`),
      onError: (error) =>
        toast(error instanceof Error ? error.message : 'Delete failed.', { tone: 'danger' }),
    });
  }

  return (
    <>
      <PageHeader eyebrow="Platform" title="Feature flags">
        <Button variant="outline" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New flag +'}
        </Button>
      </PageHeader>

      {showForm ? (
        <Panel className="mb-6">
          <form onSubmit={onCreate} className="flex flex-wrap items-center gap-3">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="flag_key (immutable)"
              aria-label="Flag key"
              pattern="[a-z0-9_.\-]+"
              title="Lowercase letters, digits, _ . - only"
              required
              className="h-10 max-w-xs bg-canvas font-mono text-sm"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              aria-label="Flag description"
              className="h-10 max-w-sm bg-canvas text-sm"
            />
            <Button type="submit" variant="solid" disabled={createFlag.isPending}>
              {createFlag.isPending ? 'Creating…' : 'Create flag +'}
            </Button>
          </form>
        </Panel>
      ) : null}

      <Panel>
        <p className="mb-4 text-sm text-muted">
          Changes go live within about a minute: the API caches flag reads for ~30s and
          server-rendered pages re-read them on the same cadence.
        </p>

        {query.isError ? (
          <ErrorState error={query.error} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState
            action={
              <Button variant="outline" onClick={() => setShowForm(true)}>
                New flag +
              </Button>
            }
          >
            No flags yet. Create one to start gating features.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Enabled</Th>
                <Th>Key</Th>
                <Th>Description</Th>
                <Th>Updated</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {query.isPending ? (
                <TableSkeleton cols={5} />
              ) : (
                query.data?.items.map((flag) => (
                  <tr key={flag.id}>
                    <Td>
                      <Toggle
                        checked={flag.enabled}
                        disabled={updateFlag.isPending}
                        label={`Toggle ${flag.key}`}
                        onChange={(enabled) => setFlag(flag.id, flag.key, enabled)}
                      />
                    </Td>
                    <Td className="text-xs">{flag.key}</Td>
                    <Td className="text-muted">{flag.description || '·'}</Td>
                    <Td>{new Date(flag.updatedAt).toLocaleString()}</Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        disabled={deleteFlag.isPending}
                        onClick={() => onDelete(flag.id, flag.key)}
                      >
                        Delete
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
