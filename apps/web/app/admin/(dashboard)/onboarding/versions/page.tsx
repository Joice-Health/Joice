'use client';

import { useState } from 'react';
import {
  useAdminFlowVersion,
  useAdminFlowVersions,
  useCreateFlowVersion,
  useRollbackFlow,
} from '@joice/api-client';
import { Button } from '@joice/ui';
import { Badge, Panel, EmptyState, ErrorState, PageHeader, Table, Td, Th } from '@/components/admin/ui';

/**
 * Every version of the intake flow. Publishing lives in the editor (it wants
 * the report next to the fix); here is the history: who made what when, the
 * pointer, rollback (a pointer move to an earlier published or archived
 * version), and a JSON diff viewer between any two.
 */
export default function AdminOnboardingVersionsPage() {
  const versions = useAdminFlowVersions();
  const createDraft = useCreateFlowVersion();
  const rollback = useRollbackFlow();
  const [diffA, setDiffA] = useState<string>('');
  const [diffB, setDiffB] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);

  if (versions.isPending) return <p className="mono-label text-muted">Loading…</p>;
  if (versions.error) return <ErrorState error={versions.error} />;
  const items = versions.data?.items ?? [];

  return (
    <div>
      <PageHeader title="Flow versions">
        <Button
          size="sm"
          disabled={createDraft.isPending || items.some((v) => v.status === 'draft')}
          onClick={() => createDraft.mutate({}, { onSuccess: () => setMessage('Draft created; edit it on the Flow page.') })}
        >
          Make a draft +
        </Button>
      </PageHeader>
      {message ? <p className="mono-label mb-4 text-muted">{message}</p> : null}

      <Panel>
        {items.length === 0 ? (
          <EmptyState>No versions yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Status</Th>
                <Th>Notes</Th>
                <Th>Logic</Th>
                <Th>By</Th>
                <Th>Published</Th>
                <Th>{''}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <Td>v{v.version}</Td>
                  <Td>
                    <Badge tone={v.status === 'published' ? 'active' : v.status === 'draft' ? 'pending' : 'invited'}>
                      {v.status}
                    </Badge>
                  </Td>
                  <Td className="max-w-56 truncate">{v.notes ?? ''}</Td>
                  <Td>
                    <span className="font-mono text-xs text-muted">{v.logicHash?.slice(0, 8) ?? ''}</span>
                  </Td>
                  <Td>{v.publishedBy ?? v.createdBy}</Td>
                  <Td>{v.publishedAt ? new Date(v.publishedAt).toLocaleString() : ''}</Td>
                  <Td>
                    {v.status === 'archived' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={rollback.isPending}
                        onClick={() => {
                          if (!window.confirm(`Point the live flow back at v${v.version}? New sessions use it immediately.`)) return;
                          rollback.mutate({ versionId: v.id }, { onSuccess: () => setMessage(`Rolled back to v${v.version}.`) });
                        }}
                      >
                        Roll back
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel className="mt-6">
        <p className="mono-label text-muted">Compare two versions</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {[
            [diffA, setDiffA],
            [diffB, setDiffB],
          ].map(([value, set], i) => (
            <select
              key={i}
              aria-label={i === 0 ? 'From version' : 'To version'}
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
              className="h-9 rounded-full bg-canvas px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
            >
              <option value="">choose…</option>
              {items.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} ({v.status})
                </option>
              ))}
            </select>
          ))}
        </div>
        {diffA && diffB ? <VersionDiff idA={diffA} idB={diffB} /> : null}
      </Panel>
    </div>
  );
}

function VersionDiff({ idA, idB }: { idA: string; idB: string }) {
  const a = useAdminFlowVersion(idA);
  const b = useAdminFlowVersion(idB);
  if (a.isPending || b.isPending) return <p className="mono-label mt-3 text-muted">Loading…</p>;
  if (a.error || b.error || !a.data || !b.data) return <ErrorState error={a.error ?? b.error} />;
  const changed = diffPaths(a.data.definition, b.data.definition);
  return (
    <div className="mt-4">
      {changed.length === 0 ? (
        <p className="text-sm text-muted">Identical.</p>
      ) : (
        <>
          <p className="mono-label text-muted">{changed.length} changed path(s)</p>
          <ul className="mt-2 max-h-64 overflow-y-auto font-mono text-xs text-ink">
            {changed.map((path) => (
              <li key={path} className="border-b border-line py-1">
                {path}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Leaf paths whose values differ, either direction. */
function diffPaths(a: unknown, b: unknown, prefix = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => diffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.flatMap((v, i) => diffPaths(v, b[i], `${prefix}[${i}]`));
  }
  return [prefix || '(root)'];
}
