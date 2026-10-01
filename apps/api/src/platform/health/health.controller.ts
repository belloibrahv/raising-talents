import { Controller, Get, HttpCode, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../database/client.js';
import { ErrorCode } from '@rt/contracts';
import { ProblemException } from '../http/problem.js';
import { PLATFORM } from '../platform.tokens.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PLATFORM.Database) private readonly db: Database,
    @Inject(PLATFORM.Redis) private readonly redis: Redis,
  ) {}

  /** The process is up. Used by ECS to restart dead tasks. */
  @Get('live')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** The process can serve traffic: database and Redis answer. */
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await Promise.all([this.db.execute(sql`select 1`), this.redis.ping()]);
      return { status: 'ok' };
    } catch {
      // 503 tells the load balancer to stop sending traffic to this task until it recovers.
      throw new ProblemException({
        type: 'https://api.raisingtalents.app/errors/dependency-unavailable',
        title: 'Service unavailable',
        status: 503,
        code: ErrorCode.Internal,
        detail: 'The database or Redis is not reachable',
      });
    }
  }
}
