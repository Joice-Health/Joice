'use client';

import { useState, type FormEvent } from 'react';
import { useJoinWaitlist } from '@joice/api-client';
import { joinWaitlistSchema } from '@joice/core/schemas';
import { Button, Input } from '@joice/ui';
import { useWaitlistStore } from '@/lib/store';

export function WaitlistForm({ referredBy }: { referredBy: string | null }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setEntry = useWaitlistStore((s) => s.setEntry);
  const join = useJoinWaitlist();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = joinWaitlistSchema.safeParse({
      firstName,
      lastName,
      email,
      ref: referredBy ?? undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details and try again');
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
      <h2 className="text-lg font-semibold tracking-tight text-ink">
        Lock in your founding member rate — for life.
      </h2>

      <div className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="text"
            autoComplete="given-name"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            aria-label="First name"
            disabled={join.isPending}
          />
          <Input
            type="text"
            autoComplete="family-name"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            aria-label="Last name"
            disabled={join.isPending}
          />
        </div>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email address"
          aria-invalid={Boolean(error)}
          disabled={join.isPending}
        />
        <Button type="submit" size="lg" disabled={join.isPending} className="w-full">
          {join.isPending ? 'Joining…' : 'Join the waitlist'}
        </Button>
      </div>

      <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-wider text-muted">
        Open now, to the first to join.
      </p>

      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
