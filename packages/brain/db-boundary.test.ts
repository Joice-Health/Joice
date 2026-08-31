import { expect, test } from 'bun:test';
import { apiOwnedExports, scanDbImports } from '@joice/db/ownership';

/**
 * The table-ownership rule, enforced: brain code may import only brain-owned
 * exports from @joice/db. The one exception is pinned to the one file it is
 * documented for: the config service's read of app_settings
 * (docs/rag/10-architecture.md); its write methods are only ever called from
 * the api process.
 */
test('brain domain imports only brain-owned tables from @joice/db', async () => {
  const violations = await scanDbImports(import.meta.dir, await apiOwnedExports(), [
    { name: 'appSettings', file: 'src/config/service.ts' },
  ]);
  expect(violations).toEqual([]);
});
