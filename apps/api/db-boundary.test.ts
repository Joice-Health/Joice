import { expect, test } from 'bun:test';
import { brainOwnedExports, scanDbImports } from '@joice/db/ownership';

/**
 * The table-ownership rule, enforced for the api service and its scripts:
 * only platform-owned exports may be imported from @joice/db. No allowances:
 * the brain_profiles exception belongs to packages/core's leads service, not
 * to anything in this app.
 */
test('api service imports only platform-owned tables from @joice/db', async () => {
  expect(await scanDbImports(import.meta.dir, await brainOwnedExports())).toEqual([]);
});
