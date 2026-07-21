import { describe, expect, test } from 'bun:test';
import { citedIndexes, stripCitationMarkers } from './citations';

describe('citedIndexes', () => {
  test('reads a single marker', () => {
    expect(citedIndexes('Dosing is 250mcg [1].')).toEqual([1]);
  });

  // The regression: models group references, and matching only [1] meant these
  // rendered as literal brackets with nothing behind them.
  test('reads grouped markers, spaced or not', () => {
    expect(citedIndexes('Both agree [1, 2].')).toEqual([1, 2]);
    expect(citedIndexes('Both agree [1,2].')).toEqual([1, 2]);
    expect(citedIndexes('Padded [ 3 , 4 ].')).toEqual([3, 4]);
  });

  test('keeps first-appearance order and drops repeats', () => {
    expect(citedIndexes('First [2]. Then [1][2]. Again [2, 1].')).toEqual([2, 1]);
  });

  test('ignores text that only looks like a marker', () => {
    expect(citedIndexes('An array literal [a, b] and an empty [].')).toEqual([]);
    expect(citedIndexes('A markdown [link](http://example.com).')).toEqual([]);
  });
});

describe('stripCitationMarkers', () => {
  test('removes the marker and the space in front of it', () => {
    expect(stripCitationMarkers('Take 250mcg daily [1].')).toBe('Take 250mcg daily.');
  });

  test('removes grouped markers too', () => {
    expect(stripCitationMarkers('Both sources agree [1, 2]. So do these [3][4].')).toBe(
      'Both sources agree. So do these.',
    );
  });

  test('leaves text without markers alone', () => {
    expect(stripCitationMarkers('No citations here.')).toBe('No citations here.');
  });

  // Answers are markdown; collapsing newlines would run list items together
  // when the text is read aloud or re-rendered.
  test('preserves line structure', () => {
    expect(stripCitationMarkers('- First [1]\n- Second [2]')).toBe('- First\n- Second');
  });
});
