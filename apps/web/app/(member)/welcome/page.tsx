import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { WelcomeClaim } from '@/components/member/welcome-claim';

export const metadata: Metadata = { title: 'Welcome · Joice' };

/**
 * The first page after sign-up (and after sign-in). Middleware already
 * requires a session; this re-checks server-side as defense in depth, like
 * the admin dashboard. The client component does the work: claims this
 * browser's intake for the account (the api creates the member record on
 * that first call), claims the companion lead, and shows the profile.
 */
export default async function WelcomePage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in?redirect_url=%2Fwelcome');
  return <WelcomeClaim />;
}
