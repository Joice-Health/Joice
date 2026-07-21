import { stripCitationMarkers } from '@joice/core/schemas';

/**
 * Turning a streaming markdown answer into clips that can be read aloud.
 *
 * Pure text functions, deliberately free of React and browser APIs so they can
 * be tested directly — the hook that uses them (`use-speaker.ts`) can't be
 * imported outside a browser. The bug that motivated this was invisible in the
 * UI: an answer was simply never spoken, and the cause was one arithmetic
 * relationship between two constants.
 */

/** The first clip is kept short so speech starts fast; later ones batch up. */
const FIRST_CHUNK_MIN = 24;
const CHUNK_MIN = 140;

/**
 * Ceiling on a single clip. The API rejects anything over 3,000 characters, and
 * a bullet-list answer contains no sentence boundaries at all — no `.` followed
 * by a capital — so it accumulated untouched until the final flush handed the
 * whole thing over at once. That 400'd, the error was swallowed, and the answer
 * was never spoken. Well under the limit, because a shorter clip also means
 * less waiting before the next one starts.
 */
const CHUNK_MAX = 1200;

/**
 * A sentence ends at .!? followed by whitespace and a capital or digit.
 * Requiring whitespace after the period is what keeps "2.5 mg" intact, which
 * matters a lot in dosing answers.
 */
const SENTENCE_END = /[.!?]["')\]]*\s+(?=[A-Z0-9])/;

/** Markdown is for the eye — strip it before anything is read aloud. */
export function forSpeech(text: string): string {
  return stripCitationMarkers(text)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/**
 * Split point when there's no sentence to split on: the last line or word break
 * inside the cap, so a clip doesn't end mid-word. Falls back to a hard cut if
 * the tail has no break at all (an unbroken 1,200-character token).
 */
function hardCut(text: string, max: number): number {
  const window = text.slice(0, max);
  // In preference order, not "whichever falls latest": a word break exists
  // almost everywhere, so taking the furthest one would always win and cut a
  // list item in half. Only a break in the back half counts.
  const at = [window.lastIndexOf('\n'), window.lastIndexOf(' ')].find((i) => i > max / 2);
  return at === undefined ? max : at + 1;
}

/**
 * Pull the next speakable chunk out of the buffer, or null if it's not ready.
 * Returns `[chunk, remaining]`; callers loop until it returns null.
 */
export function takeChunk(
  buffer: string,
  isFirst: boolean,
  flush: boolean,
): [string, string] | null {
  const text = buffer.trimStart();
  if (!text) return null;

  const min = isFirst ? FIRST_CHUNK_MIN : CHUNK_MIN;
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const rest = text.slice(searchFrom);
    const match = SENTENCE_END.exec(rest);
    if (!match) break;
    const end = searchFrom + match.index + match[0].length;
    if (end >= min) {
      // A "sentence" longer than the cap still has to be broken up.
      if (end <= CHUNK_MAX) return [text.slice(0, end).trim(), text.slice(end)];
      break;
    }
    searchFrom = end;
  }

  // No usable sentence boundary. Anything over the cap has to go now — waiting
  // for punctuation that never arrives is what silenced list answers.
  if (text.length > CHUNK_MAX) {
    const cut = hardCut(text, CHUNK_MAX);
    return [text.slice(0, cut).trim(), text.slice(cut)];
  }
  if (flush) return [text, ''];
  return null;
}

/** Exposed so the test can assert the clip cap against the API's own limit. */
export const SPEECH_CHUNK_MAX = CHUNK_MAX;
