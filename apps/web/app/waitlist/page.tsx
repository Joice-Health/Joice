import { WaitlistExperience } from '@/components/waitlist-experience';

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center px-6 py-10">
      <WaitlistExperience referredBy={ref ?? null} />
    </main>
  );
}
