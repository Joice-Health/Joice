import type { ReactNode } from 'react';
import { SiteNav } from '@/components/layout/site-nav';
import { SiteFooter } from '@/components/layout/site-footer';
import { CompanionPill } from '@/components/layout/companion-pill';

/**
 * Shell for all main-site pages (the team-gated site that goes public at
 * launch). Pages in this group only provide their sections — nav, footer, and
 * the Companion pill come from here.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4 sm:px-6">
      <SiteNav />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      <CompanionPill />
    </div>
  );
}
