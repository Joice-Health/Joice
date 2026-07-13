import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { BrandMark } from '@/components/ui/brand-mark';
import { AdminNav } from '@/components/admin/nav';
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
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl gap-8 px-6 py-8">
        <aside className="flex w-52 shrink-0 flex-col gap-8">
          <Link href="/admin" aria-label="Admin home">
            <BrandMark />
          </Link>
          <AdminNav />
          <div className="mt-auto flex items-center gap-3 pb-2">
            <UserButton />
            <span className="text-xs text-muted">Signed in</span>
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </AdminProviders>
  );
}
