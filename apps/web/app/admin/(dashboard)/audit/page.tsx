'use client';

import { Fragment, useState } from 'react';
import { Button } from '@joice/ui';
import { useAuditLogs } from '@joice/api-client';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Panel,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@/components/admin/ui';

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const query = useAuditLogs({ page, limit: 25 });

  return (
    <>
      <PageHeader eyebrow="Platform" title="Audit log" />

      <Panel>
        {query.isError ? (
          <ErrorState error={query.error} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState>No admin actions recorded yet.</EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {query.isPending ? <TableSkeleton cols={5} /> : null}
                {query.data?.items.map((log) => {
                  const expanded = expandedId === log.id;
                  const hasDetail = log.before != null || log.after != null;
                  return (
                    <Fragment key={log.id}>
                      <tr>
                        <Td className="whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </Td>
                        <Td>{log.actorEmail ?? log.actorClerkUserId}</Td>
                        <Td className="text-xs">{log.action}</Td>
                        <Td className="text-xs">
                          {log.entityType}
                          {log.entityId ? ` · ${log.entityId}` : ''}
                        </Td>
                        <Td className="text-right">
                          {hasDetail ? (
                            <Button
                              variant="ghost"
                              onClick={() => setExpandedId(expanded ? null : log.id)}
                            >
                              {expanded ? 'Hide' : 'Details'}
                            </Button>
                          ) : null}
                        </Td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <Td colSpan={5} className="bg-canvas/60">
                            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
                              <div>
                                <p className="mono-label mb-1 text-muted">Before</p>
                                <pre className="overflow-x-auto rounded-xl bg-ink/5 p-3 font-code text-xs">
                                  {JSON.stringify(log.before ?? null, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="mono-label mb-1 text-muted">After</p>
                                <pre className="overflow-x-auto rounded-xl bg-ink/5 p-3 font-code text-xs">
                                  {JSON.stringify(log.after ?? null, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </Td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
            {query.data ? (
              <Pagination
                page={page}
                limit={query.data.limit}
                total={query.data.total}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </Panel>
    </>
  );
}
