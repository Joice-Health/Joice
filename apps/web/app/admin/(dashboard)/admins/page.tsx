'use client';

import { useAuth } from '@clerk/nextjs';
import { Button } from '@joice/ui';
import { useAdmins, useSetAdminRole } from '@joice/api-client';
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Table,
  TableSkeleton,
  Td,
  Th,
} from '@/components/admin/ui';
import { useToast } from '@/components/admin/toast';

/**
 * Admin accounts live in Clerk (invite people there); this page grants or
 * revokes the admin role on existing Clerk users.
 */
export default function AdminAdminsPage() {
  const { userId } = useAuth();
  const query = useAdmins();
  const setRole = useSetAdminRole();
  const toast = useToast();

  function changeRole(clerkUserId: string, email: string | null, makeAdmin: boolean) {
    setRole.mutate(
      { clerkUserId, role: makeAdmin ? 'admin' : null },
      {
        onSuccess: () =>
          toast(`${email ?? 'User'} ${makeAdmin ? 'is now an admin.' : 'is no longer an admin.'}`),
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Role change failed.', {
            tone: 'danger',
          }),
      },
    );
  }

  return (
    <>
      <PageHeader eyebrow="People" title="Admins" />

      <Panel>
        <p className="mb-4 text-sm text-muted">
          People sign in with Clerk; granting the admin role here unlocks this console for them.
          Invite new people from the Clerk dashboard first.
        </p>

        {query.isError ? (
          <ErrorState error={query.error} />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState>No Clerk users found.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Last sign-in</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {query.isPending ? (
                <TableSkeleton cols={5} />
              ) : (
                query.data?.items.map((user) => {
                  const isSelf = user.clerkUserId === userId;
                  const isAdmin = user.role === 'admin';
                  return (
                    <tr key={user.clerkUserId}>
                      <Td>
                        {user.email ?? '·'}
                        {isSelf ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
                      </Td>
                      <Td>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '·'}</Td>
                      <Td>
                        {isAdmin ? <Badge tone="admin">admin</Badge> : <Badge tone="off">member</Badge>}
                      </Td>
                      <Td>
                        {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : 'Never'}
                      </Td>
                      <Td className="text-right">
                        <Button
                          variant="outline"
                          disabled={setRole.isPending || (isSelf && isAdmin)}
                          title={isSelf && isAdmin ? 'You cannot revoke your own access' : undefined}
                          onClick={() => changeRole(user.clerkUserId, user.email, !isAdmin)}
                        >
                          {isAdmin ? 'Revoke admin' : 'Make admin'}
                        </Button>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
