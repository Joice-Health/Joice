/**
 * Citation markers — the `[1]` / `[2, 3]` references the model writes into an
 * answer to point at the retrieved documents it used.
 *
 * Browser-safe (no AWS or Postgres imports): the web app reaches these through
 * the `@joice/core/schemas` re-export, which is what keeps the Postgres driver
 * out of the client bundle.
 *
 * These lived in four places with four subtly different regexes. They belong
 * together because they have to agree: if the stripper and the parser disagree
 * about what a marker looks like, an answer either renders raw brackets with no
 * citation behind them, or gets read aloud as "bracket one".
 *
 * Only functions are exported — a shared `/g` regex carries `lastIndex` state
 * between callers, which is a bug waiting for whoever reaches for `.test()`.
 */

/**
 * Accepts a group: models routinely write `[1, 2]` when a claim rests on two
 * documents, and matching only `[1]` left those rendering as literal brackets
 * with no citation attached.
 */
const MARKER = String.raw`\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]`;

/**
 * Remove every marker and tidy the whitespace it leaves behind. Used for spoken
 * output (Polly pronounces the brackets) and when citations are switched off in
 * the admin console.
 *
 * Consumes the space *before* a marker, so "daily [1]." becomes "daily." and
 * not "daily ." — that stray space was audible as a pause and visible in the
 * rendered answer.
 */
export function stripCitationMarkers(text: string): string {
  return text
    .replace(new RegExp(String.raw`[ \t]*${MARKER}`, 'g'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * The document numbers a piece of text refers to, in first-appearance order,
 * de-duplicated. `"[1, 2] and [1]"` → `[1, 2]`.
 */
export function citedIndexes(text: string): number[] {
  const found: number[] = [];
  const seen = new Set<number>();
  for (const match of text.matchAll(new RegExp(MARKER, 'g'))) {
    for (const part of match[1]!.split(',')) {
      const n = Number(part.trim());
      if (!Number.isInteger(n) || seen.has(n)) continue;
      seen.add(n);
      found.push(n);
    }
  }
  return found;
}
