'use client';

import { useEffect, useState } from 'react';
import { useWaitlistByCode } from '@joice/api-client';
import type { WaitlistEntryView } from '@joice/core';
import { useWaitlistStore } from '@/lib/store';
import { BrandMark } from '@/components/ui/brand-mark';
import { WaitlistForm } from './waitlist-form';
import { WaitlistCounter } from './waitlist-counter';
import { ShareCard } from './share-card';
import { ShareActions } from './share-actions';

export function WaitlistExperience({
  referredBy,
  forceReset = false,
}: {
  referredBy: string | null;
  /** Dev helper: ?reset clears the saved card so the form shows again. */
  forceReset?: boolean;
}) {
  const entry = useWaitlistStore((s) => s.entry);
  const reset = useWaitlistStore((s) => s.reset);
  const [mounted, setMounted] = useState(false);

  // The persisted store rehydrates from localStorage on the client only. We render
  // the join view on the server AND on the first client render (treating the user
  // as new), then swap to their saved card after mount — so the hero is still SSR'd
  // and there's no hydration mismatch. Returning users see a brief join-view flash.
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (forceReset) reset();
  }, [forceReset, reset]);
  const showCard = mounted && entry && !forceReset;

  return (
    <>
      <header className="mb-12 flex w-full items-center justify-between">
        <BrandMark />
        {/* <span className="glass rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)]">
          Private beta
        </span> */}
      </header>

      {showCard ? <SuccessView entry={entry} /> : <JoinView referredBy={referredBy} />}
    </>
  );
}

const PILLARS = ['Built around you.', 'Sourced, tested, with proof.', 'Near cost, on purpose.'];

function JoinView({ referredBy }: { referredBy: string | null }) {
  return (
    <section className="flex w-full flex-1 flex-col justify-center animate-fade-up">
      <span className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">
        Coming soon
      </span>

      {referredBy ? (
        <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-brand-400/15 px-3.5 py-1.5 text-xs font-medium text-brand-800 backdrop-blur-xl ring-1 ring-inset ring-brand-300/40 ring-offset-0 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)]">
          ✦ A friend invited you
        </span>
      ) : null}

      <h1 className="text-balance text-[2.75rem] leading-[1.02] tracking-[-0.03em] text-ink sm:text-6xl">
        The you in your head.
      </h1>
      <p className="mt-4 text-lg italic text-muted">The body drifts. The person doesn&apos;t.</p>
      <p className="mt-3 max-w-md text-pretty text-lg leading-relaxed text-muted">
        Clinician-guided peptide care, built to keep you yourself.
      </p>

      <div className="mt-9">
        <WaitlistForm referredBy={referredBy} />
      </div>

      <ul className="mt-10 space-y-3 border-t border-line/60 pt-8">
        {PILLARS.map((pillar) => (
          <li key={pillar} className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            <span className="font-semibold text-ink">{pillar}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
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
    <section className="flex w-full flex-1 flex-col animate-fade-up">
      <div className="">
        <h1 className="text-[2rem] tracking-[-0.03em] text-ink sm:text-[2.5rem]">
          You&apos;re in.
        </h1>
        <p className="text-base leading-relaxed text-muted">
          Your founding member rate is locked - for life.
        </p>
      </div>

      <div className="mb-4 border-t border-line/60 pt-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Share your place</h2>
        <p className="mt-2 max-w-md text-pretty text-base leading-relaxed text-muted">
          Share the founding rate with the people you care about — and for everyone who becomes
          a member, you get a month free.
        </p>
        {live.referralCount > 0 ? (
          <p className="mt-2 text-sm text-ink">
            {live.referralCount} {live.referralCount === 1 ? 'person has' : 'people have'} joined
            through you.
          </p>
        ) : null}
      </div>

      <ShareCard entry={live} />

      <div className="mt-8">
        <ShareActions referralCode={live.referralCode} />
      </div>
    </section>
  );
}
