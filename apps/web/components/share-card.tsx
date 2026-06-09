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
    <div className="relative w-full overflow-hidden rounded-card ring-1 ring-black/[0.05] shadow-[0_40px_80px_-32px_rgba(40,30,10,0.45),0_8px_24px_-12px_rgba(40,30,10,0.18)]">
      {/* Lit top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-white/70" />

      {/* Translucent warm header — frosts the video behind the card */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-b from-card-from/70 to-card-to/55 backdrop-blur-xl backdrop-saturate-150">
        {/* Specular glass sheen sweeping across the header */}
        <div className="pointer-events-none absolute -inset-x-10 -top-24 h-48 rotate-12 bg-gradient-to-b from-white/35 to-transparent blur-md" />
        <div className="absolute inset-0 flex items-start justify-between p-5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/85">
            ◎ Founding member
          </span>
          <span className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.15em] text-white/90 text-right">
            You deserve this.
            <br />
            Brought to you by Joice
          </span>
        </div>
      </div>

      {/* Opaque lower section — keeps the data + QR crisp and legible */}
      <div className="bg-surface">
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
          <div className="rounded-2xl glass p-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_8px_20px_-12px_rgba(0,0,0,0.2)]">
            <div className="rounded-xl bg-white p-2">
              <QRCodeSVG value={shareUrl} size={104} level="M" marginSize={0} fgColor="#27332d" />
            </div>
          </div>
          <span className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.15em] text-muted">
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
    </div>
  );
}
