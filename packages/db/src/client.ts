import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = ReturnType<typeof createDatabase>;

/**
 * Create a Drizzle client bound to a Postgres connection.
 * Callers own the lifecycle; in long-running servers create one and reuse it.
 */
export function createDatabase(connectionString: string) {
  const queryClient = postgres(connectionString, {
    max: 10,
    onnotice: () => {},
  });
  return drizzle(queryClient, { schema });
}

let singleton: Database | undefined;

/**
 * Lazily-instantiated shared client driven by the DATABASE_URL env var.
 * Convenient for the API server and migration scripts.
 */
export function getDatabase(): Database {
  if (!singleton) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    singleton = createDatabase(url);
  }
  return singleton;
}
