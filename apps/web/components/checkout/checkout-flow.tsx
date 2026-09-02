'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';
import { CtaLink } from '@/components/ui/cta-link';
import { useCart } from '@/lib/careportals/use-cart';
import { getStoredCartId } from '@/lib/careportals/cart.client';
import {
  PatientAuthError,
  PatientEmailInUseError,
  createPatientAccount,
  loginPatient,
  patientSession,
} from '@/lib/careportals/patient.client';
import { getPaymentStatus, startCheckout } from '@/lib/careportals/checkout.client';
import { contactSchema, signInSchema, shippingSchema } from '@/lib/careportals/checkout.schemas';
import type { CheckoutStart, ShippingAddress } from '@/lib/careportals/types';
import { checkExistingPayment, type CheckoutStep, type PaymentOutcome } from './checkout-machine';
import { StepContact, type ContactDraft, type FieldErrors } from './step-contact';
import { StepShipping, type ShippingDraft } from './step-shipping';
import { StepPayment } from './step-payment';
import { StripeProvider } from './stripe-provider';
import { OrderSummary } from './order-summary';

/**
 * The checkout runner (docs/shop/01-commerce.md section 6): contact (account
 * creation or sign-in; only login yields the JWT), shipping, payment, with
 * the order summary always in view. The runner owns step state and drafts;
 * the pure machine owns everything that moves money. A refresh mid-checkout
 * resumes at shipping through the sessionStorage JWT; a payment that ends
 * ambiguously only ever resolves through the read-only check, never an
 * automatic resubmit.
 */

const EMPTY_CONTACT: ContactDraft = {
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  dob: '',
  gender: '',
  password: '',
};

const EMPTY_SHIPPING: ShippingDraft = {
  address1: '',
  address2: '',
  city: '',
  provinceCode: '',
  postalCode: '',
};

type Notice =
  | { kind: 'declined' | 'card_error'; message: string }
  | { kind: 'processing'; message: string }
  | { kind: 'ambiguous'; message: string; mayRetry: boolean }
  | null;

export function CheckoutFlow() {
  const router = useRouter();
  const cartQuery = useCart();
  const [step, setStep] = useState<CheckoutStep>('contact');
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [shipping, setShipping] = useState<ShippingDraft>(EMPTY_SHIPPING);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [start, setStart] = useState<CheckoutStart | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  // Resume: a stored JWT means the account step is already done (30-day
  // token, verified live); land on shipping instead of asking again.
  useEffect(() => {
    const stored = patientSession.get();
    if (stored) {
      setToken(stored);
      setStep((current) => (current === 'contact' ? 'shipping' : current));
    }
  }, []);

  const cartId = typeof window === 'undefined' ? null : getStoredCartId();
  const summaryCart = start?.cart ?? cartQuery.data ?? null;

  async function afterLogin(jwt: string) {
    patientSession.set(jwt);
    setToken(jwt);
    if (cartId) {
      try {
        setStart(await startCheckout(cartId, jwt));
      } catch {
        // Totals refresh is a nicety; the payment step retries via its own calls.
      }
    }
    setFieldErrors({});
    setStepError(null);
    setStep('shipping');
  }

  async function submitContact() {
    if (busy) return;
    setStepError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const parsed = signInSchema.safeParse({
          email: contact.email,
          password: contact.password,
        });
        if (!parsed.success) {
          setFieldErrors(toFieldErrors(parsed.error.issues));
          return;
        }
        setFieldErrors({});
        try {
          await afterLogin(
            await loginPatient({ username: parsed.data.email, password: parsed.data.password }),
          );
        } catch (err) {
          if (err instanceof PatientAuthError) {
            setStepError(
              "That didn't match. Try again, or reset your password at care.joicehealth.com.",
            );
          } else {
            setStepError("Sign-in didn't go through. Try again.");
          }
        }
        return;
      }

      const parsed = contactSchema.safeParse(contact);
      if (!parsed.success) {
        setFieldErrors(toFieldErrors(parsed.error.issues));
        return;
      }
      setFieldErrors({});
      try {
        await createPatientAccount(parsed.data);
      } catch (err) {
        if (err instanceof PatientEmailInUseError) {
          setMode('signin');
          setStepError(
            'You already have an account with our pharmacy partner. Sign in to continue.',
          );
          return;
        }
        setStepError("That didn't go through. Check your details and try again.");
        return;
      }
      try {
        await afterLogin(
          await loginPatient({ username: parsed.data.email, password: parsed.data.password }),
        );
      } catch {
        // The account exists but the immediate login failed: the sign-in mode recovers.
        setMode('signin');
        setStepError('Your account was created. Sign in to continue.');
      }
    } finally {
      setBusy(false);
    }
  }

  function submitShipping() {
    const parsed = shippingSchema.safeParse(shipping);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setStepError(null);
    setShippingAddress({ ...parsed.data, address2: parsed.data.address2 ?? undefined });
    setStep('payment');
  }

  function handleOutcome(outcome: PaymentOutcome) {
    switch (outcome.kind) {
      case 'succeeded':
        setNotice(null);
        router.replace(`/shop/checkout/complete?cart=${encodeURIComponent(cartId ?? '')}`);
        return;
      case 'card_error':
      case 'declined':
        setNotice({ kind: outcome.kind, message: outcome.message });
        return;
      case 'auth_expired':
        patientSession.clear();
        setToken(null);
        setMode('signin');
        setStep('contact');
        setStepError('Your session expired. Sign in to continue.');
        return;
      case 'processing':
        setNotice({
          kind: 'processing',
          message:
            'Your payment is still processing. Do not submit again; check back in a moment.',
        });
        return;
      case 'ambiguous':
        setNotice({ kind: 'ambiguous', message: outcome.message, mayRetry: outcome.mayRetry });
        return;
    }
  }

  async function handleCheckAgain() {
    if (!cartId || !token || busy) return;
    setBusy(true);
    try {
      const result = await checkExistingPayment({
        getPaymentStatus: () => getPaymentStatus(cartId, token),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
      if (result.kind === 'succeeded') {
        router.replace(`/shop/checkout/complete?cart=${encodeURIComponent(cartId)}`);
        return;
      }
      if (result.kind === 'auth_expired') {
        handleOutcome({ kind: 'auth_expired' });
        return;
      }
      if (result.kind === 'none') {
        setNotice({
          kind: 'ambiguous',
          message: 'No charge stands. You can try the payment again.',
          mayRetry: true,
        });
        return;
      }
      setNotice({
        kind: 'processing',
        message:
          'Your payment is still processing. Do not submit again; check back in a moment.',
      });
    } finally {
      setBusy(false);
    }
  }

  // The pre-flight guard: no cart, nothing to buy. Mid-flow states keep the
  // form even if the cart reads oddly; the machine's polling owns those.
  if (step === 'contact' && !cartQuery.isPending && (!summaryCart || summaryCart.lineItems.length === 0)) {
    return (
      <Intro>
        <p className="mt-10 max-w-md text-lg leading-relaxed text-muted">Your cart is empty.</p>
        <CtaLink href="/shop" className="mt-8">
          Browse the shop +
        </CtaLink>
      </Intro>
    );
  }

  return (
    <div className="pb-16">
      <Intro />

      <div className="mt-4 grid gap-12 border-t border-line pt-10 lg:grid-cols-[1fr_360px] lg:gap-16">
        <div>
          {step === 'contact' ? (
            <StepContact
              mode={mode}
              draft={contact}
              errors={fieldErrors}
              stepError={stepError}
              busy={busy}
              onChange={(patch) => setContact((c) => ({ ...c, ...patch }))}
              onModeChange={(next) => {
                setMode(next);
                setStepError(null);
                setFieldErrors({});
              }}
              onSubmit={submitContact}
            />
          ) : null}

          {step === 'shipping' ? (
            <StepShipping
              draft={shipping}
              errors={fieldErrors}
              stepError={stepError}
              busy={busy}
              onChange={(patch) => setShipping((s) => ({ ...s, ...patch }))}
              onSubmit={submitShipping}
              onBack={token ? undefined : () => setStep('contact')}
            />
          ) : null}

          {step === 'payment' && cartId && token && shippingAddress ? (
            <StripeProvider>
              <StepPayment
                cartId={cartId}
                token={token}
                start={start}
                contactName={`${contact.firstName} ${contact.lastName}`.trim()}
                contactEmail={contact.email.trim().toLowerCase()}
                shipping={shippingAddress}
                busy={busy}
                setBusy={setBusy}
                onOutcome={handleOutcome}
                onStartRefresh={setStart}
                onBack={() => {
                  setNotice(null);
                  setStep('shipping');
                }}
              />
            </StripeProvider>
          ) : null}

          {notice ? (
            <div className="mt-8 flex max-w-md flex-col items-start gap-4">
              <p
                className={notice.kind === 'processing' ? 'text-sm text-muted' : 'text-sm text-danger'}
                role="alert"
              >
                {notice.message}
              </p>
              {notice.kind === 'processing' ||
              (notice.kind === 'ambiguous' && !notice.mayRetry) ? (
                <Button type="button" disabled={busy} onClick={handleCheckAgain}>
                  {busy ? 'Checking…' : 'Check again +'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {summaryCart && summaryCart.lineItems.length > 0 ? (
          <OrderSummary cart={summaryCart} />
        ) : null}
      </div>
    </div>
  );
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** The page opener, shared by every state so the chrome never jumps. */
function Intro({ children }: { children?: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center pt-16 pb-8 text-center animate-fade-up sm:pt-20">
      <Eyebrow as="p">Checkout</Eyebrow>
      <h1 className="display mt-6 text-balance text-5xl text-ink sm:text-7xl">
        Nearly there
      </h1>
      {children}
    </section>
  );
}
