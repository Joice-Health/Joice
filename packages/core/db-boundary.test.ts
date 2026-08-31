import { expect, test } from 'bun:test';
import { brainTableExports, scanDbImports } from '@joice/db/ownership';

/**
 * The table-ownership rule, enforced: platform code may import only
 * platform-owned tables from @joice/db. The one allowed exception is the
 * documented read-only leads view over brain_profiles
 * (packages/core/src/admin/leads-service.ts, docs/rag/10-architecture.md).
 */
const ALLOWED = new Set(['brainProfiles']);

test('platform domain imports only platform-owned tables from @joice/db', async () => {
  const forbidden = brainTableExports.filter((name) => !ALLOWED.has(name));
  expect(await scanDbImports(import.meta.dir, forbidden)).toEqual([]);
});
