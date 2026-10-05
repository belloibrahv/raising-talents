import {
  Global,
  Inject,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { AppConfig } from '../config/env.js';
import { ACCESS_TOKENS } from './auth/access-tokens.js';
import { JoseAccessTokens } from './auth/jose-access-tokens.js';
import { SystemClock, type Clock } from './clock.js';
import { createDatabase, type DatabaseHandle } from './database/client.js';
import { PostgresJobLock } from './scheduling/postgres-job-lock.js';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import type { EmailSender } from './email/email-sender.js';
import { SesEmailSender } from './email/ses-email-sender.js';
import { SmtpEmailSender } from './email/smtp-email-sender.js';
import { DrizzleUnitOfWork } from './database/drizzle-unit-of-work.js';
import { HealthController } from './health/health.controller.js';
import { AuthGuard } from './http/auth.guard.js';
import { DrizzleEventRecorder } from './outbox/drizzle-event-recorder.js';
import { PLATFORM } from './platform.tokens.js';
import { RedisRateLimiter } from './rate-limit/redis-rate-limiter.js';
import { RedisRealtime } from './realtime/realtime.js';
import { RealtimeController } from './realtime/realtime.controller.js';
import { NoopErrorReporter } from './observability/error-reporter.js';
import { SentryErrorReporter } from './observability/sentry-error-reporter.js';
import { flushTelemetry, isSentryEnabled } from './observability/telemetry.js';

const DATABASE_HANDLE = Symbol('DatabaseHandle');

/** Closes connections when the process shuts down, so deploys drain cleanly. */
class PlatformLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_HANDLE) private readonly database: DatabaseHandle,
    @Inject(PLATFORM.Redis) private readonly redis: Redis,
    @Inject(PLATFORM.Realtime) private readonly realtime: { close?: () => Promise<void> },
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      this.database.close(),
      this.redis.quit(),
      this.realtime.close?.(),
      flushTelemetry(),
    ]);
  }
}

export interface PlatformOptions {
  readonly config: AppConfig;
  readonly logger: Logger;
}

const decode = (base64: string) => Buffer.from(base64, 'base64').toString('utf8');

@Global()
@Module({})
export class PlatformModule {
  static forRoot(options: PlatformOptions): DynamicModule {
    const { config, logger } = options;
    return {
      module: PlatformModule,
      controllers: [HealthController, RealtimeController],
      providers: [
        { provide: PLATFORM.Config, useValue: config },
        { provide: PLATFORM.Logger, useValue: logger },
        { provide: PLATFORM.Clock, useClass: SystemClock },
        {
          provide: PLATFORM.ErrorReporter,
          useFactory: () =>
            isSentryEnabled() ? new SentryErrorReporter() : new NoopErrorReporter(),
        },
        {
          provide: DATABASE_HANDLE,
          useFactory: () => createDatabase(config),
        },
        {
          provide: PLATFORM.Database,
          inject: [DATABASE_HANDLE],
          useFactory: (handle: DatabaseHandle) => handle.db,
        },
        {
          provide: PLATFORM.EmailSender,
          useFactory: (): EmailSender =>
            config.EMAIL_TRANSPORT === 'ses'
              ? new SesEmailSender(
                  new SESv2Client({}),
                  config.EMAIL_FROM,
                  config.SES_CONFIGURATION_SET,
                )
              : new SmtpEmailSender({
                  host: config.SMTP_HOST ?? 'localhost',
                  port: config.SMTP_PORT ?? 1025,
                  secure: config.SMTP_SECURE,
                  user: config.SMTP_USER,
                  password: config.SMTP_PASSWORD,
                  from: config.EMAIL_FROM,
                }),
        },
        {
          provide: PLATFORM.JobLock,
          inject: [DATABASE_HANDLE],
          useFactory: (handle: DatabaseHandle) => new PostgresJobLock(handle.pool),
        },
        {
          provide: PLATFORM.UnitOfWork,
          inject: [DATABASE_HANDLE],
          useFactory: (handle: DatabaseHandle) => new DrizzleUnitOfWork(handle.db),
        },
        {
          provide: PLATFORM.EventRecorder,
          inject: [PLATFORM.UnitOfWork],
          useFactory: (uow: DrizzleUnitOfWork) => new DrizzleEventRecorder(uow),
        },
        {
          provide: PLATFORM.Redis,
          useFactory: () =>
            new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true }),
        },
        {
          provide: PLATFORM.Realtime,
          inject: [PLATFORM.Redis, PLATFORM.Logger],
          useFactory: (redis: Redis, log: Logger) => new RedisRealtime(redis, log),
        },
        {
          provide: PLATFORM.RateLimiter,
          inject: [PLATFORM.Redis],
          useFactory: (redis: Redis) => new RedisRateLimiter(redis),
        },
        {
          provide: ACCESS_TOKENS.Issuer,
          inject: [PLATFORM.Clock],
          useFactory: (clock: Clock) =>
            JoseAccessTokens.create(
              {
                privateKeyPem: decode(config.JWT_PRIVATE_KEY_BASE64),
                publicKeyPem: decode(config.JWT_PUBLIC_KEY_BASE64),
                keyId: config.JWT_KEY_ID,
                issuer: config.JWT_ISSUER,
                audience: config.JWT_AUDIENCE,
                ttlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
              },
              clock,
            ),
        },
        { provide: ACCESS_TOKENS.Verifier, useExisting: ACCESS_TOKENS.Issuer },
        AuthGuard,
        PlatformLifecycle,
      ],
      exports: [
        PLATFORM.Config,
        PLATFORM.Logger,
        PLATFORM.Clock,
        PLATFORM.ErrorReporter,
        PLATFORM.Database,
        PLATFORM.JobLock,
        PLATFORM.EmailSender,
        PLATFORM.UnitOfWork,
        PLATFORM.EventRecorder,
        PLATFORM.Redis,
        PLATFORM.RateLimiter,
        PLATFORM.Realtime,
        ACCESS_TOKENS.Issuer,
        ACCESS_TOKENS.Verifier,
        AuthGuard,
      ],
    };
  }
}
