'use client';

import { useState, type FormEvent } from 'react';
import { useJoinWaitlist } from '@joice/api-client';
import { joinWaitlistSchema } from '@joice/core/schemas';
import { Button, Input } from '@joice/ui';
import { useWaitlistStore } from '@/lib/store';

export function WaitlistForm({ referredBy }: { referredBy: string | null }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setEntry = useWaitlistStore((s) => s.setEntry);
  const join = useJoinWaitlist();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = joinWaitlistSchema.safeParse({ email, ref: referredBy ?? undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email');
      return;
    }

    try {
      const entry = await join.mutateAsync(parsed.data);
      setEntry(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
          aria-invalid={Boolean(error)}
          disabled={join.isPending}
          className="sm:flex-1"
        />
        <Button
          type="submit"
          size="lg"
          disabled={join.isPending}
          className="sm:w-auto w-full"
        >
          {join.isPending ? 'Joining…' : 'Join waitlist'}
        </Button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
