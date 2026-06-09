/**
 * Standalone migration runner used by the API container on startup.
 * Run with: bun run src/migrate.ts
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const migrationClient = postgres(url, { max: 1 });

await migrate(drizzle(migrationClient), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });

await migrationClient.end();
console.log('✅ Migrations applied');
