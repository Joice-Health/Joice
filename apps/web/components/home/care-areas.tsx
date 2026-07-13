import Link from 'next/link';
import { Eyebrow } from '@/components/ui/eyebrow';

const CARE_AREAS = [
  'Weight & metabolic',
  'Body comp / recovery',
  'Beauty / skin',
  'Energy',
  'Stress & sleep',
];

export function CareAreas() {
  return (
    <section className="pb-16 sm:pb-20">
      <div className="flex items-baseline justify-between">
        <Eyebrow>Explore by care area</Eyebrow>
        <Link
          href="/explore"
          className="font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
        >
          All areas →
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {CARE_AREAS.map((area, i) => (
          <Link
            key={area}
            href="/explore"
            className="group flex min-h-32 flex-col justify-between rounded-card bg-surface p-4 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_56px_-28px_rgba(40,35,25,0.6)]"
          >
            <span className="font-mono text-[10px] tracking-[0.15em] text-muted">0{i + 1}</span>
            <span className="text-sm font-medium leading-snug text-ink">
              {area}
              <span className="ml-1 inline-block text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink">
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
