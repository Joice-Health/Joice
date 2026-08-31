'use client';

import { useState } from 'react';
import { useServiceAreaRequests } from '@joice/api-client';
import { US_STATES, usStateName } from '@joice/utils';
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
import { AdminSelect } from '@/components/admin/fields';

const CRUMBS = [{ href: '/admin/onboarding', label: 'Onboarding' }];

/**
 * "Tell me when my state opens." Its own list, deliberately not the waitlist:
 * these people asked about serviceability, not a place in line. The state
 * counts here are the demand map for which pharmacy coverage to sign next.
 */
export default function AdminOnboardingRequestsPage() {
  const [page, setPage] = useState(1);
  const [stateCode, setStateCode] = useState('');
  const query = useServiceAreaRequests({
    page,
    limit: 25,
    ...(stateCode ? { stateCode: stateCode as never } : {}),
  });

  if (query.error) return <ErrorState error={query.error} />;
  const data = query.data;

  return (
    <div>
      <PageHeader breadcrumbs={CRUMBS} title="Notify-me requests">
        <AdminSelect
          size="sm"
          aria-label="Filter by state"
          value={stateCode}
          onChange={(e) => {
            setStateCode(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All states</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </AdminSelect>
      </PageHeader>

      <Panel>
        {data && data.items.length === 0 ? (
          <EmptyState>No requests yet.</EmptyState>
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>State</Th>
                  <Th>Asked</Th>
                  <Th>Synced</Th>
                </tr>
              </thead>
              <tbody>
                {query.isPending ? (
                  <TableSkeleton cols={5} />
                ) : (
                  data?.items.map((row) => (
                    <tr key={row.id}>
                      <Td>{row.email}</Td>
                      <Td>{row.firstName ?? '·'}</Td>
                      <Td>{usStateName(row.stateCode)}</Td>
                      <Td>{new Date(row.createdAt).toLocaleDateString()}</Td>
                      <Td>{row.marketingSyncedAt ? 'yes' : 'no'}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
            {data ? (
              <Pagination page={data.page} total={data.total} limit={data.limit} onPageChange={setPage} />
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}
