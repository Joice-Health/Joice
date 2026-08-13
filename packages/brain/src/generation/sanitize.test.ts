import { describe, expect, test } from 'bun:test';
import {
  createThinkingStreamFilter,
  stripThinking,
  stripTrailingCitationClump,
} from './sanitize';

describe('stripThinking', () => {
  test('removes closed blocks and trims the seam', () => {
    expect(
      stripThinking('<thinking> The user gave a name. </thinking>\n\nHello, Sean!'),
    ).toBe('Hello, Sean!');
  });

  test('removes an unclosed block running to the end', () => {
    expect(stripThinking('Answer first. <thinking> and then it never closes')).toBe(
      'Answer first.',
    );
  });

  test('handles multiple blocks and mixed case', () => {
    expect(
      stripThinking('<Thinking>a</Thinking>One. <THINKING>b</THINKING>Two.'),
    ).toBe('One. Two.');
  });

  test('leaves clean answers untouched', () => {
    expect(stripThinking('BPC-157 is dosed at 250mcg [1].')).toBe(
      'BPC-157 is dosed at 250mcg [1].',
    );
  });
});

describe('stripTrailingCitationClump', () => {
  test('drops a stacked row of markers at the end', () => {
    expect(
      stripTrailingCitationClump('Feel free to ask! [1][2][3][4][5][6][7][8]'),
    ).toBe('Feel free to ask!');
  });

  test('keeps in-sentence markers and short clusters', () => {
    const text = 'Dosing is 250mcg [2][3]. Take with food [1].';
    expect(stripTrailingCitationClump(text)).toBe(text);
  });

  test('grouped markers count toward the clump', () => {
    expect(stripTrailingCitationClump('Ask away! [1, 2] [3] [4]')).toBe('Ask away!');
  });
});

describe('createThinkingStreamFilter', () => {
  function run(deltas: string[]): string {
    const filter = createThinkingStreamFilter();
    let out = '';
    for (const delta of deltas) out += filter.push(delta);
    return out + filter.flush();
  }

  test('passes plain text through unchanged', () => {
    expect(run(['Hello ', 'world.'])).toBe('Hello world.');
  });

  test('swallows a block arriving in one delta', () => {
    expect(run(['<thinking>secret</thinking>Visible.'])).toBe('Visible.');
  });

  test('swallows a block whose tags are split across deltas', () => {
    expect(run(['<thi', 'nking>the plan', ' continues</thi', 'nking>', 'Answer.'])).toBe(
      'Answer.',
    );
  });

  test('drops an unclosed block instead of leaking it', () => {
    expect(run(['Answer. ', '<thinking>never closes'])).toBe('Answer. ');
  });

  test('releases a held angle bracket that never becomes a tag', () => {
    expect(run(['dose < 500mcg ', 'is typical'])).toBe('dose < 500mcg is typical');
  });

  test('trims the whitespace seam after a leading block', () => {
    expect(run(['<thinking>x</thinking>\n\n', 'Hello.'])).toBe('Hello.');
  });
});
