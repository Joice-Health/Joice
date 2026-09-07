/**
 * Editorial site content: the care-area blurbs the explore and shop pages
 * share, and the Learn hub's articles. The product layer that used to live
 * here (static PRODUCTS with "$—" prices) is gone: the shop catalogue map
 * (lib/shop-catalog.ts) is the one source of what Joice sells, and every
 * surface that lists products reads it.
 */

import { CARE_AREAS as CANONICAL_CARE_AREAS } from '@joice/utils';

export interface CareArea {
  slug: string;
  name: string;
  blurb: string;
}

export interface Article {
  slug: string;
  title: string;
  topic: string;
  excerpt: string;
}

// Slugs and names are canonical in @joice/utils (care-areas.ts), shared with
// the companion's capture and the intake's goal question; the blurbs are site
// copy and live here.
const CARE_AREA_BLURBS: Record<string, string> = {
  'weight-metabolic': 'Metabolic health, appetite regulation, and sustainable weight protocols.',
  'body-comp-recovery': 'Lean mass, tissue repair, and recovery support.',
  'beauty-skin': 'Skin quality, collagen support, and healthy aging.',
  energy: 'Cellular energy, daytime drive, and resilience.',
  'stress-sleep': 'Deeper sleep, calmer baseline, better mornings.',
};

export const CARE_AREAS: CareArea[] = CANONICAL_CARE_AREAS.map((a) => ({
  slug: a.slug,
  name: a.label,
  blurb: CARE_AREA_BLURBS[a.slug] ?? '',
}));

export const ARTICLES: Article[] = [
  {
    slug: 'peptides-101',
    title: 'Peptides 101: what they are and how they work',
    topic: 'Foundations',
    excerpt: 'A plain-language primer on peptide signaling. No hype, no shortcuts.',
  },
  {
    slug: 'sourcing-and-testing',
    title: 'How sourcing & testing works at Joice',
    topic: 'Standards',
    excerpt: 'What "tested with proof" actually means: chain of custody, assays, and CoAs.',
  },
  {
    slug: 'reading-your-labs',
    title: 'Reading your labs before a protocol',
    topic: 'Clinical',
    excerpt: 'What your clinician looks for, and why some numbers say "not yet."',
  },
  {
    slug: 'protocols-vs-products',
    title: 'Protocols vs. one-off products',
    topic: 'Foundations',
    excerpt: 'Why we prescribe protocols with oversight instead of shipping bottles.',
  },
];

export function getCareArea(slug: string): CareArea | undefined {
  return CARE_AREAS.find((a) => a.slug === slug);
}

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
