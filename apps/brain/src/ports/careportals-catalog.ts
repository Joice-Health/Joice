import { careAreaLabel, SHOP_CATALOG, type CatalogEntry } from '@joice/utils';
import type { CatalogItem, CatalogPort } from '@joice/brain';

/**
 * CatalogPort over the CarePortals PUBLIC API: the same anonymous,
 * organization-scoped surface the storefront uses (no secret exists to
 * protect). The port sells ONLY the curated shelf: the shared SHOP_CATALOG
 * decides which products exist, under which slug and name; CarePortals
 * supplies live price and availability, merged by careportalsId.
 *
 * Matching is local over the curated entries (name, slug, tagline, care
 * areas); the literal query 'all' browses the whole shelf. A miss
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
  let inflight: Promise<Map<string, LiveProduct>> | null = null;
  /** After a failure with stale data, wait this long before retrying upstream. */
  const errorTtlMs = 5_000;

  function liveProducts(): Promise<Map<string, LiveProduct>> {
    if (cache && cache.expiresAt > now()) return Promise.resolve(cache.byId);
    // Single-flight: parallel tool calls in one round must not stampede.
    inflight ??= fetchProducts().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function fetchProducts(): Promise<Map<string, LiveProduct>> {
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
      // sell that", so it propagates as a tool error instead. A short error
      // TTL keeps an outage from costing the full timeout on every call.
      if (cache) {
        cache.expiresAt = now() + errorTtlMs;
        return cache.byId;
      }
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
      ...(active && typeof live?.price === 'number' && live.price > 0
        ? {
            price: live.price,
            currency: live.currency ?? 'USD',
            isSubscription: live.isSubscription ?? false,
          }
        : {}),
      available: active,
    };
  }

  /**
   * Matching is EXACT tokens, never substrings: review proved substring
   * scoring made "do you sell ozempic" match naltrexone because "do" sits
   * inside "Low-dose". Tokens are lowercase alphanumeric runs; conversational
   * filler is stopworded out so a fluffy query cannot match on connectives.
   */
  const STOPWORDS = new Set([
    'the', 'and', 'for', 'you', 'your', 'have', 'has', 'does', 'do', 'did',
    'can', 'could', 'would', 'should', 'sell', 'selling', 'buy', 'order',
    'get', 'offer', 'carry', 'stock', 'anything', 'something', 'about',
    'what', 'which', 'that', 'this', 'with', 'are', 'is', 'much', 'cost',
    'price', 'how', 'any', 'there', 'products', 'product',
  ]);

  function tokens(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  }

  function entryTokens(entry: CatalogEntry): Set<string> {
    const areas = entry.areas.map((a) => `${a} ${careAreaLabel(a)}`).join(' ');
    const hay = `${entry.name} ${entry.slug} ${entry.tagline} ${areas}`;
    // Haystack side skips the stopword filter: matching "dose" against a
    // tagline is fine; the filter exists to stop QUERY filler from scoring.
    return new Set(
      hay
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3),
    );
  }

  /**
   * Browse order: one product per care area first (rank order within), then
   * the rest. Without this, 'all' always shelved the same weight-heavy first
   * rows of the map and some areas could never appear on a capped shelf.
   */
  function browseOrder(): CatalogEntry[] {
    const byRank = [...SHOP_CATALOG].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const seen = new Set<string>();
    const first: CatalogEntry[] = [];
    const rest: CatalogEntry[] = [];
    for (const entry of byRank) {
      const area = entry.areas[0];
      if (seen.has(area)) rest.push(entry);
      else {
        seen.add(area);
        first.push(entry);
      }
    }
    return [...first, ...rest];
  }

  return {
    async search(query: string, limit: number): Promise<CatalogItem[]> {
      const live = await liveProducts();
      const browse = query.trim().toLowerCase() === 'all';
      const matched = browse
        ? browseOrder()
        : SHOP_CATALOG.map((entry) => {
            const hay = entryTokens(entry);
            const score = tokens(query).filter((t) => hay.has(t)).length;
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
