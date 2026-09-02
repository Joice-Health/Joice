import type { MetadataRoute } from 'next';

/**
 * The sitemap carries only /states: the storefront and legal groups are
 * deliberately noindexed (Shaun's call, sc-251), but the jurisdiction
 * disclosure must be indexable and listed for the LegitScript review
 * (sc-275). Served at /sitemap.xml, outside the middleware matcher, so it
 * needs no PUBLIC_PATHS entry.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://joicehealth.com/states',
      lastModified: new Date('2026-09-01'),
      changeFrequency: 'monthly',
    },
  ];
}
