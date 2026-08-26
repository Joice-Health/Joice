import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { Eyebrow } from '@/components/ui/eyebrow';

export const metadata: Metadata = { title: 'Sign in · Joice' };

/** Member sign-in, in-app. On success: /welcome (or wherever redirect_url points). */
export default function SignInPage() {
  return (
    <div className="mx-auto w-full max-w-2xl py-12 sm:py-20">
      <Eyebrow>Sign in</Eyebrow>
      <h1 className="display mt-6 text-balance text-4xl text-ink sm:text-6xl">Welcome back.</h1>
      <div className="mt-10 flex justify-start">
        <SignIn forceRedirectUrl="/welcome" signUpUrl="/sign-up" />
      </div>
    </div>
  );
}
