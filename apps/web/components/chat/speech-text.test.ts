import { describe, expect, test } from 'bun:test';
import { speakRequestSchema } from '@joice/core/schemas';
import { forSpeech, SPEECH_CHUNK_MAX, takeChunk } from './speech-text';

/** Drain the buffer the way useSpeaker's pump loop does. */
function allChunks(text: string): string[] {
  const out: string[] = [];
  let buffer = text;
  for (;;) {
    const taken = takeChunk(buffer, out.length === 0, true);
    if (!taken) break;
    out.push(taken[0]);
    buffer = taken[1];
    if (!buffer) break;
  }
  return out;
}

describe('takeChunk', () => {
  test('waits until there is enough text to be worth speaking', () => {
    expect(takeChunk('Short.', false, false)).toBeNull();
  });

  test('splits on a sentence boundary once past the minimum', () => {
    const text = `${'A dosing note that runs on for a while. '.repeat(5)}And more.`;
    const taken = takeChunk(text, false, false);
    expect(taken).not.toBeNull();
    expect(taken![0].endsWith('.')).toBe(true);
  });

  test('does not split a decimal dose into two clips', () => {
    // "2.5 mg" must survive: the sentence rule needs whitespace after the period.
    const chunk = takeChunk(`${'Take the dose as directed. '.repeat(6)}Give 2.5 mg daily.`, false, true);
    expect(chunk![0]).not.toMatch(/2\.$/);
  });

  /**
   * The regression. A bullet list has no `.` followed by a capital anywhere, so
   * nothing matched and the text piled up until the final flush handed over the
   * whole answer at once — over the API's 3,000-character limit, rejected, and
   * the failure swallowed. The answer was simply never spoken.
   */
  test('a long list with no sentence boundaries is still broken into speakable clips', () => {
    const list = Array.from({ length: 120 }, (_, i) => `- Item number ${i + 1} in the protocol`).join(
      '\n',
    );
    expect(list.length).toBeGreaterThan(SPEECH_CHUNK_MAX);

    const chunks = allChunks(list);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(SPEECH_CHUNK_MAX);
      // Every clip must be something the API will actually accept.
      expect(speakRequestSchema.safeParse({ text: forSpeech(chunk) }).success).toBe(true);
    }
    // Nothing may be dropped on the floor.
    expect(chunks.join('\n').replace(/\s+/g, ' ')).toBe(list.replace(/\s+/g, ' '));
  });

  test('splits an over-long run before the flush, not after', () => {
    const long = 'word '.repeat(400); // 2000 chars, no sentence ends
    const taken = takeChunk(long, false, false);
    expect(taken).not.toBeNull();
    expect(taken![0].length).toBeLessThanOrEqual(SPEECH_CHUNK_MAX);
  });

  test('never cuts mid-word when it has to split hard', () => {
    const taken = takeChunk('supercalifragilistic '.repeat(100), false, false);
    expect(taken![0].endsWith('supercalifragilistic')).toBe(true);
  });

  test('the clip cap leaves headroom under the API limit', () => {
    const atCap = 'x'.repeat(SPEECH_CHUNK_MAX);
    expect(speakRequestSchema.safeParse({ text: atCap }).success).toBe(true);
  });
});

describe('forSpeech', () => {
  test('drops markdown that would be read aloud as punctuation', () => {
    expect(forSpeech('## Dosing\n\n- **250mcg** daily [1]\n- See `notes.md`')).toBe(
      'Dosing\n250mcg daily\nSee notes.md',
    );
  });

  test('leaves plain prose untouched', () => {
    expect(forSpeech('Take 250mcg daily with food.')).toBe('Take 250mcg daily with food.');
  });
});
