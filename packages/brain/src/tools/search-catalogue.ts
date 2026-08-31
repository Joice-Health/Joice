import { z } from 'zod';
import { tierAtLeast } from '@joice/utils';
import { invalidInput, type BrainTool } from './types';

// Spec and zod schema describe the same contract and move together.
const searchCatalogueInput = z.object({ query: z.string().trim().min(1).max(200) });

const CATALOGUE_LIMIT = 5;

export const searchCatalogueTool: BrainTool = {
  label: 'Checking the catalogue…',
  settingKey: 'toolSearchCatalogue',
  spec: {
    name: 'search_catalogue',
    description:
      'Search the Joice product catalogue for what Joice sells and current availability. ' +
      'Call this when the member asks what products exist, what something costs, or whether ' +
      'it can be ordered. Never state or invent product facts without calling it.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product name or theme, e.g. "sleep".' },
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
            'The catalogue has no matching products — it is not open for orders yet. Do not ' +
            'invent products. If the member wants to get going, the "start your journey" path ' +
            'is open today.',
        };
      }
      // The tier variant: ordering is only mentioned to signed-in users and
      // up. Leads and visitors get facts and availability; the interface, not
      // the model, is where they get invited to create an account.
      const canOrder = tierAtLeast(deps.audience ?? 'subscriber', 'user');
      const footer = canOrder
        ? '\n\nThese can be ordered from the shop; offer to point the member there if they want to start.'
        : '\n\nShare product facts and availability only. Do not mention ordering, carts, or purchasing; ordering opens once they have an account.';
      return {
        resultText: `Products:\n${items
          .map((item) => `- ${item.name} (${item.available ? 'available' : 'not currently available'})`)
          .join('\n')}${footer}`,
      };
    };
  },
};
