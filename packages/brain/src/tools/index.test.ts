import { describe, expect, test } from 'bun:test';
import type { RetrievedChunk } from '../generation/answer-service';
import type { CatalogItem, CatalogPort } from '../ports';
import { buildToolExecutors, similarQueries, type ToolDeps } from './index';

const chunk = (over: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  sourcePath: 'peptides/bpc-157.md',
  headingPath: 'BPC-157 > Dosing',
  content: 'Typical protocols use 250-500mcg daily.',
  similarity: 0.8,
  ...over,
});

const catalogOf = (items: CatalogItem[]): CatalogPort => ({
  search: async () => items,
  byId: async () => null,
});

function depsOf(over: Partial<ToolDeps> = {}): ToolDeps & { retrieveCalls: string[] } {
  const retrieveCalls: string[] = [];
  return {
    retrieveCalls,
    retrieve: async (query) => {
      retrieveCalls.push(query);
      return [chunk()];
    },
    catalog: catalogOf([]),
    config: { topK: 8, similarityFloor: 0.4 },
    audience: 'subscriber',
    registry: [],
    ...over,
  };
}

describe('similarQueries', () => {
  test('overlapping queries match; disjoint ones do not', () => {
    expect(similarQueries('bpc dosing', 'bpc dosing protocol')).toBe(true);
    expect(similarQueries('BPC-157 oral dosing', 'bpc-157 dosing')).toBe(true);
    expect(similarQueries('tb-500 healing', 'sleep protocol')).toBe(false);
    expect(similarQueries('', 'anything')).toBe(false);
  });
});

describe('search_notes', () => {
  test('numbers results against the registry’s global index', async () => {
    const deps = depsOf({ registry: [chunk({ sourcePath: 'earlier.md' })] });
    const search = buildToolExecutors(deps).get('search_notes')!;

    const outcome = await search.execute({ query: 'bpc dosing' });
    expect(outcome.isError).toBeUndefined();
    // One chunk was already in the registry, so this one is [2].
    expect(outcome.resultText).toContain('[2] peptides/bpc-157.md — BPC-157 > Dosing');
    expect(deps.registry).toHaveLength(2);
  });

  test('serves a similar prefetched query without a second retrieval', async () => {
    const deps = depsOf({
      prefetch: {
        promise: Promise.resolve({ query: 'bpc dosing', chunks: [chunk()] }),
      },
    });
    const search = buildToolExecutors(deps).get('search_notes')!;

    const outcome = await search.execute({ query: 'bpc dosing details' });
    expect(outcome.resultText).toContain('[1]');
    expect(deps.retrieveCalls).toHaveLength(0); // the prefetch answered it
    expect(deps.registry).toHaveLength(1);
  });

  test('a dissimilar query ignores the prefetch, and the prefetch is consumed once', async () => {
    const deps = depsOf({
      prefetch: {
        promise: Promise.resolve({ query: 'sleep protocol', chunks: [chunk()] }),
      },
    });
    const search = buildToolExecutors(deps).get('search_notes')!;

    await search.execute({ query: 'bpc dosing' });
    expect(deps.retrieveCalls).toEqual(['bpc dosing']);

    // A later similar-to-prefetch query must NOT resurrect the stale prefetch.
    await search.execute({ query: 'sleep protocol' });
    expect(deps.retrieveCalls).toEqual(['bpc dosing', 'sleep protocol']);
  });

  test('parallel same-round searches cannot both consume the prefetch', async () => {
    const deps = depsOf({
      prefetch: {
        promise: Promise.resolve({ query: 'bpc dosing side effects', chunks: [chunk()] }),
      },
    });
    const search = buildToolExecutors(deps).get('search_notes')!;

    // Both queries are "similar" to the prefetch; the loop runs them
    // concurrently. Exactly one may be served by it — the other must search.
    await Promise.all([
      search.execute({ query: 'bpc dosing' }),
      search.execute({ query: 'bpc side effects' }),
    ]);
    expect(deps.retrieveCalls).toHaveLength(1);
    expect(deps.registry).toHaveLength(2); // no duplicated chunk sets
  });

  test('a failed prefetch falls back to a fresh retrieval', async () => {
    const deps = depsOf({ prefetch: { promise: Promise.resolve(null) } });
    const search = buildToolExecutors(deps).get('search_notes')!;
    const outcome = await search.execute({ query: 'bpc dosing' });
    expect(outcome.resultText).toContain('[1]');
    expect(deps.retrieveCalls).toEqual(['bpc dosing']);
  });

  test('zero matches returns the honest empty result, adding nothing to the registry', async () => {
    const deps = depsOf({ retrieve: async () => [] });
    const search = buildToolExecutors(deps).get('search_notes')!;
    const outcome = await search.execute({ query: 'quantum kittens' });
    expect(outcome.resultText).toContain('No notes matched');
    expect(deps.registry).toHaveLength(0);
    expect(outcome.isError).toBeUndefined(); // an empty library is not an error
  });

  test('malformed input (the {} the stream parser degrades to) is an isError result', async () => {
    const search = buildToolExecutors(depsOf()).get('search_notes')!;
    const outcome = await search.execute({});
    expect(outcome.isError).toBe(true);
    expect(outcome.resultText).toContain('Invalid input');
  });
});

describe('search_catalogue', () => {
  test('an empty catalogue is honest about not being open', async () => {
    const search = buildToolExecutors(depsOf()).get('search_catalogue')!;
    const outcome = await search.execute({ query: 'sleep' });
    expect(outcome.resultText).toContain('not open for orders yet');
    expect(outcome.isError).toBeUndefined();
  });

  test('items list name and availability', async () => {
    const deps = depsOf({
      catalog: catalogOf([
        { id: '1', name: 'BPC-157 Capsules', slug: 'peptides/bpc-157', available: true },
        { id: '2', name: 'TB-500', slug: 'peptides/tb-500', available: false },
      ]),
    });
    const search = buildToolExecutors(deps).get('search_catalogue')!;
    const outcome = await search.execute({ query: 'peptides' });
    expect(outcome.resultText).toContain('BPC-157 Capsules (available)');
    expect(outcome.resultText).toContain('TB-500 (not currently available)');
  });
});

describe('signal tools', () => {
  test('handoff returns the action with a validated enum reason', async () => {
    const handoff = buildToolExecutors(depsOf()).get('request_clinician_handoff')!;
    const outcome = await handoff.execute({ reason: 'individual_dosing' });
    expect(outcome.action).toEqual({ kind: 'handoff', reason: 'individual_dosing' });

    const bad = await handoff.execute({ reason: 'my cousin said so' });
    expect(bad.isError).toBe(true);
    expect(bad.action).toBeUndefined();
  });

  test('flag_intent returns the nudge action and nothing else', async () => {
    const flag = buildToolExecutors(depsOf()).get('flag_intent')!;
    const outcome = await flag.execute({ intent: 'ready_to_start' });
    expect(outcome.action).toEqual({ kind: 'intent', intent: 'ready_to_start' });
  });
});
