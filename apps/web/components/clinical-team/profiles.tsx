import { Index } from '@joice/ui';
import { Eyebrow } from '@/components/ui/eyebrow';

/**
 * Clinician/expert profiles. Placeholder rows until the real roster and
 * headshots land (content pass): headshot slot, name bar, credentials, role.
 */
const PROFILES = [0, 1, 2, 3];

export function Profiles() {
  return (
    <section className="border-t border-line py-16 sm:py-20">
      <Eyebrow as="h2">Clinician & expert profiles</Eyebrow>
      <ol className="mt-8 grid border-t border-line sm:grid-cols-2">
        {PROFILES.map((i) => (
          <li
            key={i}
            className="flex items-center gap-6 border-b border-line py-6 sm:odd:pr-8 sm:even:pl-8"
          >
            {/* Headshot slot */}
            <span className="h-16 w-16 shrink-0 rounded-full border border-line bg-stone/40" />
            <div className="min-w-0 flex-1">
              <span className="mono-label text-muted">
                <Index n={i + 1} />
              </span>
              {/* Name */}
              <span className="mt-2 block h-2.5 w-28 rounded-full bg-line" aria-hidden />
              <span className="sr-only">Clinician name coming soon</span>
              {/* Credentials + role */}
              <span className="mono-label mt-3 block text-muted">Credentials · Role</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
