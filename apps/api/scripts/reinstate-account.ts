// Lifts a suspension or ban, recorded against the staff member who asked for it:
//   pnpm --filter @rt/api account:reinstate member@example.com moderator.name@raisingtalents.app
// See docs/runbooks/reports-and-enforcement.md before running it.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '../src/config/env.js';
import {
  SAFETY,
  type ReinstateAccountHandler,
} from '../src/modules/safety/application/safety.use-cases.js';
import { createLogger, PinoNestLogger } from '../src/platform/logging/logger.js';
import { WorkerModule } from '../src/worker.module.js';

const [email, operatorEmail] = process.argv.slice(2).map((value) => value.trim().toLowerCase());
if (!email || !operatorEmail) {
  throw new Error('Usage: account:reinstate <member email> <your staff email>');
}
const config = loadConfig();
const logger = createLogger(config, 'worker');
const app = await NestFactory.createApplicationContext(WorkerModule.register({ config, logger }), {
  logger: new PinoNestLogger(logger),
});
const result = await app
  .get<ReinstateAccountHandler>(SAFETY.Reinstate)
  .execute({ email, operatorEmail });
await app.close();
if (!result.ok) throw new Error(result.error.message);
logger.warn({ userId: result.value }, 'account reinstated');
