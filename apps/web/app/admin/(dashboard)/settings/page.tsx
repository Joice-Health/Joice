'use client';

import { useState, type FormEvent } from 'react';
import { Button, Input } from '@joice/ui';
import { useDeleteSetting, useSettings, useUpsertSetting } from '@joice/api-client';
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/admin/ui';

/** Values are arbitrary JSON: `true`, `42`, `"copy text"`, `{"a":1}`, … */
function parseJsonValue(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export default function AdminSettingsPage() {
  const query = useSettings();
  const upsert = useUpsertSetting();
  const remove = useDeleteSetting();

  const [key, setKey] = useState('');
  const [rawValue, setRawValue] = useState('');
  const [description, setDescription] = useState('');
  const [parseError, setParseError] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseJsonValue(rawValue);
    if (!parsed.ok) {
      setParseError(true);
      return;
    }
    setParseError(false);
    upsert.mutate(
      { key: key.trim(), value: parsed.value, description: description.trim() || undefined },
      {
        onSuccess: () => {
          setKey('');
          setRawValue('');
          setDescription('');
        },
      },
    );
  }

  return (
    <>
      <PageHeader title="Settings" />

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-ink">Add or update a setting</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="setting_key"
              aria-label="Setting key"
              pattern="[a-z0-9_.\-]+"
              title="Lowercase letters, digits, _ . - only"
              required
              className="h-11 max-w-xs font-mono text-sm"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              aria-label="Setting description"
              className="h-11 max-w-sm text-sm"
            />
          </div>
          <textarea
            value={rawValue}
            onChange={(e) => setRawValue(e.target.value)}
            placeholder='Value as JSON — e.g. true, 42, "text", {"a": 1}'
            aria-label="Setting value (JSON)"
            required
            rows={3}
            className="glass w-full max-w-2xl rounded-card px-4 py-3 font-mono text-sm text-ink outline-none placeholder:text-muted/60 focus-visible:ring-2 focus-visible:ring-brand-300/50"
          />
          {parseError ? (
            <p className="text-sm text-red-600" role="alert">
              Value must be valid JSON (wrap plain text in quotes).
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save setting'}
            </Button>
          </div>
        </form>
        {upsert.isError ? <ErrorState error={upsert.error} /> : null}
      </Card>

      <Card>
        {query.isError ? (
          <ErrorState error={query.error} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState>No settings yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Key</Th>
                <Th>Value</Th>
                <Th>Description</Th>
                <Th>Updated</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((setting) => (
                <tr key={setting.id}>
                  <Td className="font-mono text-xs">{setting.key}</Td>
                  <Td>
                    <code className="block max-w-md truncate font-mono text-xs">
                      {JSON.stringify(setting.value)}
                    </code>
                  </Td>
                  <Td className="text-muted">{setting.description || '—'}</Td>
                  <Td>{new Date(setting.updatedAt).toLocaleString()}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setKey(setting.key);
                          setRawValue(JSON.stringify(setting.value, null, 2));
                          setDescription(setting.description ?? '');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm(`Delete setting "${setting.key}"?`)) {
                            remove.mutate(setting.key);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {remove.isError ? <ErrorState error={remove.error} /> : null}
      </Card>
    </>
  );
}
