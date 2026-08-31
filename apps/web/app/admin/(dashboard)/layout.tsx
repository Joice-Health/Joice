import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { AdminShell } from '@/components/admin/shell';
import { AdminProviders } from '../providers';

/**
 * Shell for all admin pages. Middleware already enforces the admin role; this
 * server-side check is defense in depth (e.g. if the matcher ever regresses).
 */
export default async function AdminDashboardLayout({ children }: { children: ReactNode }) {
  const { userId, sessionClaims } = await auth();
  if (!userId || sessionClaims?.metadata?.role !== 'admin') {
    redirect('/admin/sign-in');
  }

  return (
    <AdminProviders>
      <div className="flex min-h-dvh">
        <AdminShell user={<UserButton />}>
          <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
        </AdminShell>
      </div>
    </AdminProviders>
  );
}
