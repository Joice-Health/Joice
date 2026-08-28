import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Index } from '@joice/ui';
import { PageIntro } from '@/components/ui/page-intro';

export const metadata: Metadata = { title: 'Terms of Service · Joice' };

const CONTACT = (
  <a
    href="mailto:care@joicehealth.com"
    className="text-ink underline decoration-stone underline-offset-4 hover:decoration-ink"
  >
    care@joicehealth.com
  </a>
);

/**
 * The approved Terms of Service (Shaun's doc, 2026-08-28), landed verbatim as
 * the copy of record, punctuation included. Edits here come from an approved
 * doc, not ad hoc. The section numbering is the document's own (the text
 * cross-references Sections 2 and 5), so the indices must stay in step with
 * it. Section 10's capitals are the document's, deliberately.
 */
const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: 'Agreement to These Terms',
    body: (
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the
        website, mobile experience, and membership programs (together, the
        &ldquo;Services&rdquo;) offered by Joice Health, Inc., a Delaware corporation
        (&ldquo;Joice,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By
        creating an account, submitting an intake form, or otherwise using the Services, you
        agree to these Terms and to our{' '}
        <Link
          href="/privacy"
          className="text-ink underline decoration-stone underline-offset-4 hover:decoration-ink"
        >
          Privacy Policy
        </Link>
        , which is incorporated here by reference. If you do not agree, please do not use the
        Services.
      </p>
    ),
  },
  {
    title: 'Who Does What: Joice, Beluga, and Our Pharmacy Partner',
    body: (
      <>
        <p>
          Joice is a health and wellness platform. We built Joice to make it simple to access
          independent medical evaluation, personalized treatment, and trusted pharmacy
          fulfillment in one place &mdash; but we want to be clear about who does what, because
          that matters for your care.
        </p>
        <p>
          <span className="text-ink">Joice operates the platform.</span> We run the website,
          your account, scheduling, billing, and customer support, and we coordinate the
          logistics of getting you connected to care and, where appropriate, medication. Joice
          is not a medical provider, does not practice medicine, does not participate in
          clinical decision-making, and does not decide whether you receive a prescription.
        </p>
        <p>
          <span className="text-ink">Beluga Health, P.A. provides your medical care.</span> All
          clinical evaluations, diagnoses, and prescribing decisions are made exclusively by
          Beluga&rsquo;s independently licensed physicians, based solely on their professional
          medical judgment. Beluga&rsquo;s physicians are licensed in the state where
          you&rsquo;re located at the time of your evaluation. Completing an intake through
          Joice does not guarantee that you will be offered a consultation, a prescription, or
          any particular treatment &mdash; that determination belongs entirely to your Beluga
          provider.
        </p>
        <p>
          <span className="text-ink">A licensed pharmacy fulfills your prescription.</span>{' '}
          Where a Beluga physician prescribes medication, it is compounded and shipped by The
          Pharmacy Hub, a 503A pharmacy licensed in the states where The Pharmacy Hub is
          authorized to ship. Joice does not compound, handle, or dispense medication.
        </p>
        <p>
          Program and product availability varies by state and depends on where our pharmacy
          partner is licensed to ship and where Beluga&rsquo;s physicians are licensed to
          practice. We confirm your eligibility during intake, before any prescription-related
          charge is finalized. Some programs &mdash; including those involving controlled
          substances such as testosterone replacement therapy &mdash; carry additional
          state-specific restrictions beyond general pharmacy availability, and availability
          can change over time as licensing expands.
        </p>
      </>
    ),
  },
  {
    title: 'Your Care Isn’t Guaranteed, and It’s Not a Substitute for Emergency Care',
    body: (
      <>
        <p>
          Submitting an intake is the start of a process, not a guarantee of treatment. Your
          Beluga provider will review your intake and medical history and decide, using
          independent clinical judgment, whether treatment through Joice is appropriate for
          you. Some individuals will not be eligible for treatment.
        </p>
        <p className="text-ink">
          If you are experiencing a medical emergency, call 911 or go to your nearest emergency
          room. Do not use Joice for emergencies.
        </p>
        <p>
          Joice and Beluga&rsquo;s telehealth services are intended to complement &mdash; not
          replace &mdash; your relationship with your primary care provider.
        </p>
        <p>
          Compounded medications are prepared specifically for you by a licensed pharmacy. They
          are not the same as, and are not FDA-approved in the same manner as, their brand-name
          counterparts. Your Beluga provider will discuss the risks, benefits, and alternatives
          with you before treatment begins.
        </p>
      </>
    ),
  },
  {
    title: 'Eligibility',
    body: (
      <ul className="flex flex-col gap-3 pl-5 list-disc marker:text-stone">
        <li>You must be at least 18 years old to use the Services.</li>
        <li>
          You must be a legal resident of, and physically located in, a state where
          Joice&rsquo;s Services are available at the time of your evaluation.
        </li>
        <li>
          You must provide accurate, complete, and truthful information, including your medical
          history. Providing false or incomplete information may result in denial of care or
          termination of your account, and may put your health at risk.
        </li>
        <li>
          Some programs have additional eligibility requirements (for example, identity
          verification for controlled-substance prescriptions), which will be disclosed to you
          during intake.
        </li>
      </ul>
    ),
  },
  {
    title: 'Membership, Billing & Programs',
    body: (
      <>
        <p>
          Joice&rsquo;s core membership bills on a monthly basis and renews automatically until
          canceled. We currently offer programs including automated weight-loss management
          (with ongoing physician-directed check-ins and dosage adjustments) and
          hormone-related therapy, in addition to general consultations. Billing cadence,
          program duration, and the frequency of provider follow-up may differ by program; the
          specific terms of your program will be presented to you at checkout or enrollment and
          will control over this Section where more specific.
        </p>
        <p>
          Joice&rsquo;s Services are offered on a self-pay, cash-only basis. Neither Joice nor
          Beluga bills Medicare, Medicaid, or private insurance for these Services, and you may
          not be able to seek reimbursement from your insurer.
        </p>
        <p>
          You&rsquo;re responsible for keeping your account credentials confidential and for
          all activity that occurs under your account. You may cancel your membership at any
          time following the cancellation process disclosed at checkout; cancellation,
          shipping, and return terms for products are set out in our separate Shipping &amp;
          Refund Policy. Because compounded medication is prepared specifically for you, most
          prescription orders cannot be returned once dispensed.
        </p>
      </>
    ),
  },
  {
    title: 'Non-Prescription Products',
    body: (
      <>
        <p>
          Joice also offers supplement and wellness products that do not require a prescription
          or a medical evaluation. These are ordinary consumer purchases, governed by these
          Terms and our Shipping &amp; Refund Policy, and are entirely separate from the
          telehealth relationship described in Section 2.
        </p>
        <p>
          These statements have not been evaluated by the Food and Drug Administration. These
          products are not intended to diagnose, treat, cure, or prevent any disease.
        </p>
      </>
    ),
  },
  {
    title: 'Communications',
    body: (
      <p>
        By providing your phone number or email and opting in, you agree to receive account,
        order, and shipping messages from Joice by text and email, and &mdash; if you
        separately opt in &mdash; marketing messages. Message and data rates may apply. Reply
        STOP at any time to opt out of texts, or HELP for help. This is separate from the
        telehealth informed consent you provide directly as part of your Beluga evaluation,
        which governs communications about your clinical care.
      </p>
    ),
  },
  {
    title: 'Acceptable Use',
    body: (
      <>
        <p>When using the Services, you agree not to:</p>
        <ul className="flex flex-col gap-3 pl-5 list-disc marker:text-stone">
          <li>Misrepresent your identity, age, or medical history;</li>
          <li>Resell, share, or otherwise transfer any medication prescribed to you;</li>
          <li>Use bots, scrapers, or other automated means to access the Services; or</li>
          <li>
            Attempt to interfere with the security, integrity, or availability of the Services.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Intellectual Property',
    body: (
      <>
        <p>
          The Services, including all content, software, and trademarks, are owned by Joice or
          its licensors and are protected by applicable intellectual property laws. You may not
          copy, modify, distribute, or create derivative works from the Services without our
          prior written permission.
        </p>
        <p>
          If you believe content on the Services infringes your rights, please contact us at{' '}
          {CONTACT} with a description of the work, its location on the Services, and your
          contact information.
        </p>
      </>
    ),
  },
  {
    title: 'Disclaimers & Limitation of Liability',
    body: (
      <>
        <p>
          THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo; TO THE
          FULLEST EXTENT PERMITTED BY LAW, JOICE DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED.
          BECAUSE YOUR CLINICAL CARE IS PROVIDED BY BELUGA AND ITS PHYSICIANS &mdash; NOT BY
          JOICE &mdash; JOICE IS NOT RESPONSIBLE FOR THE CLINICAL DECISIONS, ACTS, OR OMISSIONS
          OF BELUGA, ITS PHYSICIANS, CAREPORTALS, OR OUR PHARMACY PARTNER, EACH OF WHICH
          OPERATES UNDER ITS OWN LICENSURE, INSURANCE, AND SCOPE OF PRACTICE.
        </p>
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, JOICE&rsquo;S TOTAL LIABILITY TO YOU FOR ANY
          CLAIM ARISING FROM THE SERVICES WILL NOT EXCEED THE AMOUNT YOU PAID JOICE IN THE
          TWELVE (12) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. NOTHING IN THIS SECTION
          LIMITS LIABILITY WHERE PROHIBITED BY LAW.
        </p>
      </>
    ),
  },
  {
    title: 'Indemnification',
    body: (
      <p>
        You agree to indemnify and hold Joice harmless from any claims, losses, or expenses
        arising from your use of the Services, your breach of these Terms, or your violation of
        any law or third-party right.
      </p>
    ),
  },
  {
    title: 'Resolving Disputes',
    body: (
      <>
        <p className="text-ink">
          Please read this section carefully &mdash; it affects your right to go to court and
          your right to a jury trial or class action.
        </p>
        <p>
          Before filing a claim, please contact us at {CONTACT} and give us 30 days to try to
          resolve the issue informally &mdash; most concerns can be worked out this way.
        </p>
        <p>
          If informal resolution doesn&rsquo;t work, you and Joice agree that any dispute will
          be resolved by binding, individual arbitration under the Federal Arbitration Act,
          rather than in court, and that neither of us will bring or participate in a class,
          collective, or representative action. You may opt out of this arbitration agreement
          by writing to us within 30 days of first accepting these Terms.
        </p>
        <p>
          This arbitration agreement doesn&rsquo;t apply to intellectual property claims,
          small-claims-eligible disputes, or requests for emergency injunctive relief, any of
          which either of us may bring in court.
        </p>
      </>
    ),
  },
  {
    title: 'Governing Law',
    body: (
      <p>
        These Terms are governed by the laws of the State of Delaware, without regard to
        conflict-of-laws principles, except as superseded by the arbitration agreement above.
      </p>
    ),
  },
  {
    title: 'Changes; Termination; Contact',
    body: (
      <>
        <p>
          We may update these Terms from time to time; continued use of the Services after an
          update takes effect means you accept the revised Terms. We may suspend or terminate
          your access to the Services at any time, including for a violation of these Terms.
        </p>
        <p>
          Questions about these Terms: {CONTACT}. Questions about your clinical care: please
          contact Beluga directly through the channel provided to you during your evaluation.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <>
      <PageIntro eyebrow="Legal" title="Terms of Service">
        Last updated: August 26, 2026
      </PageIntro>
      <div className="mx-auto max-w-3xl border-t border-line pb-24">
        {SECTIONS.map((section, i) => (
          <section key={section.title} className="border-b border-line py-10">
            <h2 className="flex items-baseline gap-4 text-2xl text-ink">
              <Index n={i + 1} className="mono-label text-muted" />
              {section.title}
            </h2>
            <div className="mt-5 flex flex-col gap-4 leading-relaxed text-muted">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
