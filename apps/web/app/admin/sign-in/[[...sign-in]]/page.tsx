import { SignIn } from '@clerk/nextjs';

export default function AdminSignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-10">
      <SignIn forceRedirectUrl="/admin" />
    </main>
  );
}
