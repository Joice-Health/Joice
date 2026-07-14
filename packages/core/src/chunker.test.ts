import { describe, expect, test } from 'bun:test';
import { chunkMarkdown, stripWikilinks } from './chunker';

describe('stripWikilinks', () => {
  test('rewrites links and drops embeds', () => {
    expect(stripWikilinks('See [[BPC-157|BPC]] and [[TB-500]].')).toBe('See BPC and TB-500.');
    expect(stripWikilinks('Diagram: ![[dosing-chart.png]] end')).toBe('Diagram:  end');
  });
});

describe('chunkMarkdown', () => {
  test('captures frontmatter and strips it from content', () => {
    const doc = ['---', 'tags: [peptides, dosing]', 'author: Dr. K', '---', '# BPC-157', 'Intro text.'].join('\n');
    const { metadata, chunks } = chunkMarkdown(doc);
    expect(metadata).toEqual({ tags: ['peptides', 'dosing'], author: 'Dr. K' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe('Intro text.');
  });

  test('builds heading breadcrumbs and resets deeper levels', () => {
    const doc = [
      '# BPC-157',
      'Overview.',
      '## Dosing',
      '### Oral',
      'Oral notes.',
      '## Safety',
      'Safety notes.',
    ].join('\n');
    const { chunks } = chunkMarkdown(doc);
    expect(chunks.map((c) => c.headingPath)).toEqual([
      'BPC-157',
      'BPC-157 > Dosing > Oral',
      'BPC-157 > Safety',
    ]);
  });

  test('pre-heading text gets a null breadcrumb; empty sections are skipped', () => {
    const doc = ['Preamble.', '# Heading', '', '## Empty', '', '## Full', 'Body.'].join('\n');
    const { chunks } = chunkMarkdown(doc);
    expect(chunks[0]).toMatchObject({ headingPath: null, content: 'Preamble.' });
    expect(chunks.map((c) => c.headingPath)).toEqual([null, 'Heading > Full']);
  });

  test('ignores headings inside fenced code blocks', () => {
    const doc = ['# Real', '```', '# not a heading', '```', 'After.'].join('\n');
    const { chunks } = chunkMarkdown(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.headingPath).toBe('Real');
    expect(chunks[0]!.content).toContain('# not a heading');
  });

  test('splits oversized sections on paragraph boundaries with sequential indexes', () => {
    const paragraph = 'x'.repeat(2500);
    const doc = ['# Big', paragraph, '', paragraph, '', paragraph].join('\n');
    const { chunks } = chunkMarkdown(doc);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 6000)).toBe(true);
    expect(chunks.every((c) => c.headingPath === 'Big')).toBe(true);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  test('estimates token counts', () => {
    const { chunks } = chunkMarkdown('# H\nabcd'.repeat(1));
    expect(chunks[0]!.tokenCount).toBe(Math.ceil(chunks[0]!.content.length / 4));
  });
});
