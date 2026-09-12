import { z } from 'zod';
import { tierAtLeast } from '@joice/utils';
import type { CatalogItem } from '../ports';
import { invalidInput, type BrainTool } from './types';

// Spec and zod schema describe the same contract and move together.
const searchCatalogueInput = z.object({ query: z.string().trim().min(1).max(200) });

const CATALOGUE_LIMIT = 5;

/** One resultText line: approved name and copy plus live commerce facts. */
function productLine(item: CatalogItem): string {
  const price =
    item.price !== undefined
      ? `${item.currency === 'USD' || !item.currency ? '$' : `${item.currency} `}${item.price}${item.isSubscription ? '/mo' : ''}`
      : 'price unavailable';
  const facts = `${price}, ${item.available ? 'available' : 'not currently available'}`;
  const copy = [item.subLabel, item.description].filter(Boolean).join('; ');
  return `- ${item.name} (${facts})${copy ? ` - ${copy}` : ''}`;
}

export const searchCatalogueTool: BrainTool = {
  label: 'Checking the catalogue…',
  settingKey: 'toolSearchCatalogue',
  spec: {
    name: 'search_catalogue',
    description:
      'Search the Joice product catalogue for what Joice sells, current prices, and ' +
      'availability. Call this when the member asks what products exist, what something ' +
      'costs, or whether it can be ordered. Use a product name or a theme (e.g. "energy"), ' +
      'or the exact query "all" when they ask about the whole range. Never state or invent ' +
      'product facts without calling it.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Product name or theme, e.g. "sleep"; the literal "all" for the full range.',
        },
      },
      required: ['query'],
    },
  },
  create(deps) {
    return async (raw) => {
      const input = searchCatalogueInput.safeParse(raw);
      if (!input.success) return invalidInput('{ "query": string }');
      const items = await deps.catalog.search(input.data.query, CATALOGUE_LIMIT);
      if (items.length === 0) {
        return {
          resultText:
            'The catalogue has no matching products. Do not invent products or suggest we ' +
            'might carry it; say plainly that this is not something Joice sells today.',
        };
      }

      // The card registry: slug-deduped, priced items only (a curated entry
      // whose live commerce row is dark has no trustworthy price and is
      // mentioned in text but never carded).
      for (const item of items) {
        if (item.price === undefined) continue;
        if (deps.products.some((p) => p.slug === item.slug)) continue;
        deps.products.push({
          slug: item.slug,
          name: item.name,
          ...(item.subLabel ? { subLabel: item.subLabel } : {}),
          ...(item.careArea ? { careArea: item.careArea } : {}),
          price: item.price,
          currency: item.currency ?? 'USD',
          isSubscription: item.isSubscription ?? false,
          available: item.available,
        });
      }

      // The tier variant: ordering is only mentioned to signed-in users and
      // up. Leads and visitors get facts and availability; the interface, not
      // the model, is where they get invited to create an account. Both
      // footers are phrased as facts, not prohibitions: toolResult text can
      // leak into an answer, and a leaked fact reads as an answer.
      const canOrder = tierAtLeast(deps.audience, 'user');
      const footer = canOrder
        ? '\n\nThese can be ordered from the shop; offer to point them there if they want to start.'
        : '\n\nOrdering opens once they have an account; share product facts and availability only.';
      return {
        resultText:
          `Products (a product card with these appears under your answer automatically; ` +
          `speak naturally rather than repeating raw price lists):\n${items
            .map(productLine)
            .join('\n')}${footer}`,
      };
    };
  },
};
