import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.js';

// Runs as a one-off task before a new API version takes traffic.
// A failure exits non-zero, which stops the deploy.
const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('DATABASE_URL is required\n');
  process.exit(1);
}

const handle = createDatabase(url, 1);
try {
  await migrate(handle.db, {
    migrationsFolder: new URL('../../../drizzle', import.meta.url).pathname,
  });
  process.stdout.write('Migrations applied\n');
} finally {
  await handle.close();
}
