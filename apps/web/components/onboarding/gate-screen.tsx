'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useSubmitNotify, type GateView } from '@joice/api-client';
import { notifyRequestSchema } from '@joice/core/schemas';
import { Button, Input } from '@joice/ui';
import { CtaLink } from '@/components/ui/cta-link';
import { track } from '@/lib/analytics';

/**
 * The three gate outcomes, none of them a dead end.
 *
 * Stop (under age): say it plainly, once; no "notify me" that pretends they
 * might qualify; nothing of theirs was kept.
 * Notify (state not open yet): keep their name and goal, take an email (the
 * companion's if they gave one, editable), promise only "we will tell you the
 * day it opens", and offer the research and the companion meanwhile.
 * Closed: the same doors minus the email.
 */
export function GateScreen({ gate, carriedEmail, onRestart }: { gate: GateView; carriedEmail?: string; onRestart: () => void }) {
  const router = useRouter();
  return (
    <section className="animate-fade-up" aria-live="polite">
      <h1 className="display text-balance text-4xl text-ink sm:text-6xl">{gate.copy.title}</h1>
      <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">{gate.copy.body}</p>

      {gate.outcome === 'notify' ? <NotifyForm gate={gate} carriedEmail={carriedEmail} /> : null}

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <CtaLink href="/explore" size="lg">
          Explore the research +
        </CtaLink>
        <Button type="button" size="lg" onClick={() => router.push('/ask')}>
          Talk to the companion +
        </Button>
        {gate.outcome !== 'stop' ? (
          <Button type="button" variant="ghost" size="lg" onClick={onRestart} className="ml-auto">
            Start over
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function NotifyForm({ gate, carriedEmail }: { gate: GateView; carriedEmail?: string }) {
  const [email, setEmail] = useState(carriedEmail ?? '');
  const [error, setError] = useState<string | null>(null);
  const notify = useSubmitNotify();

  if (gate.notifySubmitted) {
    return (
      <p className="mt-8 rounded-2xl bg-surface px-5 py-4 text-base text-ink" role="status">
        {gate.copy.done ?? 'Noted. We will let you know.'}
      </p>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = notifyRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email');
      return;
    }
    try {
      await notify.mutateAsync(parsed.data);
      track({ event: 'onboarding_notify_submitted' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
      <Input
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="Email"
        aria-label="Email address"
        aria-invalid={Boolean(error)}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={notify.isPending}
      />
      <Button type="submit" variant="solid" size="lg" disabled={notify.isPending} className="whitespace-nowrap">
        {notify.isPending ? 'Saving…' : (gate.copy.cta ?? 'Tell me when it opens +')}
      </Button>
      {error ? (
        <p className="text-sm text-red-700 sm:basis-full" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
