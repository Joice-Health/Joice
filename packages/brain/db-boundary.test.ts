import { expect, test } from 'bun:test';
import { apiTableExports, scanDbImports } from '@joice/db/ownership';

/**
 * The table-ownership rule, enforced: brain code may import only brain-owned
 * tables from @joice/db. The one allowed exception is the documented read of
 * app_settings by the brain config service (docs/rag/10-architecture.md); the
 * write paths in that shared class are only ever called from the api process.
 */
const ALLOWED = new Set(['appSettings']);

test('brain domain imports only brain-owned tables from @joice/db', async () => {
  const forbidden = apiTableExports.filter((name) => !ALLOWED.has(name));
  expect(await scanDbImports(import.meta.dir, forbidden)).toEqual([]);
});
