import { Eyebrow } from '@/components/ui/eyebrow';

/**
 * Clinician/expert profile cards. Placeholder slots until the real roster +
 * headshots land (content pass): skeleton name bar, credentials, role.
 */
const PROFILES = [0, 1, 2, 3];

export function Profiles() {
  return (
    <section className="border-t border-line/60 py-16 sm:py-20">
      <Eyebrow>Clinician & expert profiles</Eyebrow>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {PROFILES.map((i) => (
          <div
            key={i}
            className="flex flex-col items-center rounded-card bg-surface px-5 py-8 text-center shadow-[0_18px_44px_-28px_rgba(40,35,25,0.45)]"
          >
            {/* Headshot slot */}
            <span className="h-20 w-20 rounded-full bg-gradient-to-br from-card-to to-brand-200" />
            {/* Name */}
            <span className="mt-5 block h-2.5 w-28 rounded-full bg-line" aria-hidden />
            <span className="sr-only">Clinician name coming soon</span>
            {/* Credentials + role */}
            <span className="mt-4 font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
              Credentials
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
              Role
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
