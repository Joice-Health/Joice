import 'server-only';

/**
 * Server-side base URL for the API. In prod NEXT_PUBLIC_API_URL is '' (the
 * browser hits the shared origin), which a server component can't fetch — so
 * the web task sets API_URL_INTERNAL to reach the API directly.
 */
const serverApiUrl =
  process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Feature flags for server components, revalidated every 30s. Fails open to
 * an empty map — a flag that can't be read behaves as "off".
 *
 * Client components should use `usePublicFlags()` from @joice/api-client.
 */
export async function getFlags(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch(`${serverApiUrl}/api/flags`, { next: { revalidate: 30 } });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Convenience single-flag check for server components. */
export async function flagEnabled(key: string): Promise<boolean> {
  const flags = await getFlags();
  return flags[key] === true;
}
