// One image, one entry point, for hosts that start containers without a shell (Railway).
// APP_ROLE picks the process: api (default), worker or migrate. With MIGRATE_ON_START=true
// the API applies migrations first, under a lock, so a deploy never serves an old schema.
const role = process.env.APP_ROLE ?? 'api';

if (role === 'migrate' || (role === 'api' && process.env.MIGRATE_ON_START === 'true')) {
  await import('./platform/database/migrate.js');
}
if (role === 'api') await import('./main.api.js');
else if (role === 'worker') await import('./main.worker.js');
else if (role !== 'migrate')
  throw new Error(`Unknown APP_ROLE "${role}": use api, worker or migrate`);
