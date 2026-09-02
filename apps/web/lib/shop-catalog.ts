/**
 * The production catalogue map (docs/shop/01-commerce.md section 4): the one
 * place that decides WHICH products the shop sells, under which slug and care
 * areas, with what editorial copy. Live CarePortals data supplies name, price
 * and availability per render (shop-catalog.server.ts); nothing here
 * duplicates a price. An entry whose product is missing or disabled upstream
 * degrades to "not shown" on shelves and 404 on its PDP.
 *
 * Why local: CarePortals' category surface is unusable (GET
 * /v2/products/categories answers 400, verified live 2026-09-01, spike log in
 * the brief) and the org catalogue holds 29 noisy rows including disabled, $0
 * and follow-up variants. Curation is the defense.
 *
 * CURATION CHECKPOINT (Shaun): the variant ids below are provisional picks
 * from the live catalogue, chosen as each family's natural entry preparation.
 * Confirm or swap before this shelf goes live. Flagged choices:
 * - Tirzepatide/B12 sells the non-subscription ladder's "Initiation (Rung 1)"
 *   at $108; the older subscription rows ("- Starting", "- Maintenance", the
 *   $0 mislabeled one) and the "(Followup)" variants are deliberately absent.
 * - Lipo-B has two live rows with the same subLabel at $38 and $114; the $38
 *   row is picked and the $114 duplicate needs an upstream look.
 * - NAD+ sells the $98 6-week preparation over the $196 1-month one.
 * - PT-141 (men's and women's) is parked: no sexual-health care area exists
 *   and adding one is a product decision (care-areas.ts).
 */
import type { CareAreaSlug } from '@joice/utils';

export interface CatalogEntry {
  /**
   * URL segment for /shop/[slug]. Unique; never a Mongo id, never a care-area
   * slug, never `cart` or `checkout` (the segment is shared with category
   * pages and the cart/checkout routes; the tests enforce all three).
   */
  slug: string;
  /** The CarePortals `_id` of the exact sellable variant this PDP sells. */
  careportalsId: string;
  /** Care areas it merchandises under; the first is primary (breadcrumb, canonical shelf). */
  areas: readonly [CareAreaSlug, ...CareAreaSlug[]];
  /**
   * The display name of record, used on every surface (upstream labels are
   * inconsistent: "Tirzepatide/B12", "GHK-CU Biocosmetic Cream"). The live
   * label still travels with the merchandised product for reference.
   */
  name: string;
  /** One-line promise for rows and tiles. Editorial, local, no clinical claims. */
  tagline: string;
  /** PDP copy blocks. Approved copy only; no claims beyond it. */
  copy: {
    whatItIs: string;
    science?: string;
    dosing?: string;
  };
  /** ImageSlot hue so neighbouring organic fields differ. */
  hue?: number;
  /** Shelf order within a category, lower first. */
  rank?: number;
}

export const SHOP_CATALOG: readonly CatalogEntry[] = [
  {
    slug: 'tirzepatide-b12',
    careportalsId: '6a847e8f0537e0d78a3a097c',
    areas: ['weight-metabolic'],
    name: 'Tirzepatide / B12',
    tagline: 'Clinician-guided metabolic support, one step at a time.',
    copy: {
      whatItIs:
        'A compounded preparation pairing tirzepatide, a dual GIP and GLP-1 receptor agonist, with vitamin B12. Prescribed in stepped doses: your clinician starts you at the initiation dose and adjusts from there based on how you respond.',
      dosing:
        'Starts at the initiation dose. Your prescriber reviews your progress before any step up; you never adjust the dose on your own.',
    },
    hue: 128,
    rank: 1,
  },
  {
    slug: 'naltrexone',
    name: 'Naltrexone',
    careportalsId: '6a7a198c9d94da87b1d1d992',
    areas: ['weight-metabolic'],
    tagline: 'Low-dose capsules, steady appetite signals.',
    copy: {
      whatItIs:
        'Low-dose naltrexone in a monthly supply of capsules, prescribed where a clinician judges it appropriate as part of a metabolic protocol.',
    },
    hue: 96,
    rank: 2,
  },
  {
    slug: 'lipo-b',
    name: 'Lipo-B',
    careportalsId: '6a7a18253c411544080c25b8',
    areas: ['weight-metabolic'],
    tagline: 'B12 and lipotropics in one monthly protocol.',
    copy: {
      whatItIs:
        'An injectable blend of vitamin B12 with methionine, inositol and choline (MIC), supplied monthly as part of a clinician-set protocol.',
    },
    hue: 60,
    rank: 3,
  },
  {
    slug: 'nad-plus',
    careportalsId: '6a7a19369d94da87b1d1d983',
    areas: ['energy'],
    name: 'NAD+',
    tagline: 'Cellular energy support, clinician-set.',
    copy: {
      whatItIs:
        'Nicotinamide adenine dinucleotide (NAD+) as an injectable protocol. NAD+ is a coenzyme central to cellular energy metabolism; levels decline with age.',
    },
    hue: 150,
    rank: 1,
  },
  {
    slug: 'sermorelin',
    name: 'Sermorelin',
    careportalsId: '6a6cadd7b68fb8c53595be30',
    areas: ['body-comp-recovery'],
    tagline: 'Recovery support on a clinical cadence.',
    copy: {
      whatItIs:
        'Sermorelin, a growth hormone releasing hormone analogue, prepared as a six-week injectable protocol under prescriber oversight.',
    },
    hue: 128,
    rank: 1,
  },
  {
    slug: 'tesamorelin',
    name: 'Tesamorelin',
    careportalsId: '6a6cadd7b68fb8c53595be32',
    areas: ['body-comp-recovery'],
    tagline: 'Composition support, held to clinical guardrails.',
    copy: {
      whatItIs:
        'Tesamorelin, a growth hormone releasing factor analogue, prepared as a six-week injectable protocol and prescribed only where a clinician judges it appropriate.',
    },
    hue: 96,
    rank: 2,
  },
  {
    slug: 'glutathione',
    name: 'Glutathione',
    careportalsId: '6a7a18a99d94da87b1d1d956',
    areas: ['beauty-skin', 'energy'],
    tagline: 'The body’s master antioxidant, made simple.',
    copy: {
      whatItIs:
        'Glutathione, a tripeptide of glutamine, cysteine and glycine, supplied as a monthly injectable protocol. It participates in antioxidant defense and is found in nearly every cell.',
    },
    hue: 60,
    rank: 2,
  },
  {
    slug: 'ghk-cu-cream',
    careportalsId: '6a7a18253c411544080c25ba',
    areas: ['beauty-skin'],
    name: 'GHK-Cu Cream',
    tagline: 'Copper peptide skincare, monthly.',
    copy: {
      whatItIs:
        'A topical cream built around GHK-Cu, a naturally occurring copper peptide studied for its role in skin maintenance, supplied as a monthly protocol.',
    },
    hue: 150,
    rank: 1,
  },
];

/** The entry a /shop/[slug] URL names, or undefined. */
export function catalogEntryBySlug(slug: string): CatalogEntry | undefined {
  return SHOP_CATALOG.find((e) => e.slug === slug);
}

/** Rank-sorted entries merchandised under a care area (primary or secondary). */
export function catalogEntriesByArea(area: CareAreaSlug): CatalogEntry[] {
  return SHOP_CATALOG.filter((e) => e.areas.includes(area)).sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
  );
}
