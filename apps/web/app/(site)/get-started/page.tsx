import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Button, Input } from '@joice/ui';

export const metadata: Metadata = {
  title: 'Get Started — Joice',
  description: 'Tell us where you are — a licensed clinician decides with you.',
};

const PROMPTS = [
  'I want more energy through the day',
  'Recovery is slower than it used to be',
  'I have labs I want a clinician to look at',
  'Not sure — help me figure out where to start',
];

/**
 * Get Started destination — the Companion engine in a dedicated frame (ad
 * landings / cold start). Static shell only: the conversation/intake flow is a
 * separate workstream; controls are placeholders until it lands.
 */
export default function GetStartedPage() {
  return (
    <div className="mx-auto w-full max-w-2xl py-16 sm:py-24">
      <div className="text-center">
        <Eyebrow>Get started</Eyebrow>
        <h1 className="mt-4 text-balance text-4xl leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
          Tell us where you are.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted">
          A few questions, your concerns, labs if you have them — then a licensed clinician
          takes it from there.
        </p>
      </div>

      {/* Intent capture */}
      <div className="glass mt-10 rounded-card p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_60px_-24px_rgba(40,30,10,0.35)] sm:p-8">
        <div className="flex flex-col gap-3">
          <Input placeholder="What would you change first?" aria-label="Your goal" disabled />
          <Button size="lg" className="w-full" disabled>
            Start the conversation
          </Button>
        </div>

        {/* Guided prompts */}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {PROMPTS.map((prompt) => (
            <span
              key={prompt}
              className="rounded-full bg-surface px-3.5 py-2 text-xs text-muted shadow-[0_10px_24px_-16px_rgba(40,35,25,0.5)]"
            >
              {prompt}
            </span>
          ))}
        </div>

        {/* Labs / concerns upload slot */}
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-canvas/60 p-6 text-center">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Labs / concerns upload — coming with the intake flow
          </span>
        </div>
      </div>

      <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-wider text-muted">
        Conversation → intake → clinician consult · flow in progress
      </p>
    </div>
  );
}
