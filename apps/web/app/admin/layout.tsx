import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata = { robots: { index: false, follow: false } };

/**
 * Clerk is scoped to the admin tree only — the public marketing/waitlist pages
 * never load it. Route protection lives in middleware.ts; the (dashboard)
 * layout re-checks the session server-side as defense in depth.
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider signInUrl="/admin/sign-in" afterSignOutUrl="/admin/sign-in">
      {children}
    </ClerkProvider>
  );
}
