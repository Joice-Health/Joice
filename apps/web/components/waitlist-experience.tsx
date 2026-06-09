'use client';

import { useEffect, useState } from 'react';
import { useWaitlistByCode } from '@joice/api-client';
import type { WaitlistEntryView } from '@joice/core';
import { useWaitlistStore } from '@/lib/store';
import { BrandMark } from './brand-mark';
import { WaitlistForm } from './waitlist-form';
import { WaitlistCounter } from './waitlist-counter';
import { ShareCard } from './share-card';
import { ShareActions } from './share-actions';

export function WaitlistExperience({ referredBy }: { referredBy: string | null }) {
  const entry = useWaitlistStore((s) => s.entry);
  const [mounted, setMounted] = useState(false);

  // The persisted store rehydrates from localStorage on the client only. We render
  // the join view on the server AND on the first client render (treating the user
  // as new), then swap to their saved card after mount — so the hero is still SSR'd
  // and there's no hydration mismatch. Returning users see a brief join-view flash.
  useEffect(() => setMounted(true), []);
  const showCard = mounted && entry;

  return (
    <>
      <header className="mb-12 flex w-full items-center justify-between">
        <BrandMark />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Private beta
        </span>
      </header>

      {showCard ? <SuccessView entry={entry} /> : <JoinView referredBy={referredBy} />}
    </>
  );
}

function JoinView({ referredBy }: { referredBy: string | null }) {
  return (
    <section className="flex w-full flex-1 flex-col justify-center">
      {referredBy ? (
        <span className="mb-6 inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          ✦ A friend invited you
        </span>
      ) : null}

      <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
        The future of peptide medicine.
      </h1>
      <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted">
        AI-guided peptides and supplements, backed by real clinical governance and pharmacy
        fulfillment. Join the waitlist for first access.
      </p>

      <div className="mt-8">
        <WaitlistForm referredBy={referredBy} />
      </div>

      <div className="mt-5">
        <WaitlistCounter />
      </div>
    </section>
  );
}

function SuccessView({ entry }: { entry: WaitlistEntryView }) {
  // Refresh position/referral count from the server on mount; fall back to stored.
  const { data } = useWaitlistByCode(entry.referralCode, { initialData: entry });
  const live = data ?? entry;
  const setEntry = useWaitlistStore((s) => s.setEntry);

  // Keep the persisted card in sync with the latest server numbers.
  useEffect(() => {
    if (data) setEntry(data);
  }, [data, setEntry]);

  return (
    <section className="flex w-full flex-1 flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          You&apos;re on the list.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Share with <span className="font-semibold text-ink">2 friends</span> to move up the
          line.{' '}
          {live.referralCount > 0 ? (
            <span className="text-ink">
              {live.referralCount} {live.referralCount === 1 ? 'friend has' : 'friends have'}{' '}
              joined through you.
            </span>
          ) : null}
        </p>
      </div>

      <ShareCard entry={live} />

      <div className="mt-8">
        <ShareActions referralCode={live.referralCode} />
      </div>
    </section>
  );
}
