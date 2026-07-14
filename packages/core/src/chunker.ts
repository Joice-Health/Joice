/**
 * Obsidian-markdown chunker for RAG ingestion. Pure functions — no I/O.
 *
 * Strategy: one chunk per leaf heading section (headings are the doctor's own
 * semantic boundaries), breadcrumb preserved for retrieval context and
 * citations. Oversized sections split on paragraph boundaries with no overlap.
 */

export interface MarkdownChunk {
  chunkIndex: number;
  /** Heading breadcrumb, e.g. `BPC-157 > Dosing > Oral`. Null for pre-heading text. */
  headingPath: string | null;
  content: string;
  /** Rough estimate (~chars/4) used for prompt budgeting. */
  tokenCount: number;
}

export interface ChunkedDocument {
  /** Parsed YAML-ish frontmatter (flat key/value; lists split on commas). */
  metadata: Record<string, unknown>;
  chunks: MarkdownChunk[];
}

/** Sections longer than this are split on paragraph boundaries (~1.5k tokens). */
const MAX_SECTION_CHARS = 6000;

/** `[[Page|alias]]` → alias, `[[Page]]` → Page, `![[embed]]` → removed. */
export function stripWikilinks(text: string): string {
  return text
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1');
}

/** Minimal frontmatter parse: flat `key: value` pairs; `[a, b]` values become arrays. */
function parseFrontmatter(lines: string[]): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const line of lines) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue!.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      metadata[key!] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (value !== '') {
      metadata[key!] = value;
    }
  }
  return metadata;
}

interface Section {
  headingPath: string | null;
  lines: string[];
}

export function chunkMarkdown(raw: string): ChunkedDocument {
  let lines = raw.split('\n');

  // Frontmatter: leading `---` fence.
  let metadata: Record<string, unknown> = {};
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) {
      metadata = parseFrontmatter(lines.slice(1, end));
      lines = lines.slice(end + 1);
    }
  }

  // Split into heading sections, tracking the breadcrumb stack. Headings inside
  // fenced code blocks are content, not structure.
  const sections: Section[] = [];
  let breadcrumbs: { level: number; title: string }[] = [];
  let current: Section = { headingPath: null, lines: [] };
  let inFence = false;

  for (const line of lines) {
    if (/^(```|~~~)/.test(line.trim())) inFence = !inFence;
    const heading = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      sections.push(current);
      const level = heading[1]!.length;
      const title = stripWikilinks(heading[2]!.trim()).replace(/#/g, '').trim();
      breadcrumbs = breadcrumbs.filter((b) => b.level < level);
      breadcrumbs.push({ level, title });
      current = { headingPath: breadcrumbs.map((b) => b.title).join(' > '), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  // Emit chunks: cleaned, non-empty sections; oversized ones split on paragraphs.
  const chunks: MarkdownChunk[] = [];
  for (const section of sections) {
    const content = stripWikilinks(section.lines.join('\n')).trim();
    if (!content) continue;
    for (const piece of splitOversized(content)) {
      chunks.push({
        chunkIndex: chunks.length,
        headingPath: section.headingPath,
        content: piece,
        tokenCount: Math.ceil(piece.length / 4),
      });
    }
  }

  return { metadata, chunks };
}

function splitOversized(content: string): string[] {
  if (content.length <= MAX_SECTION_CHARS) return [content];

  const pieces: string[] = [];
  let buffer = '';
  for (const paragraph of content.split(/\n{2,}/)) {
    if (buffer && buffer.length + paragraph.length + 2 > MAX_SECTION_CHARS) {
      pieces.push(buffer);
      buffer = paragraph;
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
  }
  if (buffer.trim()) pieces.push(buffer);
  return pieces;
}
