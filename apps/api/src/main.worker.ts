import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './config/env.js';
import type { Database } from './platform/database/client.js';
import { createLogger, PinoNestLogger } from './platform/logging/logger.js';
import { EventDispatcher } from './platform/outbox/event-dispatcher.js';
import { OutboxRelay } from './platform/outbox/outbox-relay.js';
import type { ErrorReporter } from './platform/observability/error-reporter.js';
import { PLATFORM } from './platform/platform.tokens.js';
import { IDENTITY } from './modules/identity/application/identity.tokens.js';
import type { ModuleEventHandlers } from './modules/identity/identity.module.js';
import { MEDIA } from './modules/media/application/media.use-cases.js';
import { TALENT } from './modules/talent-profiles/application/talent-profile.tokens.js';
import { WorkerModule } from './worker.module.js';

const config = loadConfig();
const logger = createLogger(config, 'worker');

const app = await NestFactory.createApplicationContext(WorkerModule.register({ config, logger }), {
  logger: new PinoNestLogger(logger),
});

const dispatcher = new EventDispatcher();
for (const token of [IDENTITY.EventHandlers, MEDIA.EventHandlers, TALENT.EventHandlers]) {
  app.get<ModuleEventHandlers>(token).register(dispatcher);
}

const errors = app.get<ErrorReporter>(PLATFORM.ErrorReporter);
const relay = new OutboxRelay(app.get<Database>(PLATFORM.Database), dispatcher, logger, errors);
relay.start();
logger.info('worker process started');

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection in worker');
  errors.capture(reason, { process: 'worker' });
});

// ECS sends SIGTERM on deploy: finish the current batch, then close connections.
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'worker shutting down');
  await relay.stop();
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
