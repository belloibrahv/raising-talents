// Makes an existing, verified account a moderator or admin:
//   pnpm --filter @rt/api staff:grant moderator.name@raisingtalents.app moderator
// Staff sign up in the app like anyone, verify their email, and stop before choosing a role.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '../src/config/env.js';
import type { AccountsFacade } from '../src/modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { createLogger, PinoNestLogger } from '../src/platform/logging/logger.js';
import type { UnitOfWork } from '../src/platform/unit-of-work.js';
import { PLATFORM } from '../src/platform/platform.tokens.js';
import { WorkerModule } from '../src/worker.module.js';

const [email, role] = process.argv.slice(2);
if (!email || (role !== 'moderator' && role !== 'admin')) {
  throw new Error('Usage: staff:grant <email> <moderator|admin>');
}
const config = loadConfig();
const logger = createLogger(config, 'worker');
const app = await NestFactory.createApplicationContext(WorkerModule.register({ config, logger }), {
  logger: new PinoNestLogger(logger),
});
const accounts = app.get<AccountsFacade>(ACCOUNTS.Facade);
const result = await app
  .get<UnitOfWork>(PLATFORM.UnitOfWork)
  .run(() => accounts.grantStaffRole(email.trim().toLowerCase(), role));
await app.close();
if (!result.ok) throw new Error(result.error.message);
logger.warn({ userId: result.value, role }, 'staff role granted');
