import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

export function ClinicalTeam() {
  return (
    <section className="glass rounded-card p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-32px_rgba(40,35,25,0.4)] sm:p-8">
      <Eyebrow>Clinical team</Eyebrow>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <div className="flex -space-x-3">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="h-12 w-12 rounded-full border-2 border-surface bg-gradient-to-br from-card-to to-brand-200"
              />
            ))}
          </div>
          <p className="max-w-sm text-lg leading-snug text-ink">
            “Meet the clinicians who set our protocols”
          </p>
        </div>
        <CtaLink href="/clinical-team" className="shrink-0">
          Meet the team →
        </CtaLink>
      </div>
    </section>
  );
}
