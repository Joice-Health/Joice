import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Index } from '@joice/ui';
import { PageIntro } from '@/components/ui/page-intro';

export const metadata: Metadata = { title: 'FAQ · Joice' };

/**
 * The approved FAQ copy (Shaun's doc, 2026-08-28). Answers are the copy of
 * record for what we tell visitors about the medication, the pharmacy, and
 * paying; edits here should come from an approved doc, not ad hoc.
 */
const FAQ_ITEMS: { question: string; answer: ReactNode }[] = [
  {
    question: 'What is glutathione?',
    answer: (
      <>
        <p>
          Glutathione is a molecule made from three amino acids (cysteine, glutamate, and
          glycine) that your body produces in nearly every cell. It is one of the body&apos;s
          main intracellular antioxidants and is required for the liver to process and clear
          certain compounds.
        </p>
        <p>
          The glutathione available through Joice is an injectable solution at 200 mg/mL,
          compounded by a licensed 503A pharmacy and dispensed only with a prescription. It is
          not an FDA-approved drug and it is not a treatment for any disease.
        </p>
      </>
    ),
  },
  {
    question: 'How do I take it?',
    answer: (
      <>
        <p>
          Glutathione is self-administered as a subcutaneous injection into the fatty tissue
          beneath the skin, typically in the abdomen, thigh, or upper arm. Your provider
          determines your dose and schedule. Always use the exact amount shown on your
          prescription label.
        </p>
        <p>
          Before each injection, wash your hands and gather the vial, a new sterile syringe and
          needle, alcohol swabs, and a sharps container. Clean the vial stopper and injection
          site with alcohol and allow the skin to dry. Rotate injection sites and avoid skin
          that is bruised, tender, red, hard, scarred, or irritated.
        </p>
        <p>
          After the injection, place the used needle and syringe directly into a sharps
          container. Do not reuse needles or syringes.
        </p>
        <p>
          If you miss a dose, do not take an extra dose to make up for it. Follow the
          instructions in your care plan or contact your provider.
        </p>
        <p>
          Store the vial exactly as directed on the prescription label and the instructions
          included with your order. A step-by-step injection guide will be provided; contact
          the care team before your first injection if anything is unclear.
        </p>
      </>
    ),
  },
  {
    question: 'Do you take insurance?',
    // Wording tracks Terms section 5 on purpose. If one changes, change both.
    answer: (
      <>
        <p>
          No. Joice is self-pay only. Neither Joice nor Beluga bills Medicare, Medicaid, or
          private insurance, and you may not be able to seek reimbursement from your insurer.
        </p>
        <p>
          That is deliberate. Without a benefits system to negotiate against, we can publish
          one price and hold our margin near cost. You can submit receipts to an HSA or FSA
          administrator if you have one, though we cannot guarantee reimbursement.
        </p>
      </>
    ),
  },
  {
    question: 'Where do your products come from?',
    answer: (
      <>
        <p>
          Glutathione ordered through Joice is compounded and dispensed in the United States by
          The Pharmacy Hub, a licensed 503A compounding pharmacy. Joice does not manufacture,
          hold, or ship medication.
        </p>
        <p>
          We do not sell research-use-only material, and we do not source from unlicensed or
          overseas direct-to-consumer suppliers.
        </p>
      </>
    ),
  },
  {
    question: 'Which pharmacy fills my prescription, and what does 503A mean?',
    answer: (
      <>
        <p>Prescriptions are dispensed by The Pharmacy Hub, a 503A Compounding Pharmacy.</p>
        <p>
          A 503A pharmacy is a traditional compounding pharmacy. It prepares medications for
          individually identified patients pursuant to a valid prescription, under state board
          of pharmacy licensure and Section 503A of the Federal Food, Drug, and Cosmetic Act.
          Compounded preparations are not FDA-approved and are not reviewed by the FDA for
          safety, effectiveness, or manufacturing quality.
        </p>
        <p>
          We confirm during intake that we can ship to your state, before any
          prescription-related charge is finalized.
        </p>
      </>
    ),
  },
  {
    // The LegitScript jurisdiction disclosure entry (sc-275), verbatim from
    // Richard's spec; positioned after the pharmacy question deliberately.
    question: 'Where is Joice available?',
    answer: (
      <>
        <p>
          Joice is available only to patients physically located in the United States. Within
          the U.S., availability is limited to jurisdictions where both the prescribing
          physician and the dispensing pharmacy are licensed. The full list of states, the
          District of Columbia, and U.S. territories is published on our{' '}
          <Link
            href="/states"
            className="text-ink underline decoration-dotted underline-offset-4 hover:text-brand-700"
          >
            Where Joice is available
          </Link>{' '}
          page.
        </p>
        <p>
          We confirm your location during medical intake, before any prescription-related
          charge is finalized. If we cannot serve your jurisdiction, we will tell you at that
          point and no order will proceed.
        </p>
      </>
    ),
  },
  {
    question: 'What is your return policy?',
    answer: (
      <>
        <p>
          Because the compounded medication is prepared specifically for you, prescription
          orders cannot be returned or resold once dispensed. That is a legal and
          patient-safety requirement across licensed U.S. pharmacies.
        </p>
        <p>
          If an order arrives damaged, incorrect, or compromised in transit, contact us within
          7 days and we will replace it at no cost. If a physician declines to prescribe, you
          are not charged for the product.
        </p>
        <p>
          Questions about a specific order go to{' '}
          <a
            href="mailto:care@joicehealth.com"
            className="text-ink underline decoration-dotted underline-offset-4 hover:text-brand-700"
          >
            care@joicehealth.com
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <>
      <PageIntro eyebrow="Support" title="Questions, answered">
        About the medication, the pharmacy behind it, and how paying works.
      </PageIntro>
      <ol className="mx-auto w-full max-w-3xl border-t border-line pb-8">
        {FAQ_ITEMS.map((item, i) => (
          <li
            key={item.question}
            className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 border-b border-line py-8 sm:gap-x-8 sm:py-10"
          >
            <span className="mono-label pt-1 text-muted">
              <Index n={i + 1} />
            </span>
            <div>
              <h2 className="text-xl text-ink sm:text-2xl">{item.question}</h2>
              <div className="mt-4 space-y-4 leading-relaxed text-muted">{item.answer}</div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
