import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadDatabaseConfig } from '../../config/env.js';
import { createDatabase } from './client.js';

// Runs as a one-off ECS task before a new API version takes traffic.
// A failure exits non-zero, which stops the deploy.
const config = loadDatabaseConfig();
const handle = createDatabase({ ...config, DATABASE_POOL_MAX: 1 });
try {
  await migrate(handle.db, {
    migrationsFolder: new URL('../../../drizzle', import.meta.url).pathname,
  });
  process.stdout.write('Migrations applied\n');
} finally {
  await handle.close();
}
