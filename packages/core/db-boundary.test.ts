import { expect, test } from 'bun:test';
import { brainOwnedExports, scanDbImports } from '@joice/db/ownership';

/**
 * The table-ownership rule, enforced: platform code may import only
 * platform-owned exports from @joice/db. The one exception is pinned to the
 * one file it is documented for: the read-only leads view over brain_profiles
 * (docs/rag/10-architecture.md).
 */
test('platform domain imports only platform-owned tables from @joice/db', async () => {
  const violations = await scanDbImports(import.meta.dir, await brainOwnedExports(), [
    { name: 'brainProfiles', file: 'src/admin/leads-service.ts' },
  ]);
  expect(violations).toEqual([]);
});
