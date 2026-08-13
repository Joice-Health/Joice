/**
 * Answer sanitizers. Models leak scaffolding into their prose: Nova emits
 * <thinking> blocks (its chain of thought, which a visitor must never see or
 * hear), and smaller models like stacking every reference number at the end
 * of an answer. Both are stripped server-side, before streaming and before
 * the authoritative complete event, so the UI and the voice pipeline never
 * meet them.
 */

const OPEN = '<thinking>';
const CLOSE = '</thinking>';

/** Remove every thinking block, including an unclosed one that runs to EOF. */
export function stripThinking(text: string): string {
  return text.replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/gi, '').trim();
}

/**
 * A row of three or more stacked citation markers at the very end of an
 * answer ("feel free to ask! [1][2][3][4]") is decoration, not citation.
 * In-sentence markers are untouched.
 */
export function stripTrailingCitationClump(text: string): string {
  return text.replace(/(?:\s*\[\d+(?:\s*,\s*\d+)*\]){3,}[\s]*$/, '').trimEnd();
}

/** Longest suffix of `text` that is a prefix of `tag` (a split tag mid-stream). */
function partialTagSuffix(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (tag.toLowerCase().startsWith(text.slice(-n).toLowerCase())) return n;
  }
  return 0;
}

/**
 * Stateful delta filter for streaming: passes answer text through, swallows
 * thinking blocks even when tags arrive split across deltas. The complete
 * event's text goes through stripThinking() regardless, so the stream and the
 * authoritative answer always agree. Call flush() at stream end to release a
 * held partial-tag tail that never became a tag.
 */
export function createThinkingStreamFilter(): {
  push(delta: string): string;
  flush(): string;
} {
  let buffer = '';
  let inside = false;
  let emittedAnything = false;

  function drain(): string {
    let out = '';
    for (;;) {
      if (inside) {
        const close = buffer.toLowerCase().indexOf(CLOSE);
        if (close === -1) {
          // Still inside the block: keep only enough tail to recognize a
          // close tag split across deltas; the rest is discarded thought.
          buffer = buffer.slice(-(CLOSE.length - 1));
          return out;
        }
        buffer = buffer.slice(close + CLOSE.length);
        // The block often trails a newline that would leave the visible
        // answer starting with blank space.
        if (!emittedAnything) buffer = buffer.replace(/^\s+/, '');
        inside = false;
      } else {
        const open = buffer.toLowerCase().indexOf(OPEN);
        if (open !== -1) {
          out += buffer.slice(0, open);
          buffer = buffer.slice(open + OPEN.length);
          inside = true;
          continue;
        }
        const hold = partialTagSuffix(buffer, OPEN);
        out += buffer.slice(0, buffer.length - hold);
        buffer = buffer.slice(buffer.length - hold);
        if (out) emittedAnything = true;
        return out;
      }
    }
  }

  return {
    push(delta: string): string {
      buffer += delta;
      return drain();
    },
    flush(): string {
      if (inside) return ''; // an unclosed block is dropped, matching stripThinking
      const rest = buffer;
      buffer = '';
      return rest;
    },
  };
}
