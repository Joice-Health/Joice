import {
  careAreaLabel,
  SHOP_CATALOG,
  type CareAreaSlug,
  type CatalogEntry,
} from '@joice/utils';
import type { CatalogItem, CatalogPort } from '@joice/brain';

/**
 * CatalogPort over the CarePortals PUBLIC API: the same anonymous,
 * organization-scoped surface the storefront uses (no secret exists to
 * protect). The port sells ONLY the curated shelf: the shared SHOP_CATALOG
 * decides which products exist, under which slug and name; CarePortals
 * supplies live price and availability, merged by careportalsId.
 *
 * Matching is local over the curated entries (name, slug, dose line, tagline,
 * care areas); the literal query 'all' browses the whole shelf. A miss
 * returns empty, honestly: "do you sell ozempic" must never answer with the
 * full range. The full product list is fetched once per TTL and served stale
 * on upstream failure; cold and dark together THROWS, which the tool loop
 * converts into an error result the model can recover from ("couldn't check")
 * rather than a false "we don't sell that".
 */

export interface CareportalsCatalogConfig {
  organization: string;
  baseUrl?: string;
  cacheTtlMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface LiveProduct {
  _id: string;
  subLabel?: string;
  price: number;
  currency?: string;
  status?: string;
  isSubscription?: boolean;
}

/** The port plus a test/debug handle. */
export interface CareportalsCatalog extends CatalogPort {
  /** Force the next search to refetch (tests). */
  invalidate(): void;
}

export function createCareportalsCatalog(config: CareportalsCatalogConfig): CareportalsCatalog {
  const {
    organization,
    baseUrl = 'https://public-api.portals.care',
    cacheTtlMs = 5 * 60_000,
    timeoutMs = 1500,
    fetchImpl = fetch,
    now = Date.now,
  } = config;

  let cache: { byId: Map<string, LiveProduct>; expiresAt: number } | null = null;

  async function liveProducts(): Promise<Map<string, LiveProduct>> {
    if (cache && cache.expiresAt > now()) return cache.byId;
    try {
      const res = await fetchImpl(`${baseUrl}/v2/products`, {
        headers: { organization },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`careportals products ${res.status}`);
      const body = (await res.json()) as unknown;
      const rows = Array.isArray(body)
        ? (body as LiveProduct[])
        : (((body as { data?: unknown })?.data ?? []) as LiveProduct[]);
      const byId = new Map<string, LiveProduct>();
      for (const row of rows) {
        if (row && typeof row._id === 'string') byId.set(row._id, row);
      }
      cache = { byId, expiresAt: now() + cacheTtlMs };
      return byId;
    } catch (error) {
      console.warn(`careportals catalogue fetch failed (${(error as Error).message?.slice(0, 120)})`);
      // Stale beats dark; dark with nothing known must not read as "we don't
      // sell that", so it propagates as a tool error instead.
      if (cache) return cache.byId;
      throw new Error('catalogue temporarily unreachable');
    }
  }

  function toItem(entry: CatalogEntry, live: LiveProduct | undefined): CatalogItem {
    const active = live?.status === 'active';
    return {
      id: entry.careportalsId,
      slug: entry.slug,
      name: entry.name,
      // The dose line is live when present (upstream labels dosing), the
      // one-line description is the curated tagline: approved editorial copy.
      ...(live?.subLabel ? { subLabel: live.subLabel } : {}),
      description: entry.tagline,
      careArea: entry.areas[0],
      ...(active && typeof live?.price === 'number'
        ? {
            price: live.price,
            currency: live.currency ?? 'USD',
            isSubscription: live.isSubscription ?? false,
          }
        : {}),
      available: active,
    };
  }

  /** Search tokens: lowercase alphanumeric runs, 2+ chars so "b12" counts. */
  function tokens(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((t) => t.length >= 2);
  }

  function entryHaystack(entry: CatalogEntry): string {
    const areas = entry.areas
      .map((a) => `${a} ${careAreaLabel(a as CareAreaSlug)}`)
      .join(' ');
    return `${entry.name} ${entry.slug} ${entry.tagline} ${areas}`.toLowerCase();
  }

  return {
    async search(query: string, limit: number): Promise<CatalogItem[]> {
      const live = await liveProducts();
      const browse = query.trim().toLowerCase() === 'all';
      const matched = browse
        ? [...SHOP_CATALOG]
        : SHOP_CATALOG.map((entry) => {
            const hay = entryHaystack(entry);
            const score = tokens(query).filter((t) => hay.includes(t)).length;
            return { entry, score };
          })
            .filter((m) => m.score > 0)
            .sort((a, b) => b.score - a.score || (a.entry.rank ?? 99) - (b.entry.rank ?? 99))
            .map((m) => m.entry);

      return matched.slice(0, limit).map((entry) => toItem(entry, live.get(entry.careportalsId)));
    },

    invalidate() {
      // Expire, never erase: the stale copy is the failure fallback, and
      // forcing a refetch must not also forfeit it.
      if (cache) cache.expiresAt = 0;
    },
  };
}
