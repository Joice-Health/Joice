import { expect, test } from 'bun:test';
import { apiTableExports, scanDbImports } from '@joice/db/ownership';

/**
 * The table-ownership rule, enforced for the brain service and its scripts:
 * only brain-owned tables may be imported from @joice/db. The app_settings
 * exception matches packages/brain (the config service's documented read).
 */
const ALLOWED = new Set(['appSettings']);

test('brain service imports only brain-owned tables from @joice/db', async () => {
  const forbidden = apiTableExports.filter((name) => !ALLOWED.has(name));
  expect(await scanDbImports(import.meta.dir, forbidden)).toEqual([]);
});
