import { expect, test } from 'bun:test';
import { apiOwnedExports, scanDbImports } from '@joice/db/ownership';

/**
 * The table-ownership rule, enforced for the brain service and its scripts:
 * only brain-owned exports may be imported from @joice/db. No allowances: the
 * app_settings exception belongs to packages/brain's config service, not to
 * anything in this app.
 */
test('brain service imports only brain-owned tables from @joice/db', async () => {
  expect(await scanDbImports(import.meta.dir, await apiOwnedExports())).toEqual([]);
});
