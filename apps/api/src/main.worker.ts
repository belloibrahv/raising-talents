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

const scheduler = new JobScheduler(
  [
    app.get<ScheduledJob>(MEDIA.AbandonedUploads),
    app.get<ScheduledJob>(PRIVACY.Erasure),
    app.get<ScheduledJob>(NOTIFICATIONS.Prune),
  ],
  app.get<JobLock>(PLATFORM.JobLock),
  logger,
  errors,
);
scheduler.start();
logger.info('worker process started');

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
