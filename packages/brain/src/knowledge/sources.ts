/**
 * Knowledge source types — one corpus, many kinds of document.
 *
 * The corpus stays a single table with a single HNSW index; "sources" are a
 * column, not separate stores. Retrieval filters by type when a question
 * calls for it, ingestion assigns the type from the file's path prefix, and
 * citations carry it so the UI can render a product sheet differently from a
 * clinical note.
 */

export const SOURCE_TYPES = [
  'clinical_note',
  'product_sheet',
  'faq',
  'protocol',
  'policy',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Path-prefix → type registry. First match wins; anything unmatched is a
 * clinical note (the vault's layout predates types, so it gets the default
 * rather than a required move). New sources = a new prefix here + a folder
 * in the bucket — no schema change.
 */
const PREFIX_TO_TYPE: readonly (readonly [string, SourceType])[] = [
  ['products/', 'product_sheet'],
  ['faq/', 'faq'],
  ['protocols/', 'protocol'],
  ['policies/', 'policy'],
];

export function sourceTypeForPath(path: string): SourceType {
  for (const [prefix, type] of PREFIX_TO_TYPE) {
    if (path.startsWith(prefix)) return type;
  }
  return 'clinical_note';
}
