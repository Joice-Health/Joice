'use client';

import { useState } from 'react';
import {
  useAdminFlowVersion,
  useAdminFlowVersions,
  useCreateFlowVersion,
  useRollbackFlow,
} from '@joice/api-client';
import { Button } from '@joice/ui';
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  PanelSkeleton,
  Skeleton,
  Table,
  Td,
  Th,
} from '@/components/admin/ui';
import { AdminSelect } from '@/components/admin/fields';
import { useConfirm } from '@/components/admin/confirm';
import { useToast } from '@/components/admin/toast';

const CRUMBS = [{ href: '/admin/onboarding', label: 'Onboarding' }];

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
  const toast = useToast();
  const confirm = useConfirm();

  if (versions.isPending) {
    return (
      <div>
        <PageHeader breadcrumbs={CRUMBS} title="Flow versions" />
        <PanelSkeleton />
      </div>
    );
  }
  if (versions.error) return <ErrorState error={versions.error} />;
  const items = versions.data?.items ?? [];

  const onRollback = async (versionId: string, version: number) => {
    const ok = await confirm({
      title: `Roll back to v${version}?`,
      body: 'The live pointer moves; new sessions use it immediately.',
      confirmLabel: 'Roll back +',
      danger: true,
    });
    if (!ok) return;
    rollback.mutate(
      { versionId },
      {
        onSuccess: () => toast(`Rolled back to v${version}.`),
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Rollback failed.', { tone: 'danger' }),
      },
    );
  };

  return (
    <div>
      <PageHeader breadcrumbs={CRUMBS} title="Flow versions">
        <Button
          size="sm"
          disabled={createDraft.isPending || items.some((v) => v.status === 'draft')}
          onClick={() =>
            createDraft.mutate(
              {},
              {
                onSuccess: () => toast('Draft created; edit it on the Flow page.'),
                onError: (error) =>
                  toast(error instanceof Error ? error.message : 'Could not create the draft.', {
                    tone: 'danger',
                  }),
              },
            )
          }
        >
          Make a draft +
        </Button>
      </PageHeader>

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
                    <span className="text-xs text-muted">{v.logicHash?.slice(0, 8) ?? ''}</span>
                  </Td>
                  <Td>{v.publishedBy ?? v.createdBy}</Td>
                  <Td>{v.publishedAt ? new Date(v.publishedAt).toLocaleString() : ''}</Td>
                  <Td>
                    {v.status === 'archived' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={rollback.isPending}
                        onClick={() => void onRollback(v.id, v.version)}
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
        <PanelHeader>Compare two versions</PanelHeader>
        <div className="flex flex-wrap items-center gap-2">
          {[
            [diffA, setDiffA],
            [diffB, setDiffB],
          ].map(([value, set], i) => (
            <AdminSelect
              key={i}
              size="sm"
              aria-label={i === 0 ? 'From version' : 'To version'}
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
            >
              <option value="">choose…</option>
              {items.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} ({v.status})
                </option>
              ))}
            </AdminSelect>
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
  if (a.isPending || b.isPending) {
    return (
      <div className="mt-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>
    );
  }
  if (a.error || b.error || !a.data || !b.data) return <ErrorState error={a.error ?? b.error} />;
  const changed = diffPaths(a.data.definition, b.data.definition);
  return (
    <div className="mt-4">
      {changed.length === 0 ? (
        <p className="text-sm text-muted">Identical.</p>
      ) : (
        <>
          <p className="mono-label text-muted">{changed.length} changed path(s)</p>
          <ul className="mt-2 max-h-64 overflow-y-auto text-xs text-ink">
            {changed.map((path) => (
              <li key={path} className="border-b border-line/60 py-1">
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
