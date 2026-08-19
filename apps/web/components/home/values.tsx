import { Index } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';

const VALUES = ['Accessible to all', 'Transparent pricing', 'Triple tested'];

/**
 * The dark band, the deck's Values screen. Ink from edge to edge (it breaks
 * out of the site container), cream mono on it, and the one place the page
 * goes dark.
 */
export function Values() {
  return (
    <section className="relative left-1/2 w-screen -translate-x-1/2 bg-ink px-6 py-20 text-canvas sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Eyebrow as="h2" className="text-center text-canvas">
          Values
        </Eyebrow>
        <ol className="mx-auto mt-14 flex max-w-xl flex-col gap-5">
          {VALUES.map((value, i) => (
            <li key={value} className="mono-label flex items-baseline justify-between text-sm">
              <span className="text-canvas/70">
                <Index n={i + 1} />
              </span>
              <span>{value}</span>
            </li>
          ))}
        </ol>
        <div className="mt-16 flex justify-center">
          <CtaLink href="/story" size="lg" className="text-canvas">
            Our story
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
