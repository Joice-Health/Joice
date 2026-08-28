import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FLAG_KEYS } from '@joice/core/schemas';
import { flagEnabled } from '@/lib/flags';
import { Bracket } from '@joice/ui';
import { AmbientBackground } from '@/components/ui/ambient-background';
import { BrandMark } from '@/components/ui/brand-mark';

export const metadata: Metadata = {
  title: 'Joice',
  description: 'Something special is coming.',
};

// The flag is read per request; never let the build freeze one answer in.
export const dynamic = 'force-dynamic';

/**
 * What the public sees while the `waitlist` flag is off. Deliberately bare:
 * one line over the same water the waitlist has, no form, no nav. When the
 * flag comes back on this route hands visitors straight to /waitlist so a
 * shared link never dead-ends here.
 */
export default async function ComingSoonPage() {
  if (await flagEnabled(FLAG_KEYS.waitlist)) redirect('/waitlist');

  return (
    <>
      <AmbientBackground />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center animate-fade-up">
        <BrandMark />
        <p className="mt-8 font-mono text-sm tracking-mono text-ink">
          <Bracket>something special is coming</Bracket>
        </p>
      </main>
    </>
  );
}
