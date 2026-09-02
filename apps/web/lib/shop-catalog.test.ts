import { describe, expect, test } from 'bun:test';
import { CARE_AREA_SLUGS } from '@joice/utils';
import { SHOP_CATALOG, catalogEntriesByArea, catalogEntryBySlug } from './shop-catalog';

describe('SHOP_CATALOG', () => {
  test('slugs are unique and never look like Mongo ids', () => {
    const slugs = SHOP_CATALOG.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug).not.toMatch(/^[0-9a-f]{24}$/);
    }
  });

  test('careportals ids are unique 24-hex ids', () => {
    const ids = SHOP_CATALOG.map((e) => e.careportalsId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{24}$/);
  });

  test('every area is a real care-area slug', () => {
    for (const entry of SHOP_CATALOG) {
      expect(entry.areas.length).toBeGreaterThan(0);
      for (const area of entry.areas) {
        expect(CARE_AREA_SLUGS).toContain(area);
      }
    }
  });

  test('every entry carries a name, a tagline and a what-it-is', () => {
    for (const entry of SHOP_CATALOG) {
      expect(entry.name.trim().length).toBeGreaterThan(0);
      expect(entry.tagline.trim().length).toBeGreaterThan(0);
      expect(entry.copy.whatItIs.trim().length).toBeGreaterThan(0);
    }
  });

  test('no slug collides with a care area (categories share the /shop/[slug] segment)', () => {
    for (const entry of SHOP_CATALOG) {
      expect(CARE_AREA_SLUGS).not.toContain(entry.slug);
    }
  });

  test('the cart and checkout routes are reserved words in the segment', () => {
    const reserved = ['cart', 'checkout'];
    for (const entry of SHOP_CATALOG) {
      expect(reserved).not.toContain(entry.slug);
    }
  });

  test('lookups find by slug and sort a shelf by rank', () => {
    expect(catalogEntryBySlug('glutathione')?.careportalsId).toBe('6a7a18a99d94da87b1d1d956');
    expect(catalogEntryBySlug('nope')).toBeUndefined();
    const shelf = catalogEntriesByArea('weight-metabolic');
    expect(shelf.map((e) => e.slug)).toEqual(['tirzepatide-b12', 'naltrexone', 'lipo-b']);
    const beauty = catalogEntriesByArea('beauty-skin');
    expect(beauty[0]?.slug).toBe('ghk-cu-cream');
    expect(beauty.some((e) => e.slug === 'glutathione')).toBe(true);
  });

  test('stress-sleep is legitimately empty for now', () => {
    expect(catalogEntriesByArea('stress-sleep')).toEqual([]);
  });
});
