'use client';

import { Fragment, useState } from 'react';
import { Button } from '@joice/ui';
import { useAuditLogs } from '@joice/api-client';
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Table,
  Td,
  Th,
} from '@/components/admin/ui';

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const query = useAuditLogs({ page, limit: 25 });

  return (
    <>
      <PageHeader title="Audit log" />

      <Card>
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
                        <Td className="font-mono text-xs">{log.action}</Td>
                        <Td className="font-mono text-xs">
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
                          <Td colSpan={5} className="bg-white/40">
                            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-semibold text-muted uppercase">
                                  Before
                                </p>
                                <pre className="overflow-x-auto rounded-card bg-ink/5 p-3 font-mono text-xs">
                                  {JSON.stringify(log.before ?? null, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-semibold text-muted uppercase">
                                  After
                                </p>
                                <pre className="overflow-x-auto rounded-card bg-ink/5 p-3 font-mono text-xs">
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
      </Card>
    </>
  );
}
