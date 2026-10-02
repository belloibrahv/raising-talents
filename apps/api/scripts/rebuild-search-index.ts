// Rebuilds the talent search index from Postgres: pnpm --filter @rt/api search:rebuild
// Safe while the app runs: searches use the old index until the new one is complete.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '../src/config/env.js';
import { RebuildSearchIndex, SEARCH } from '../src/modules/search/application/search.use-cases.js';
import { createLogger, PinoNestLogger } from '../src/platform/logging/logger.js';
import { WorkerModule } from '../src/worker.module.js';

const config = loadConfig();
const logger = createLogger(config, 'worker');
const app = await NestFactory.createApplicationContext(WorkerModule.register({ config, logger }), {
  logger: new PinoNestLogger(logger),
});
// RebuildSearchIndex logs how many profiles it indexed.
await app.get<RebuildSearchIndex>(SEARCH.Rebuild).run();
await app.close();
