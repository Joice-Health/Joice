import { describe, expect, test } from 'bun:test';
import {
  percentile,
  scoreFullCase,
  scoreRetrievalCase,
  soundsLikeRefusal,
} from './scoring';

/**
 * The scoring is the contract between the admin console, the CLI script, and
 * every historical run row, so its behavior (including the detail strings)
 * is pinned here.
 */

const NOT_COVERED = 'Our notes do not cover that.';

describe('soundsLikeRefusal', () => {
  test('recognizes the ways models actually decline', () => {
    for (const answer of [
      "I can't provide advice on investing your savings.",
      'The 2022 World Cup winner is not within my scope of knowledge.',
      "That's beyond the scope of our library.",
      'I have no information about that topic.',
      "That's not something I can help with.",
      "I'm sorry, but that is outside what I cover.",
      'I recommend checking a sports website for that.',
      "Our clinical notes don't cover cryptocurrency.",
    ]) {
      expect(soundsLikeRefusal(answer, NOT_COVERED)).toBe(true);
    }
  });

  test('a confident answer is not a refusal, however uncited', () => {
    expect(soundsLikeRefusal('Argentina won the 2022 FIFA World Cup.', NOT_COVERED)).toBe(false);
    expect(
      soundsLikeRefusal('In the night, the moon does gleam, a silver dream.', NOT_COVERED),
    ).toBe(false);
  });

  test('containing the configured not-covered copy always counts', () => {
    expect(soundsLikeRefusal(`Well. ${NOT_COVERED}`, NOT_COVERED)).toBe(true);
  });
});

describe('scoreRetrievalCase', () => {
  const c = { question: 'q', expectSources: ['a.md', 'b.md'] };

  test('passes when every expected source is in the retrieved set', () => {
    const score = scoreRetrievalCase(c, new Set(['a.md', 'b.md', 'c.md']), 8);
    expect(score).toEqual({ pass: true, detail: 'recall ok (3 chunks)' });
  });

  test('names exactly what is missing from the top-k', () => {
    const score = scoreRetrievalCase(c, new Set(['a.md']), 8);
    expect(score.pass).toBe(false);
    expect(score.detail).toBe('missing from top-8: b.md');
  });

  test('a case without expectSources is a skipped pass, not a judgment', () => {
    const score = scoreRetrievalCase({ question: 'q' }, new Set(), 8);
    expect(score.pass).toBe(true);
    expect(score.skipped).toBe(true);
  });
});

describe('scoreFullCase', () => {
  const opts = { notCoveredMessage: NOT_COVERED, toolsEnabled: true };
  const observed = (over: Partial<Parameters<typeof scoreFullCase>[1]> = {}) => ({
    answer: 'An answer [1].',
    citedPaths: new Set(['a.md']),
    toolsCalled: new Set<string>(),
    ...over,
  });

  test('refusal expected: a citing answer fails even if it sounds like a decline', () => {
    const score = scoreFullCase(
      { question: 'q', expectRefusal: true },
      observed({ answer: "I can't help with that [1]." }),
      opts,
    );
    expect(score.pass).toBe(false);
    expect(score.detail).toContain('expected refusal but cited');
  });

  test('refusal expected: an uncited confident answer fails with the answer quoted', () => {
    const score = scoreFullCase(
      { question: 'q', expectRefusal: true },
      observed({ answer: 'Argentina won it.', citedPaths: new Set() }),
      opts,
    );
    expect(score.pass).toBe(false);
    expect(score.detail).toContain('expected refusal but got an uncited answer');
  });

  test('refusal expected: an uncited decline passes', () => {
    const score = scoreFullCase(
      { question: 'q', expectRefusal: true },
      observed({ answer: 'That is not something I can help with.', citedPaths: new Set() }),
      opts,
    );
    expect(score.pass).toBe(true);
  });

  test('mustCite fails on zero citations', () => {
    const score = scoreFullCase(
      { question: 'q', mustCite: true },
      observed({ citedPaths: new Set() }),
      opts,
    );
    expect(score.detail).toBe('expected citations, got none');
  });

  test('every expected source must be cited, each miss named', () => {
    const score = scoreFullCase(
      { question: 'q', expectSources: ['a.md', 'b.md'] },
      observed(),
      opts,
    );
    expect(score.pass).toBe(false);
    expect(score.detail).toBe('expected citation of b.md');
  });

  test('expectTool is judged only when tool mode is on', () => {
    const c = { question: 'q', expectTool: 'search_catalogue' };
    expect(scoreFullCase(c, observed(), { ...opts, toolsEnabled: false }).pass).toBe(true);
    const judged = scoreFullCase(c, observed(), opts);
    expect(judged.pass).toBe(false);
    expect(judged.detail).toContain('expected tool search_catalogue');
  });

  test('the ok detail names citations and tools', () => {
    const score = scoreFullCase(
      { question: 'q' },
      observed({ toolsCalled: new Set(['search_notes']) }),
      opts,
    );
    expect(score.detail).toBe('ok (1 citations, tools: search_notes)');
  });
});

describe('percentile', () => {
  test('edges: empty, single, and the p50/p95 of a known series', () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 95)).toBe(7);
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(sorted, 50)).toBe(60);
    expect(percentile(sorted, 95)).toBe(100);
  });
});
