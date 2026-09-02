import type { Metadata } from 'next';

/**
 * The jurisdiction disclosure LegitScript verifies (Question 24; Certification
 * Standard #5, Patient Services), requested by Richard 2026-09-01. The analyst
 * loads this URL cold: it must stay publicly reachable (PUBLIC_PATHS in
 * middleware.ts), flag-free, server-rendered, and indexable (the robots
 * export below overrides the (legal) layout's noindex; app/sitemap.ts lists
 * it). Copy is the disclosure of record: the availability facts live in the
 * constants below so a licensure change is a one-line edit, and every
 * jurisdiction is stated affirmatively, never left unmentioned.
 */

const STATES_COPY =
  'Joice is available in all 50 U.S. states.';
const DC_COPY = 'Joice is available in the District of Columbia.';
const TERRITORIES_COPY =
  'Joice is not available in Puerto Rico, the U.S. Virgin Islands, Guam, American Samoa, or the Northern Mariana Islands.';
const LAST_UPDATED = 'September 1, 2026';

export const metadata: Metadata = {
  title: 'Where Joice Is Available — States, Territories, and Countries',
  description:
    'The states, territories, and countries where Joice Health services are available, and how we verify your location before an order proceeds.',
  robots: { index: true, follow: true },
};

const DISCLOSURES: { label: string; body: string }[] = [
  {
    label: 'Countries.',
    body: 'Joice is available only to patients physically located in the United States. We do not serve patients in any other country.',
  },
  { label: 'States.', body: STATES_COPY },
  { label: 'District of Columbia.', body: DC_COPY },
  { label: 'U.S. territories.', body: TERRITORIES_COPY },
];

export default function StatesPage() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto w-full max-w-3xl animate-fade-up">
        <h1 className="display text-balance text-5xl text-ink sm:text-7xl">
          Where Joice is available
        </h1>
        <div className="mt-10 space-y-6 border-t border-line pt-10 leading-relaxed text-muted">
          {DISCLOSURES.map((item) => (
            <p key={item.label}>
              <strong className="font-normal text-ink">{item.label}</strong> {item.body}
            </p>
          ))}
          <p>
            Prescriptions are issued only by physicians of Beluga Health, P.A. licensed in the
            patient&apos;s state, and are compounded and dispensed by The Pharmacy Hub, a 503A
            compounding pharmacy licensed to ship to that state. We confirm your location
            during medical intake, and we will not proceed with an order from a jurisdiction
            where both are not licensed.
          </p>
          <p>This list is updated as licensure changes. Last updated: {LAST_UPDATED}.</p>
        </div>
      </div>
    </section>
  );
}
