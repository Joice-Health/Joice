'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { WaitlistEntryView } from '@joice/core';
import { buildShareUrl } from '@/lib/env';

const issuedDate = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

/** The collectible "membership card" — premium warm gradient, QR, reference ID. */
export function ShareCard({ entry }: { entry: WaitlistEntryView }) {
  const shareUrl = buildShareUrl(entry.referralCode);
  const referenceId = entry.referralCode.toUpperCase();

  return (
    <div className="w-full overflow-hidden rounded-card border border-line bg-surface shadow-[0_24px_60px_-24px_rgba(40,30,10,0.35)]">
      {/* Warm gradient header — echoes the reference card's collectible feel */}
      <div className="relative h-44 bg-gradient-to-b from-card-from to-card-to">
        <div className="absolute inset-0 flex items-start justify-between p-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
            ◎ Founding member
          </span>
          <span className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.15em] text-white/90 text-right">
            You were made for greatness.
            <br />
            Brought to you by Joice
          </span>
        </div>
      </div>

      {/* Lower data plate */}
      <div className="grid grid-cols-[1fr_auto] gap-4 p-6">
        <dl className="space-y-4 font-mono text-ink">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.15em] text-muted">Reference ID</dt>
            <dd className="mt-1 text-sm tracking-wide">{referenceId}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.15em] text-muted">Position</dt>
            <dd className="mt-1 text-sm tabular-nums">#{entry.position.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.15em] text-muted">Issued</dt>
            <dd className="mt-1 text-sm uppercase">{issuedDate.format(new Date())}</dd>
          </div>
        </dl>

        <div className="flex flex-col items-center justify-start">
          <div className="rounded-xl border border-line bg-white p-2">
            <QRCodeSVG value={shareUrl} size={112} level="M" marginSize={0} fgColor="#27332d" />
          </div>
          <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.15em] text-muted">
            Scan to join
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        <span className="font-mono text-[10px] uppercase leading-tight tracking-[0.15em] text-muted">
          Introducing
          <br />
          Joice Peptides
        </span>
        <span className="text-lg font-semibold lowercase tracking-tight text-ink/30">joice</span>
      </div>
    </div>
  );
}
