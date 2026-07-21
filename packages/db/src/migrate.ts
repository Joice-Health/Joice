/**
 * Migration runner. Run with: bun packages/db/src/migrate.ts
 *
 * This is a **one-off job**, not a startup step. It used to run in each API
 * container's CMD, which already raced whenever `desired_count` went above 1
 * and became a real hazard once the brain shipped as a second service booting
 * against the same database — two services, several tasks each, all racing to
 * apply the same migration with no lock between them.
 *
 * In production CI runs it as the `joice-migrate` ECS task and waits for exit 0
 * *before* updating either service (see .github/workflows/deploy.yml and
 * infra/migrate.tf). Locally, docker-compose runs it once as a `migrate`
 * service that both apps wait on.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const migrationClient = postgres(url, { max: 1 });

try {
  await migrate(drizzle(migrationClient), {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  });
  console.log('✅ Migrations applied');
} catch (error) {
  // Exit non-zero and loudly: the deployment is gated on this task succeeding,
  // so a quiet failure would ship code against an old schema.
  console.error('❌ Migration failed:', error);
  process.exitCode = 1;
} finally {
  await migrationClient.end();
}
