import { expect, test } from 'bun:test';
import { brainTableExports, scanDbImports } from '@joice/db/ownership';

/**
 * The table-ownership rule, enforced for the api service and its scripts:
 * only platform-owned tables may be imported from @joice/db. The
 * brain_profiles exception matches packages/core (the documented read-only
 * leads view).
 */
const ALLOWED = new Set(['brainProfiles']);

test('api service imports only platform-owned tables from @joice/db', async () => {
  const forbidden = brainTableExports.filter((name) => !ALLOWED.has(name));
  expect(await scanDbImports(import.meta.dir, forbidden)).toEqual([]);
});
