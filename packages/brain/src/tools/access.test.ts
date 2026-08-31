import { describe, expect, test } from 'bun:test';
import type { RetrievedChunk } from '../generation/answer-service';
import type { CatalogItem, CatalogPort } from '../ports';
import { buildToolExecutors, toolAccessAllows, type ToolDeps } from './index';

/**
 * The access model: each tool's flat setting is 'off' or a minimum tier, and
 * the registry filters the belt BEFORE the model sees it, so an out-of-tier
 * tool is invisible, never refused. Variants steer behavior by tier inside
 * the tools that clear the gate.
 */

const catalogOf = (items: CatalogItem[]): CatalogPort => ({
  search: async () => items,
  byId: async () => null,
});

function depsOf(over: Partial<ToolDeps> = {}): ToolDeps {
  return {
    retrieve: async (): Promise<RetrievedChunk[]> => [],
    catalog: catalogOf([]),
    config: { topK: 8, similarityFloor: 0.4 },
    registry: [],
    ...over,
  };
}

describe('toolAccessAllows', () => {
  test("'off' admits nobody, even subscribers", () => {
    expect(toolAccessAllows('off', 'subscriber')).toBe(false);
  });

  test('a tier is the minimum, walked with tierAtLeast', () => {
    expect(toolAccessAllows('lead', 'visitor')).toBe(false);
    expect(toolAccessAllows('lead', 'lead')).toBe(true);
    expect(toolAccessAllows('user', 'subscriber')).toBe(true);
    expect(toolAccessAllows('subscriber', 'user')).toBe(false);
  });

  test("undefined means 'visitor', the schema default", () => {
    expect(toolAccessAllows(undefined, 'visitor')).toBe(true);
  });
});

describe('the belt filter', () => {
  test('default config and audience advertise the full belt', () => {
    const names = [...buildToolExecutors(depsOf()).keys()];
    expect(names).toEqual([
      'search_notes',
      'search_catalogue',
      'request_clinician_handoff',
      'flag_intent',
    ]);
  });

  test('an out-of-tier tool is not advertised at all', () => {
    const deps = depsOf({
      audience: 'visitor',
      config: { topK: 8, similarityFloor: 0.4, toolClinicianHandoff: 'subscriber' },
    });
    const names = [...buildToolExecutors(deps).keys()];
    expect(names).not.toContain('request_clinician_handoff');
    expect(names).toContain('search_notes');
  });

  test("'off' removes a tool for everyone", () => {
    const deps = depsOf({
      audience: 'subscriber',
      config: { topK: 8, similarityFloor: 0.4, toolSearchCatalogue: 'off' },
    });
    expect([...buildToolExecutors(deps).keys()]).not.toContain('search_catalogue');
  });

  test('a subscriber clears a subscriber-only gate', () => {
    const deps = depsOf({
      audience: 'subscriber',
      config: { topK: 8, similarityFloor: 0.4, toolClinicianHandoff: 'subscriber' },
    });
    expect([...buildToolExecutors(deps).keys()]).toContain('request_clinician_handoff');
  });
});

describe('search_catalogue tier variant', () => {
  const items: CatalogItem[] = [
    { id: '1', name: 'Glutathione', slug: 'glutathione', available: true },
  ];

  test('users and up hear about ordering', async () => {
    const search = buildToolExecutors(depsOf({ audience: 'user', catalog: catalogOf(items) })).get(
      'search_catalogue',
    )!;
    const result = await search.execute({ query: 'glutathione' });
    expect(result.resultText).toContain('can be ordered');
    expect(result.resultText).toContain('Glutathione');
  });

  test('leads get facts only, with ordering explicitly off the table', async () => {
    const search = buildToolExecutors(depsOf({ audience: 'lead', catalog: catalogOf(items) })).get(
      'search_catalogue',
    )!;
    const result = await search.execute({ query: 'glutathione' });
    expect(result.resultText).toContain('Do not mention ordering');
    expect(result.resultText).not.toContain('can be ordered from the shop;');
  });
});
