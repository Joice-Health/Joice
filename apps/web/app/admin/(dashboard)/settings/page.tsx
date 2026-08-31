'use client';

import { useState, type FormEvent } from 'react';
import { Button, Input } from '@joice/ui';
import { useDeleteSetting, useSettings, useUpsertSetting } from '@joice/api-client';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@/components/admin/ui';
import { AdminTextarea } from '@/components/admin/fields';
import { useConfirm } from '@/components/admin/confirm';
import { useToast } from '@/components/admin/toast';

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
  const toast = useToast();
  const confirm = useConfirm();

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
          toast(`Setting ${key.trim()} saved.`);
          setKey('');
          setRawValue('');
          setDescription('');
        },
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Save failed.', { tone: 'danger' }),
      },
    );
  }

  async function onDelete(settingKey: string) {
    const ok = await confirm({
      title: `Delete setting ${settingKey}?`,
      confirmLabel: 'Delete +',
      danger: true,
    });
    if (!ok) return;
    remove.mutate(settingKey, {
      onSuccess: () => toast(`Setting ${settingKey} deleted.`),
      onError: (error) =>
        toast(error instanceof Error ? error.message : 'Delete failed.', { tone: 'danger' }),
    });
  }

  return (
    <>
      <PageHeader eyebrow="Platform" title="Settings" />

      <Panel className="mb-6">
        <PanelHeader>Add or update a setting</PanelHeader>
        <form onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="setting_key"
              aria-label="Setting key"
              pattern="[a-z0-9_.\-]+"
              title="Lowercase letters, digits, _ . - only"
              required
              className="h-10 max-w-xs bg-canvas font-code text-sm"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              aria-label="Setting description"
              className="h-10 max-w-sm bg-canvas text-sm"
            />
          </div>
          <AdminTextarea
            value={rawValue}
            onChange={(e) => setRawValue(e.target.value)}
            placeholder='Value as JSON, e.g. true, 42, "text", {"a": 1}'
            aria-label="Setting value (JSON)"
            required
            rows={3}
            className="max-w-2xl font-code"
          />
          {parseError ? (
            <p className="text-sm text-danger" role="alert">
              Value must be valid JSON (wrap plain text in quotes).
            </p>
          ) : null}
          <div>
            <Button type="submit" variant="solid" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save setting +'}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel>
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
              {query.isPending ? (
                <TableSkeleton cols={5} />
              ) : (
                query.data?.items.map((setting) => (
                  <tr key={setting.id}>
                    <Td className="text-xs">{setting.key}</Td>
                    <Td>
                      <code className="block max-w-md truncate font-code text-xs">
                        {JSON.stringify(setting.value)}
                      </code>
                    </Td>
                    <Td className="text-muted">{setting.description || '·'}</Td>
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
                          onClick={() => onDelete(setting.key)}
                        >
                          Delete
                        </Button>
                      </div>
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
