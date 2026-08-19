import { BrandMark } from '@/components/ui/brand-mark';
import { Button, Input } from '@joice/ui';

export const metadata = { robots: { index: false, follow: false } };

export default async function TeamLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 py-10">
      <div className="panel w-full rounded-card p-8 animate-fade-up">
        <BrandMark />
        <h1 className="mt-6 text-xl text-ink">Team preview</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Enter the team password to view the site in progress.
        </p>

        <form method="POST" action="/team/login" className="mt-6 flex flex-col gap-3">
          <Input
            type="password"
            name="password"
            placeholder="Password"
            aria-label="Team password"
            autoFocus
            required
          />
          <Button type="submit" variant="solid" size="lg" className="w-full">
            Enter
          </Button>
        </form>

        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            That password isn&apos;t right.
          </p>
        ) : null}
      </div>
    </main>
  );
}
