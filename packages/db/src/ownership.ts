import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { is } from 'drizzle-orm';
import { PgMaterializedView, PgTable, PgView } from 'drizzle-orm/pg-core';
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
 * The lists are derived from the schema modules at runtime (tables and views
 * from the live exports, row-type aliases from the schema sources, since
 * type-only exports are erased before runtime), so a new table is covered the
 * moment it is exported; there is no list here to forget to update.
 *
 * The tests live in the consuming packages on purpose: turbo caches a task by
 * its own package's inputs, so a central test in @joice/db would not re-run
 * when brain or core sources change.
 */

function tableExports(module: Record<string, unknown>): string[] {
  return Object.keys(module).filter(
    (key) =>
      is(module[key], PgTable) || is(module[key], PgView) || is(module[key], PgMaterializedView),
  );
}

/** `export type WaitlistEntry = ...` names, read from a schema source file. */
async function typeExports(file: string): Promise<string[]> {
  const text = await readFile(join(import.meta.dir, 'schema', `${file}.ts`), 'utf8');
  return [...text.matchAll(/^export type (\w+)/gm)].map((m) => m[1] ?? '').filter(Boolean);
}

/** Every export name the brain service owns: tables, views, and row-type aliases. */
export async function brainOwnedExports(): Promise<string[]> {
  return [...tableExports(brain), ...(await typeExports('brain'))];
}

/** Every export name the platform (api) side owns: tables, views, and row-type aliases. */
export async function apiOwnedExports(): Promise<string[]> {
  const tables = [waitlist, identity, platform, onboarding].flatMap(tableExports);
  const types = await Promise.all(
    ['waitlist', 'identity', 'platform', 'onboarding'].map(typeExports),
  );
  return [...tables, ...types.flat()];
}

/** A documented exception: `name` may be imported by exactly one file. */
export interface BoundaryAllowance {
  name: string;
  /** rootDir-relative path, e.g. 'src/config/service.ts'. */
  file: string;
}

const NAMED_IMPORT =
  /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@joice\/db(?:\/[\w-]+)?['"]/g;

/**
 * Scans every TypeScript source under rootDir's src and scripts directories
 * for imports from @joice/db.
 *
 * Two layers, because a regex alone is evadable: the named-import regex checks
 * identifiers against the forbidden list (type-only imports count too; a
 * legitimate cross-domain type belongs in a wire schema, not a table import),
 * and Bun's transpiler counts the file's REAL @joice/db import records. More
 * records than regex-recognised statements means an unnameable form (star
 * re-export, namespace, dynamic, default, or whitespace-free) and is a
 * violation outright. Comments are stripped before the regex pass so
 * documenting the rule in code cannot trip or pad it; the transpiler ignores
 * comments natively. Type-only imports are erased by the transpiler, so they
 * can only ever lower the record count, never trigger the unnameable case.
 *
 * A scan that finds no source files at all is itself a violation: green must
 * mean "looked and found nothing", never "looked nowhere".
 *
 * Returns human-readable "file: problem" strings; empty means clean.
 */
export async function scanDbImports(
  rootDir: string,
  forbidden: string[],
  allow: BoundaryAllowance[] = [],
): Promise<string[]> {
  const bad = new Set(forbidden);
  const violations: string[] = [];
  const files = await sourceFiles(rootDir);
  if (files.length === 0) {
    return [`${rootDir}: no sources found under src or scripts; the boundary check scanned nothing`];
  }
  for (const rel of files) {
    const raw = await readFile(join(rootDir, rel), 'utf8');
    const transpiler = new Bun.Transpiler({ loader: rel.endsWith('.tsx') ? 'tsx' : 'ts' });
    const realImports = transpiler
      .scanImports(raw)
      .filter((i) => i.path === '@joice/db' || i.path.startsWith('@joice/db/')).length;

    const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const matches = [...text.matchAll(NAMED_IMPORT)];
    if (realImports > matches.length) {
      violations.push(
        `${rel}: imports @joice/db in a form the boundary check cannot name ` +
          '(star re-export, namespace, dynamic, default, or unspaced) - use a named import',
      );
    }
    for (const match of matches) {
      for (const spec of (match[1] ?? '').split(',')) {
        const name = spec.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0] ?? '';
        if (!name || !bad.has(name)) continue;
        if (allow.some((a) => a.name === name && a.file === rel)) continue;
        violations.push(`${rel}: imports ${name}`);
      }
    }
  }
  return violations.sort();
}

/** Every .ts/.tsx under rootDir's src and scripts trees, as rootDir-relative paths. */
async function sourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  for (const top of ['src', 'scripts']) {
    let entries: string[];
    try {
      entries = (await readdir(join(rootDir, top), { recursive: true })).map(String);
    } catch (err) {
      // A package without a scripts/ tree is normal; anything else (EACCES,
      // ENOTDIR) must fail loudly rather than silently scan nothing.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    for (const entry of entries) {
      const rel = join(top, entry);
      if (/\.tsx?$/.test(rel)) files.push(rel);
    }
  }
  return files;
}
