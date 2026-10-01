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
import { DrizzleUnitOfWork } from './database/drizzle-unit-of-work.js';
import { HealthController } from './health/health.controller.js';
import { AuthGuard } from './http/auth.guard.js';
import { DrizzleEventRecorder } from './outbox/drizzle-event-recorder.js';
import { PLATFORM } from './platform.tokens.js';
import { RedisRateLimiter } from './rate-limit/redis-rate-limiter.js';

const DATABASE_HANDLE = Symbol('DatabaseHandle');

/** Closes connections when the process shuts down, so deploys drain cleanly. */
class PlatformLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_HANDLE) private readonly database: DatabaseHandle,
    @Inject(PLATFORM.Redis) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.database.close(), this.redis.quit()]);
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
      controllers: [HealthController],
      providers: [
        { provide: PLATFORM.Config, useValue: config },
        { provide: PLATFORM.Logger, useValue: logger },
        { provide: PLATFORM.Clock, useClass: SystemClock },
        {
          provide: DATABASE_HANDLE,
          useFactory: () => createDatabase(config.DATABASE_URL, config.DATABASE_POOL_MAX),
        },
        {
          provide: PLATFORM.Database,
          inject: [DATABASE_HANDLE],
          useFactory: (handle: DatabaseHandle) => handle.db,
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
        PLATFORM.Database,
        PLATFORM.UnitOfWork,
        PLATFORM.EventRecorder,
        PLATFORM.Redis,
        PLATFORM.RateLimiter,
        ACCESS_TOKENS.Issuer,
        ACCESS_TOKENS.Verifier,
        AuthGuard,
      ],
    };
  }
}
