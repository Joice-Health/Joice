import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import Image from 'next/image';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

/** Server-side check so a missing hero asset shows a quiet slot, not a broken image. */
function heroImageExists(): boolean {
  return existsSync(join(process.cwd(), 'public', 'hero.jpg'));
}

export function Hero() {
  return (
    <section className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
      <div className="animate-fade-up">
        <Eyebrow>Clinician-guided peptide care</Eyebrow>
        <h1 className="mt-4 text-balance text-5xl leading-[1.02] tracking-[-0.03em] text-ink sm:text-6xl">
          Built to keep you yourself.
        </h1>
        <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted">
          Protocols set by clinicians, sourced and tested with proof, priced near cost — on
          purpose.
        </p>
        <div className="mt-9 flex items-center gap-5">
          <CtaLink href="/get-started" size="lg">
            Get Started
          </CtaLink>
          <Link
            href="/how-it-works"
            className="text-sm font-medium text-ink/80 underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            How it works →
          </Link>
        </div>
      </div>

      {/* Hero image — drop the real asset at apps/web/public/hero.jpg */}
      <div className="relative aspect-4/3 overflow-hidden rounded-card shadow-[0_40px_80px_-32px_rgba(40,30,10,0.45)]">
        {heroImageExists() ? (
          <Image
            src="/hero.jpg"
            alt="Joice"
            fill
            priority
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-brand-100/60">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              Add public/hero.jpg
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
