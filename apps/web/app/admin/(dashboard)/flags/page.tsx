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
  Panel,
  EmptyState,
  ErrorState,
  PageHeader,
  Table,
  Td,
  Th,
  Toggle,
} from '@/components/admin/ui';

export default function AdminFlagsPage() {
  const query = useFeatureFlags();
  const createFlag = useCreateFlag();
  const updateFlag = useUpdateFlag();
  const deleteFlag = useDeleteFlag();

  const [showForm, setShowForm] = useState(false);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');

  function onCreate(e: FormEvent) {
    e.preventDefault();
    createFlag.mutate(
      { key: key.trim(), description: description.trim() || undefined, enabled: false },
      {
        onSuccess: () => {
          setKey('');
          setDescription('');
          setShowForm(false);
        },
      },
    );
  }

  return (
    <>
      <PageHeader title="Feature flags">
        <Button variant="solid" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New flag'}
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
              className="h-11 max-w-xs font-mono text-sm"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              aria-label="Flag description"
              className="h-11 max-w-sm text-sm"
            />
            <Button type="submit" variant="solid" disabled={createFlag.isPending}>
              {createFlag.isPending ? 'Creating…' : 'Create flag'}
            </Button>
          </form>
          {createFlag.isError ? <ErrorState error={createFlag.error} /> : null}
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
          <EmptyState>No flags yet. Create one to start gating features.</EmptyState>
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
              {query.data?.items.map((flag) => (
                <tr key={flag.id}>
                  <Td>
                    <Toggle
                      checked={flag.enabled}
                      disabled={updateFlag.isPending}
                      label={`Toggle ${flag.key}`}
                      onChange={(enabled) => updateFlag.mutate({ id: flag.id, enabled })}
                    />
                  </Td>
                  <Td className="font-mono text-xs">{flag.key}</Td>
                  <Td className="text-muted">{flag.description || '—'}</Td>
                  <Td>{new Date(flag.updatedAt).toLocaleString()}</Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      disabled={deleteFlag.isPending}
                      onClick={() => {
                        if (confirm(`Delete flag "${flag.key}"? Code reading it will see it as off.`)) {
                          deleteFlag.mutate(flag.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {updateFlag.isError ? <ErrorState error={updateFlag.error} /> : null}
        {deleteFlag.isError ? <ErrorState error={deleteFlag.error} /> : null}
      </Panel>
    </>
  );
}
