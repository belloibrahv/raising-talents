import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { DiscoveryModule } from '@nestjs/core';
import { pino } from 'pino';
import { AppModule } from '../../src/app.module.js';
import { configureApiApp, createFastifyAdapter } from '../../src/bootstrap/create-api-app.js';
import { loadConfig } from '../../src/config/env.js';
import { ACCOUNTS } from '../../src/modules/accounts/application/accounts.tokens.js';
import { InMemoryAccountRepository } from '../../src/modules/accounts/testing/in-memory-account.repository.js';
import { IDENTITY } from '../../src/modules/identity/application/identity.tokens.js';
import type { ModuleEventHandlers } from '../../src/modules/identity/identity.module.js';
import {
  CapturingEmailSender,
  FakeBreachedPasswordChecker,
  FakePasswordHasher,
  InMemoryCredentialRepository,
  InMemoryOneTimeCodeRepository,
  InMemorySessionRepository,
} from '../../src/modules/identity/testing/fakes.js';
import { generateTestSigningKeys } from '../../src/modules/identity/testing/identity-test-harness.js';
import { EventDispatcher } from '../../src/platform/outbox/event-dispatcher.js';
import { PLATFORM } from '../../src/platform/platform.tokens.js';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../src/platform/testing/fakes.js';

const toBase64 = (value: string) => Buffer.from(value).toString('base64');

export interface TestApp {
  readonly app: NestFastifyApplication;
  readonly moduleRef: TestingModule;
  readonly events: InMemoryEventRecorder;
  readonly email: CapturingEmailSender;
  /** Publishes recorded events the way the worker would. */
  deliverEvents(): Promise<void>;
}

/**
 * The real NestJS and Fastify stack (routing, validation, guards, the error filter)
 * with in-memory adapters in place of Postgres, Redis and SMTP.
 */
export async function createTestApp(): Promise<TestApp> {
  const keys = await generateTestSigningKeys();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
    REDIS_URL: 'redis://localhost:6379',
    JWT_PRIVATE_KEY_BASE64: toBase64(keys.privateKeyPem),
    JWT_PUBLIC_KEY_BASE64: toBase64(keys.publicKeyPem),
    JWT_KEY_ID: 'e2e-key',
    VERIFICATION_CODE_PEPPER: 'e2e-pepper-0123456789abcdef0123456789abcdef',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
  });
  const logger = pino({ level: 'silent' });
  const events = new InMemoryEventRecorder();
  const email = new CapturingEmailSender();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ config, logger }), DiscoveryModule],
  })
    .overrideProvider(PLATFORM.Clock)
    .useValue(new FixedClock())
    .overrideProvider(PLATFORM.UnitOfWork)
    .useValue(new InMemoryUnitOfWork())
    .overrideProvider(PLATFORM.EventRecorder)
    .useValue(events)
    .overrideProvider(PLATFORM.RateLimiter)
    .useValue(new InMemoryRateLimiter())
    .overrideProvider(PLATFORM.Redis)
    .useValue({ ping: async () => 'PONG', quit: async () => 'OK' })
    .overrideProvider(ACCOUNTS.Repository)
    .useValue(new InMemoryAccountRepository(events))
    .overrideProvider(IDENTITY.Sessions)
    .useValue(new InMemorySessionRepository())
    .overrideProvider(IDENTITY.Credentials)
    .useValue(new InMemoryCredentialRepository())
    .overrideProvider(IDENTITY.Codes)
    .useValue(new InMemoryOneTimeCodeRepository())
    .overrideProvider(IDENTITY.PasswordHasher)
    .useValue(new FakePasswordHasher())
    .overrideProvider(IDENTITY.BreachedPasswords)
    .useValue(new FakeBreachedPasswordChecker())
    .overrideProvider(IDENTITY.EmailSender)
    .useValue(email)
    .compile();

  const dispatcher = new EventDispatcher();
  moduleRef.get<ModuleEventHandlers>(IDENTITY.EventHandlers).register(dispatcher);
  const app = configureApiApp(
    moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(config)),
    logger,
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    moduleRef,
    events,
    email,
    deliverEvents: async () => {
      for (const event of events.events.splice(0)) await dispatcher.dispatch(event);
    },
  };
}
