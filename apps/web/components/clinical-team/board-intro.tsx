import { Eyebrow } from '@/components/ui/eyebrow';

export function BoardIntro() {
  return (
    <section className="py-16 sm:py-24">
      <div className="animate-fade-up">
        <Eyebrow>Clinical team</Eyebrow>
        <h1 className="mt-4 max-w-2xl text-balance text-5xl leading-[1.02] tracking-[-0.03em] text-ink sm:text-6xl">
          The board behind every protocol.
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted">
          Licensed clinicians who set, review, and stand behind everything Joice offers.
          Nothing ships without their sign-off — not a protocol, not a source, not a claim.
        </p>
      </div>
    </section>
  );
}
