'use client';

import { useState } from 'react';
import { Button } from '@joice/ui';
import { buildShareUrl } from '@/lib/env';

const SHARE_MESSAGE = 'I just joined the Joice waitlist — AI-guided peptides done right. Join me:';

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

  return (
    <div className="flex w-full flex-col gap-3">
      <Button onClick={copyLink} variant="secondary" size="lg" className="w-full">
        {copied ? '✓ Link copied' : 'Copy referral link'}
      </Button>

      <div className="grid grid-cols-3 gap-3">
        <Button onClick={nativeShare} variant="ghost" className="border border-line">
          Message
        </Button>
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center rounded-full border border-line text-sm font-medium text-ink transition-colors hover:bg-brand-50"
        >
          X
        </a>
        <a
          href={mailUrl}
          className="inline-flex h-11 items-center justify-center rounded-full border border-line text-sm font-medium text-ink transition-colors hover:bg-brand-50"
        >
          Email
        </a>
      </div>
    </div>
  );
}
