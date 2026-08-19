import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { FLAG_KEYS } from '@joice/core/schemas';
import { flagEnabled } from '@/lib/flags';
import { BrandMark } from '@/components/ui/brand-mark';

export const metadata: Metadata = {
  title: 'Joice',
  description: 'Something special is coming.',
};

// The flag is read per request; never let the build freeze one answer in.
export const dynamic = 'force-dynamic';

/**
 * What the public sees while the `waitlist` flag is off. Deliberately bare:
 * one line, no form, no nav. When the flag comes back on this route hands
 * visitors straight to /waitlist so a shared link never dead-ends here.
 */
export default async function ComingSoonPage() {
  if (await flagEnabled(FLAG_KEYS.waitlist)) redirect('/waitlist');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center animate-fade-up">
      <BrandMark />
      <p className="mt-8 text-balance text-2xl leading-snug text-ink sm:text-3xl">
        Something special is coming.
      </p>
    </main>
  );
}
