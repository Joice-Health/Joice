'use client';

import { useState } from 'react';
import { Button, cn } from '@joice/ui';
import { buildShareUrl } from '@/lib/env';

const SHARE_MESSAGE =
  'Clinician-guided peptide care, built to keep you yourself. Lock in the Joice founding member rate:';

export function ShareActions({ referralCode }: { referralCode: string }) {
  const shareUrl = buildShareUrl(referralCode);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently no-op.
    }
  }

  async function nativeShare() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Joice', text: SHARE_MESSAGE, url: shareUrl });
      } catch {
        // User dismissed the share sheet — ignore.
      }
    } else {
      void copyLink();
    }
  }

  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_MESSAGE)}&url=${encodeURIComponent(shareUrl)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent('Join me on the Joice waitlist')}&body=${encodeURIComponent(`${SHARE_MESSAGE} ${shareUrl}`)}`;

  const glassLink = cn(
    'inline-flex h-11 items-center justify-center rounded-full glass text-sm font-medium text-ink',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_10px_28px_-14px_rgba(31,38,32,0.3)]',
    'transition-all duration-200 hover:bg-white/75 active:bg-white/85',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  );

  return (
    <div className="flex w-full flex-col gap-3">
      <Button onClick={copyLink} variant="glassBrand" size="lg" className="w-full">
        {copied ? '✓ Link copied' : 'Get your invite link'}
      </Button>

      <div className="grid grid-cols-3 gap-3">
        <Button onClick={nativeShare} variant="glass">
          Message
        </Button>
        <a href={xUrl} target="_blank" rel="noopener noreferrer" className={glassLink}>
          X
        </a>
        <a href={mailUrl} className={glassLink}>
          Email
        </a>
      </div>
    </div>
  );
}
