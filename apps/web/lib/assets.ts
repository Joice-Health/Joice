import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Server-side check for an optional public asset (a hero photo, a care-area
 * tile), so a missing file renders a designed slot instead of a broken image.
 * Only for server components; the result is fixed for the life of the process.
 */
export function publicAssetExists(path: string): boolean {
  return existsSync(join(process.cwd(), 'public', path));
}
