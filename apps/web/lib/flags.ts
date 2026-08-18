import 'server-only';
import type { FlagKey } from '@joice/core/schemas';

/**
 * Server-side base URL for the API. In prod NEXT_PUBLIC_API_URL is '' (the
 * browser hits the shared origin), which a server component can't fetch — so
 * the web task sets API_URL_INTERNAL to reach the API directly.
 */
const serverApiUrl =
  process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** How long one read of the flag map is trusted before the API is asked again. */
const TTL_MS = 30_000;
/** After a failed read, retry sooner instead of trusting a stale answer for the full TTL. */
const ERROR_TTL_MS = 5_000;

let cache: { value: Record<string, boolean>; expiresAt: number } | undefined;
let inflight: Promise<Record<string, boolean>> | undefined;

async function fetchFlags(): Promise<Record<string, boolean> | undefined> {
  try {
    // Bypass Next's fetch data cache on purpose: this module keeps its own
    // clock (below), which behaves the same in dev and prod and under Bun.
    const res = await fetch(`${serverApiUrl}/api/flags`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    return (await res.json()) as Record<string, boolean>;
  } catch {
    return undefined;
  }
}

/**
 * Feature flags for server components: `{ key: enabled }`, cached in this
 * process for ~30s and shared by every request in that window, so a busy page
 * costs the API two reads a minute, not one per visitor. Stacked on the API's
 * own ~30s cache, a toggle in /admin/flags reaches a server-rendered page
 * within about a minute.
 *
 * Fails safe: a read that errors keeps the last good map (a blip must not
 * flip every gated page to "off"), and with no good map yet returns `{}`,
 * where a flag that can't be read behaves as off.
 *
 * Client components should use `usePublicFlags()` from @joice/api-client.
 */
export async function getFlags(): Promise<Record<string, boolean>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  inflight ??= fetchFlags()
    .then((fresh) => {
      const value = fresh ?? cache?.value ?? {};
      cache = { value, expiresAt: Date.now() + (fresh ? TTL_MS : ERROR_TTL_MS) };
      return value;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

/** Convenience single-flag check for server components. */
export async function flagEnabled(key: FlagKey): Promise<boolean> {
  const flags = await getFlags();
  return flags[key] === true;
}
