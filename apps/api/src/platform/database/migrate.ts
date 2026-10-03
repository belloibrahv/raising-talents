import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadDatabaseConfig } from '../../config/env.js';
import { createDatabase } from './client.js';

// Runs as a one-off ECS task before a new API version takes traffic, or before the API
// starts on hosts that set MIGRATE_ON_START (see main.ts).
// A failure exits non-zero, which stops the deploy.
const config = loadDatabaseConfig();
const handle = createDatabase({ ...config, DATABASE_POOL_MAX: 1 });
// Held for the whole run, so two instances starting at once take turns (the pool has one
// connection, so the lock and the migration share a session).
const MIGRATION_LOCK = 7_402_311;
try {
  await handle.db.execute(sql`select pg_advisory_lock(${MIGRATION_LOCK})`);
  await migrate(handle.db, {
    migrationsFolder: new URL('../../../drizzle', import.meta.url).pathname,
  });
  await handle.db.execute(sql`select pg_advisory_unlock(${MIGRATION_LOCK})`);
  process.stdout.write('Migrations applied\n');
} finally {
  await handle.close();
}
