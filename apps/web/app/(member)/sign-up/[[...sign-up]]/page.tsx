import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { Eyebrow } from '@/components/ui/eyebrow';

export const metadata: Metadata = { title: 'Create your account · Joice' };

/**
 * Member sign-up, in-app (never Clerk's hosted portal). Reached from the end
 * of the intake; on success Clerk sends the new member to /welcome, which
 * claims the intake session for the account. Email verification is on in the
 * Clerk dashboard: the api refuses to link an intake to an unverified email.
 */
export default function SignUpPage() {
  return (
    <div className="mx-auto w-full max-w-2xl py-12 sm:py-20">
      <Eyebrow>Create your account</Eyebrow>
      <h1 className="display mt-6 text-balance text-4xl text-ink sm:text-6xl">Save your answers.</h1>
      <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted">
        Your account keeps your intake, lets a licensed clinician review it with you, and is where your
        protocol will live.
      </p>
      <div className="mt-10 flex justify-start">
        <SignUp forceRedirectUrl="/welcome" signInUrl="/sign-in" />
      </div>
    </div>
  );
}
