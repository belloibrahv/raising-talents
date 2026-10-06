import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config/env.js';
import type { Database } from './platform/database/client.js';
import { createLogger, PinoNestLogger } from './platform/logging/logger.js';
import { EventDispatcher } from './platform/outbox/event-dispatcher.js';
import { OutboxRelay } from './platform/outbox/outbox-relay.js';
import type { ErrorReporter } from './platform/observability/error-reporter.js';
import { PLATFORM } from './platform/platform.tokens.js';
import {
  JobScheduler,
  type JobLock,
  type ScheduledJob,
} from './platform/scheduling/job-scheduler.js';
import { IDENTITY } from './modules/identity/application/identity.tokens.js';
import type { ModuleEventHandlers } from './modules/identity/identity.module.js';
import { MEDIA } from './modules/media/application/media.use-cases.js';
import { NOTIFICATIONS } from './modules/notifications/application/notifications.js';
import { PRIVACY } from './modules/privacy/application/privacy.use-cases.js';
import { SEARCH } from './modules/search/application/search.use-cases.js';
import { TALENT } from './modules/talent-profiles/application/talent-profile.tokens.js';
import { WorkerModule } from './worker.module.js';
import type { AccountsFacade } from './modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from './modules/accounts/application/accounts.tokens.js';
import type { UnitOfWork } from './platform/unit-of-work.js';
import { applyStaffGrants } from './ops/staff-grants.js';
import { VerifyPendingAccountsJob } from './modules/accounts/application/verify-pending-accounts.job.js';

const config = loadConfig();
const logger = createLogger(config, 'worker');

const app = await NestFactory.createApplicationContext(WorkerModule.register({ config, logger }), {
  logger: new PinoNestLogger(logger),
});

const dispatcher = new EventDispatcher();
for (const token of [
  IDENTITY.EventHandlers,
  MEDIA.EventHandlers,
  TALENT.EventHandlers,
  SEARCH.EventHandlers,
  NOTIFICATIONS.EventHandlers,
]) {
  app.get<ModuleEventHandlers>(token).register(dispatcher);
}

const errors = app.get<ErrorReporter>(PLATFORM.ErrorReporter);
const database = app.get<Database>(PLATFORM.Database);
const relay = new OutboxRelay(database, dispatcher, logger, errors);
relay.start();

// With email verification off, people still waiting for a code are verified (ADR-045).
const verifyPending =
  config.EMAIL_VERIFICATION === 'off'
    ? new VerifyPendingAccountsJob(
        app.get<AccountsFacade>(ACCOUNTS.Facade),
        app.get<UnitOfWork>(PLATFORM.UnitOfWork),
        logger,
      )
    : null;

const scheduler = new JobScheduler(
  [
    app.get<ScheduledJob>(MEDIA.AbandonedUploads),
    app.get<ScheduledJob>(PRIVACY.Erasure),
    app.get<ScheduledJob>(NOTIFICATIONS.Prune),
    ...(verifyPending ? [verifyPending] : []),
  ],
  app.get<JobLock>(PLATFORM.JobLock),
  logger,
  errors,
);
scheduler.start();
// Straight away too, rather than ten minutes after a deploy.
if (verifyPending) void scheduler.runOnce(verifyPending);
logger.info('worker process started');

// Operators make moderators and admins here on Railway, where there is no shell (STAFF_GRANT).
if (process.env['STAFF_GRANT']) {
  await applyStaffGrants(
    process.env['STAFF_GRANT'],
    app.get<AccountsFacade>(ACCOUNTS.Facade),
    app.get<UnitOfWork>(PLATFORM.UnitOfWork),
    logger,
  );
}

// Demo data for testing a live environment, switched on for one deploy (docs/runbooks/demo-data.md).
const seedDemo = process.env['SEED_DEMO'];
if (seedDemo === 'run' || seedDemo === 'remove') {
  const { removeDemoData, runDemoSeed } = await import('./ops/demo-seed.js');
  const task = seedDemo === 'run' ? runDemoSeed(app, logger) : removeDemoData(app, logger);
  void task.catch((error: unknown) => {
    logger.error({ err: error }, `demo data ${seedDemo} failed`);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection in worker');
  errors.capture(reason, { process: 'worker' });
});

// ECS sends SIGTERM on deploy: finish the current batch, then close connections.
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'worker shutting down');
  await Promise.all([relay.stop(), scheduler.stop()]);
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
