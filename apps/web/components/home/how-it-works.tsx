import { Eyebrow } from '@/components/ui/eyebrow';

const STEPS = [
  { n: '01', label: 'Intake', detail: 'Tell us where you are and where you want to be.' },
  { n: '02', label: 'Clinician consult', detail: 'A licensed clinician reviews and prescribes.' },
  { n: '03', label: 'Prescribe + access', detail: 'Protocols shipped, tracked, adjusted.' },
];

export function HowItWorks() {
  return (
    <section className="py-16 sm:py-20">
      <Eyebrow>How it works</Eyebrow>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="relative overflow-hidden rounded-card bg-surface p-6 pt-5 shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-2 -top-6 font-mono text-[7rem] font-bold leading-none text-brand-100"
            >
              {step.n}
            </span>
            <div className="relative">
              <Eyebrow>Step {step.n}</Eyebrow>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">{step.label}</h3>
              <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-muted">
                {step.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
