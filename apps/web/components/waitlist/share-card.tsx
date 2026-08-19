'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { WaitlistEntryView } from '@joice/core';
import { buildShareUrl } from '@/lib/env';

const issuedDate = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

/** The collectible "membership card": the olive turned to gold, QR, reference ID. */
export function ShareCard({ entry }: { entry: WaitlistEntryView }) {
  const shareUrl = buildShareUrl(entry.referralCode);
  const referenceId = entry.referralCode.toUpperCase();

  return (
    <div className="relative w-full overflow-hidden rounded-card">
      {/* Gold header: frosts the water behind the card */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-b from-card-from/80 to-card-to/70 backdrop-blur-xl">
        <div className="absolute inset-0 flex items-start justify-between p-5">
          <span className="mono-label text-ink">◎ Founding member</span>
          <span className="mono-label text-right leading-relaxed text-ink">
            You deserve this.
            <br />
            Brought to you by Joice
          </span>
        </div>
      </div>

      {/* Opaque lower section: keeps the data + QR crisp and legible */}
      <div className="bg-surface">
      {/* Lower data plate */}
      <div className="grid grid-cols-[1fr_auto] gap-4 p-6">
        <dl className="space-y-4 font-mono text-ink">
          <div>
            <dt className="mono-label text-muted">Reference ID</dt>
            <dd className="mt-1 text-sm tracking-wide">{referenceId}</dd>
          </div>
          <div>
            <dt className="mono-label text-muted">Position</dt>
            <dd className="mt-1 text-sm tabular-nums">#{entry.position.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="mono-label text-muted">Issued</dt>
            <dd className="mt-1 text-sm uppercase">{issuedDate.format(new Date())}</dd>
          </div>
        </dl>

        <div className="flex flex-col items-center justify-start">
          <div className="rounded-xl bg-white p-2.5">
            <QRCodeSVG value={shareUrl} size={104} level="M" marginSize={0} fgColor="#4d4f3f" />
          </div>
          <span className="mono-label mt-2.5 text-[9px] text-muted">Scan to join</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        <span className="mono-label leading-tight text-muted">The New Standard of You</span>
        <span className="font-mono text-lg tracking-mono text-ink/40">Joice</span>
      </div>
      </div>
    </div>
  );
}
