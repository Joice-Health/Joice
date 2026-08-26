import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { SiteNav } from '@/components/layout/site-nav';
import { SiteFooter } from '@/components/layout/site-footer';
import { CompanionPill } from '@/components/layout/companion-pill';
import { MemberProviders } from './providers';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The member tree: sign-up, sign-in and the pages a signed-in member sees
 * (/welcome). Clerk is scoped here and to /admin only, so the marketing pages
 * never load it. Same site shell as (site); the difference is the providers:
 * the api client attaches the member's session token, which is how the api
 * knows who is claiming an intake. Route protection lives in middleware.ts.
 */
export default function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/">
      <MemberProviders>
        <AnnouncementBar />
        <SiteNav />
        <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6">
          <main className="flex flex-1 flex-col">{children}</main>
          <SiteFooter />
          <CompanionPill />
        </div>
      </MemberProviders>
    </ClerkProvider>
  );
}
