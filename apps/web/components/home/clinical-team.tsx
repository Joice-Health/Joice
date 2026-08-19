import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

export function ClinicalTeam() {
  return (
    <section className="border-b border-line py-12 sm:py-16">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Eyebrow as="h2">Clinical team</Eyebrow>
          <p className="mt-3 max-w-md text-xl leading-snug text-ink sm:text-2xl">
            Meet the clinicians who set our protocols.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex -space-x-3">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="h-11 w-11 rounded-full border-2 border-canvas bg-stone/50"
              />
            ))}
          </div>
          <CtaLink href="/clinical-team" className="shrink-0">
            Meet the team +
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
