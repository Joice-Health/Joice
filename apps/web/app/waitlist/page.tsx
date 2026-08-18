import { redirect } from 'next/navigation';
import { FLAG_KEYS } from '@joice/core/schemas';
import { flagEnabled } from '@/lib/flags';
import { AmbientBackground } from '@/components/ui/ambient-background';
import { WaitlistExperience } from '@/components/waitlist/waitlist-experience';

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; reset?: string }>;
}) {
  // The whole waitlist is a feature flag (toggled in /admin/flags). While it
  // is off there is nothing here to render, only the door: /coming-soon.
  if (!(await flagEnabled(FLAG_KEYS.waitlist))) redirect('/coming-soon');

  const { ref, reset } = await searchParams;

  return (
    <>
      <AmbientBackground />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center px-6 py-10">
        <WaitlistExperience referredBy={ref ?? null} forceReset={reset !== undefined} />
      </main>
    </>
  );
}
