import { describe, expect, test } from 'bun:test';
import { createCareportalsCatalog } from './careportals-catalog';

/**
 * The catalogue adapter against a scripted fetch. The invariants: it sells
 * ONLY the curated shelf; a miss is empty (never the full range); prices are
 * the live DOLLAR values or absent; stale beats dark; cold-and-dark throws
 * so the tool loop reports an error instead of a false "we don't sell that".
 */

const GLUTATHIONE_ID = '6a7a18a99d94da87b1d1d956';
const NAD_ID = '6a7a19369d94da87b1d1d983';

function fetchOf(rows: unknown, status = 200) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify(rows), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const liveRows = [
  { _id: GLUTATHIONE_ID, subLabel: '200mg/mL, 30-day supply', price: 59, currency: 'USD', status: 'active', isSubscription: true },
  { _id: NAD_ID, price: 98, status: 'active', isSubscription: true },
  { _id: 'ffffffffffffffffffffffff', price: 999, status: 'active' }, // not curated: never sold
];

const config = { organization: 'joicehealth_com' };

describe('careportals catalogue', () => {
  test('matches a product by name with live price and the curated copy', async () => {
    const port = createCareportalsCatalog({ ...config, fetchImpl: fetchOf(liveRows).impl });
    const items = await port.search('glutathione', 5);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.slug).toBe('glutathione');
    expect(item.price).toBe(59);
    expect(item.isSubscription).toBe(true);
    expect(item.subLabel).toBe('200mg/mL, 30-day supply');
    expect(item.description).toBeTruthy(); // the curated tagline
    expect(item.available).toBe(true);
  });

  test('themes match through care areas; uncurated live rows are never sold', async () => {
    const port = createCareportalsCatalog({ ...config, fetchImpl: fetchOf(liveRows).impl });
    const items = await port.search('energy', 5);
    expect(items.map((i) => i.slug)).toContain('nad-plus');
    expect(items.every((i) => i.id !== 'ffffffffffffffffffffffff')).toBe(true);
  });

  test("the literal 'all' browses the whole shelf, capped by limit", async () => {
    const port = createCareportalsCatalog({ ...config, fetchImpl: fetchOf(liveRows).impl });
    expect((await port.search('all', 100)).length).toBeGreaterThanOrEqual(8);
    expect(await port.search('all', 3)).toHaveLength(3);
  });

  test('a miss is empty, never the full range', async () => {
    const port = createCareportalsCatalog({ ...config, fetchImpl: fetchOf(liveRows).impl });
    expect(await port.search('ozempic', 5)).toEqual([]);
  });

  test('a curated entry with no live row is unavailable and priceless, so it is never carded', async () => {
    const port = createCareportalsCatalog({ ...config, fetchImpl: fetchOf(liveRows).impl });
    const items = await port.search('sermorelin', 5);
    expect(items).toHaveLength(1);
    expect(items[0]!.available).toBe(false);
    expect(items[0]!.price).toBeUndefined();
  });

  test('the list is cached; stale beats dark; cold and dark throws', async () => {
    let fail = false;
    const calls: string[] = [];
    const impl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (fail) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify(liveRows), { status: 200 });
    }) as typeof fetch;

    const warm = createCareportalsCatalog({ ...config, fetchImpl: impl });
    await warm.search('glutathione', 5);
    await warm.search('nad', 5);
    expect(calls).toHaveLength(1); // cached

    fail = true;
    warm.invalidate();
    const stale = await warm.search('glutathione', 5);
    expect(stale[0]!.price).toBe(59); // stale served on failure

    const cold = createCareportalsCatalog({ ...config, fetchImpl: impl });
    await expect(cold.search('glutathione', 5)).rejects.toThrow('unreachable');
  });
});
