import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as brain from './schema/brain';
import * as identity from './schema/identity';
import * as onboarding from './schema/onboarding';
import * as platform from './schema/platform';
import * as waitlist from './schema/waitlist';

/**
 * The table-ownership rule, as data: which @joice/db exports belong to which
 * service. Each consuming package carries a db-boundary.test.ts that scans its
 * own sources against these lists, which is what turns "a service writes only
 * the tables in its own schema file" (root CLAUDE.md, docs/rag/10-architecture.md)
 * from a review convention into a failing build.
 *
 * The lists are derived from the schema modules at runtime, so a new table is
 * covered the moment it is exported; there is no list here to forget to update.
 *
 * The tests live in the consuming packages on purpose: turbo caches a task by
 * its own package's inputs, so a central test in @joice/db would not re-run
 * when brain or core sources change.
 */

function tableExports(module: Record<string, unknown>): string[] {
  return Object.keys(module).filter((key) => is(module[key], PgTable));
}

/** Export names of tables the brain service owns (schema/brain.ts). */
export const brainTableExports = tableExports(brain);

/** Export names of tables the platform (api) side owns. */
export const apiTableExports = [waitlist, identity, platform, onboarding].flatMap(tableExports);

const NAMED_IMPORT =
  /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@joice\/db(?:\/[\w-]+)?['"]/g;
const OPAQUE_IMPORT = /(?:import\s*\*\s*as\s+\w+\s*from\s*|import\(\s*)['"]@joice\/db/;

/**
 * Scans every TypeScript source under rootDir's src and scripts directories
 * for named imports from @joice/db matching a forbidden export name. Namespace and dynamic imports of
 * @joice/db are reported as violations outright: they would let a forbidden
 * table in without naming it, which defeats the check. Type-only imports count
 * too, deliberately; a legitimate cross-domain type belongs in a wire schema,
 * not a table import.
 *
 * Returns human-readable "file: problem" strings; empty means clean.
 */
export async function scanDbImports(rootDir: string, forbidden: string[]): Promise<string[]> {
  const bad = new Set(forbidden);
  const violations: string[] = [];
  for (const rel of await sourceFiles(rootDir)) {
    const text = await readFile(join(rootDir, rel), 'utf8');
    if (OPAQUE_IMPORT.test(text)) {
      violations.push(`${rel}: namespace or dynamic import of @joice/db defeats the boundary check`);
    }
    for (const match of text.matchAll(NAMED_IMPORT)) {
      for (const spec of (match[1] ?? '').split(',')) {
        const name = spec.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0] ?? '';
        if (name && bad.has(name)) violations.push(`${rel}: imports ${name}`);
      }
    }
  }
  return violations.sort();
}

/** Every .ts/.tsx under rootDir's src and scripts trees, as rootDir-relative paths. */
async function sourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  for (const top of ['src', 'scripts']) {
    const entries = await readdir(join(rootDir, top), { recursive: true }).catch(() => []);
    for (const entry of entries) {
      const rel = join(top, String(entry));
      if (/\.tsx?$/.test(rel)) files.push(rel);
    }
  }
  return files;
}
