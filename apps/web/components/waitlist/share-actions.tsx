'use client';

import { useState } from 'react';
import { Button, buttonClasses } from '@joice/ui';
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
      // Clipboard unavailable (e.g. insecure context): silently no-op.
    }
  }

  async function nativeShare() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Joice', text: SHARE_MESSAGE, url: shareUrl });
      } catch {
        // User dismissed the share sheet: ignore.
      }
    } else {
      void copyLink();
    }
  }

  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_MESSAGE)}&url=${encodeURIComponent(shareUrl)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent('Join me on the Joice waitlist')}&body=${encodeURIComponent(`${SHARE_MESSAGE} ${shareUrl}`)}`;

  const linkClasses = buttonClasses({ variant: 'outline', size: 'md', className: 'text-ink' });

  return (
    <div className="flex w-full flex-col gap-3">
      <Button onClick={copyLink} variant="solid" size="lg" className="w-full">
        {copied ? '✓ Link copied' : 'Get your invite link'}
      </Button>

      <div className="grid grid-cols-3 gap-3">
        <Button onClick={nativeShare} variant="outline" className="text-ink">
          Message
        </Button>
        <a href={xUrl} target="_blank" rel="noopener noreferrer" className={linkClasses}>
          X
        </a>
        <a href={mailUrl} className={linkClasses}>
          Email
        </a>
      </div>
    </div>
  );
}
