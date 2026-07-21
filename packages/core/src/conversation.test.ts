import { describe, expect, test } from 'bun:test';
import {
  alternatesFromUser,
  buildChatHistory,
  MAX_HISTORY_TURNS,
  type HistoryMessage,
} from './conversation';

/** A finished exchange, as the UI would hold it. */
const exchange = (n: number): HistoryMessage[] => [
  { role: 'user', content: `question ${n}` },
  { role: 'assistant', content: `answer ${n}` },
];

const thread = (count: number): HistoryMessage[] =>
  Array.from({ length: count }, (_, i) => exchange(i + 1)).flat();

describe('buildChatHistory', () => {
  test('a first question carries no history', () => {
    expect(buildChatHistory([], 'hello')).toEqual([{ role: 'user', content: 'hello' }]);
  });

  test('keeps completed exchanges in order, ending with the new question', () => {
    expect(buildChatHistory(thread(2), 'question 3')).toEqual([
      { role: 'user', content: 'question 1' },
      { role: 'assistant', content: 'answer 1' },
      { role: 'user', content: 'question 2' },
      { role: 'assistant', content: 'answer 2' },
      { role: 'user', content: 'question 3' },
    ]);
  });

  /**
   * The regression. A flat slice(-20) of an odd-length list dropped the leading
   * user turn, so the history began with an assistant and Bedrock rejected it.
   * Question 11 was where the cap first bit — every conversation died there.
   */
  test('stays valid past the cap, where a flat slice used to break', () => {
    for (let n = 1; n <= 15; n++) {
      const history = buildChatHistory(thread(n - 1), `question ${n}`);
      expect(alternatesFromUser(history)).toBe(true);
      expect(history.at(-1)).toEqual({ role: 'user', content: `question ${n}` });
      expect(history.length).toBeLessThanOrEqual(MAX_HISTORY_TURNS * 2 + 1);
    }
  });

  test('drops the oldest exchanges once the cap is reached', () => {
    const history = buildChatHistory(thread(12), 'question 13');
    expect(history).toHaveLength(MAX_HISTORY_TURNS * 2 + 1);
    expect(history[0]).toEqual({ role: 'user', content: 'question 3' });
  });

  /**
   * The other regression: filtering failed messages removed an assistant turn
   * but left the user turn it answered, leaving two user turns adjacent. One
   * failure used to poison every later request in the conversation.
   */
  test('a failed exchange is dropped whole, not half', () => {
    const messages: HistoryMessage[] = [
      ...exchange(1),
      { role: 'user', content: 'question 2' },
      { role: 'assistant', content: 'Something went wrong.', error: true },
    ];
    const history = buildChatHistory(messages, 'question 3');
    expect(alternatesFromUser(history)).toBe(true);
    expect(history).toEqual([
      { role: 'user', content: 'question 1' },
      { role: 'assistant', content: 'answer 1' },
      { role: 'user', content: 'question 3' },
    ]);
  });

  test('an answer still streaming is not sent as history', () => {
    const messages: HistoryMessage[] = [
      ...exchange(1),
      { role: 'user', content: 'question 2' },
      { role: 'assistant', content: '' },
    ];
    const history = buildChatHistory(messages, 'question 3');
    expect(alternatesFromUser(history)).toBe(true);
    expect(history).toHaveLength(3);
  });
});

describe('alternatesFromUser', () => {
  test('accepts a well-formed conversation', () => {
    expect(alternatesFromUser([])).toBe(true);
    expect(alternatesFromUser([{ role: 'user' }])).toBe(true);
    expect(alternatesFromUser([{ role: 'user' }, { role: 'assistant' }, { role: 'user' }])).toBe(
      true,
    );
  });

  test('rejects the two shapes Bedrock refuses', () => {
    expect(alternatesFromUser([{ role: 'assistant' }, { role: 'user' }])).toBe(false);
    expect(alternatesFromUser([{ role: 'user' }, { role: 'user' }])).toBe(false);
  });
});
