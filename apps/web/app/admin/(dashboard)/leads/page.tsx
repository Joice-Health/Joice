'use client';

import { useState } from 'react';
import { useAdminLeads } from '@joice/api-client';
import { CARE_AREAS } from '@joice/brain/schemas';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Table,
  Td,
  Th,
} from '@/components/admin/ui';

/** slug → human label for the goal column. */
const GOAL_LABEL: Record<string, string> = {
  ...Object.fromEntries(CARE_AREAS.map((a) => [a.slug, a.label])),
  'not-sure': 'Not sure yet',
};

export default function AdminLeadsPage() {
  const [page, setPage] = useState(1);
  const query = useAdminLeads({ page, limit: 25 });

  return (
    <>
      <PageHeader title="Leads" />

      <Card>
        {query.isError ? (
          <ErrorState error={query.error} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState>
            No leads yet — captured profiles appear here as visitors talk to the companion.
          </EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Goal</Th>
                  <Th>Status</Th>
                  <Th>Started journey</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {query.data?.items.map((lead) => (
                  <tr key={lead.id}>
                    <Td>{lead.name ?? '—'}</Td>
                    <Td>{lead.email ?? '—'}</Td>
                    <Td>{lead.goal ? (GOAL_LABEL[lead.goal] ?? lead.goal) : '—'}</Td>
                    <Td>
                      <Badge tone={lead.status}>{lead.status}</Badge>
                    </Td>
                    <Td>{lead.readyForOnboarding ? 'Yes' : '—'}</Td>
                    <Td>{new Date(lead.updatedAt).toLocaleDateString()}</Td>
                  </tr>
                ))}
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
