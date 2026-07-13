/**
 * Placeholder site content driving the Explore → Care-area → PDP drill-down and
 * the Learn hub, until real catalog/content lands (content pass / CMS decision).
 * Names are deliberately generic protocol labels — no clinical claims — and all
 * pricing renders as "$—" (display-only per the IA; real pricing is gated on
 * counsel/business review).
 */

export interface CareArea {
  slug: string;
  name: string;
  blurb: string;
}

export interface Product {
  slug: string;
  name: string;
  area: string; // CareArea slug
  tagline: string;
  hasSupportSupplement: boolean;
}

export interface Article {
  slug: string;
  title: string;
  topic: string;
  excerpt: string;
}

export const CARE_AREAS: CareArea[] = [
  {
    slug: 'weight-metabolic',
    name: 'Weight & metabolic',
    blurb: 'Metabolic health, appetite regulation, and sustainable weight protocols.',
  },
  {
    slug: 'body-comp-recovery',
    name: 'Body comp / recovery',
    blurb: 'Lean mass, tissue repair, and recovery support.',
  },
  {
    slug: 'beauty-skin',
    name: 'Beauty / skin',
    blurb: 'Skin quality, collagen support, and healthy aging.',
  },
  {
    slug: 'energy',
    name: 'Energy',
    blurb: 'Cellular energy, daytime drive, and resilience.',
  },
  {
    slug: 'stress-sleep',
    name: 'Stress & sleep',
    blurb: 'Deeper sleep, calmer baseline, better mornings.',
  },
];

export const PRODUCTS: Product[] = [
  {
    slug: 'metabolic-protocol',
    name: 'Metabolic Protocol',
    area: 'weight-metabolic',
    tagline: 'Clinician-guided metabolic support.',
    hasSupportSupplement: true,
  },
  {
    slug: 'appetite-protocol',
    name: 'Appetite Regulation Protocol',
    area: 'weight-metabolic',
    tagline: 'Steady appetite signals, without the whiplash.',
    hasSupportSupplement: false,
  },
  {
    slug: 'recovery-protocol',
    name: 'Recovery Protocol',
    area: 'body-comp-recovery',
    tagline: 'Repair and rebuild between sessions.',
    hasSupportSupplement: true,
  },
  {
    slug: 'lean-mass-protocol',
    name: 'Lean Mass Protocol',
    area: 'body-comp-recovery',
    tagline: 'Support for composition goals, held to clinical guardrails.',
    hasSupportSupplement: false,
  },
  {
    slug: 'skin-protocol',
    name: 'Skin Quality Protocol',
    area: 'beauty-skin',
    tagline: 'Skin health from the inside.',
    hasSupportSupplement: false,
  },
  {
    slug: 'energy-protocol',
    name: 'Cellular Energy Protocol',
    area: 'energy',
    tagline: 'Energy that shows up in the afternoon too.',
    hasSupportSupplement: true,
  },
  {
    slug: 'sleep-protocol',
    name: 'Sleep Protocol',
    area: 'stress-sleep',
    tagline: 'Deeper nights, calmer days.',
    hasSupportSupplement: false,
  },
];

export const ARTICLES: Article[] = [
  {
    slug: 'peptides-101',
    title: 'Peptides 101: what they are and how they work',
    topic: 'Foundations',
    excerpt: 'A plain-language primer on peptide signaling — no hype, no shortcuts.',
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

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getProductsByArea(areaSlug: string): Product[] {
  return PRODUCTS.filter((p) => p.area === areaSlug);
}

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
