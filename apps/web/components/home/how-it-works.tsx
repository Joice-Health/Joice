import { Index } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';

const STEPS = [
  { label: 'Intake', detail: 'Tell us where you are and where you want to be.' },
  { label: 'Clinician consult', detail: 'A licensed clinician reviews and prescribes.' },
  { label: 'Prescribe + access', detail: 'Protocols shipped, tracked, adjusted.' },
];

/** The three steps, in order, the one list where the index carries meaning. */
export function HowItWorks({ eyebrow = 'How it works' }: { eyebrow?: string }) {
  return (
    <section className="py-16 sm:py-24">
      <Eyebrow as="h2" className="text-center">
        {eyebrow}
      </Eyebrow>
      <ol className="mx-auto mt-10 max-w-3xl border-t border-line">
        {STEPS.map((step, i) => (
          <li
            key={step.label}
            className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-b border-line py-5 sm:grid-cols-[6rem_1fr_1.3fr] sm:items-baseline sm:gap-x-8"
          >
            <span className="mono-label text-muted">
              <Index n={i + 1} />
            </span>
            <h3 className="text-xl text-ink">{step.label}</h3>
            <p className="col-start-2 text-base leading-relaxed text-muted sm:col-start-3">
              {step.detail}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
