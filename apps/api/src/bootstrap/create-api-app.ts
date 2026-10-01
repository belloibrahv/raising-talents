import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Logger } from 'pino';
import { AppModule } from '../app.module.js';
import type { AppConfig } from '../config/env.js';
import { newId } from '../platform/ids.js';
import { ProblemDetailsFilter } from '../platform/http/problem-details.filter.js';
import { PinoNestLogger } from '../platform/logging/logger.js';

const ONE_MEGABYTE = 1_048_576;

export function createFastifyAdapter(config: AppConfig): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: ONE_MEGABYTE,
    genReqId: () => newId(),
  });
}

export async function createApiApp(
  config: AppConfig,
  logger: Logger,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register({ config, logger }),
    createFastifyAdapter(config),
    { logger: new PinoNestLogger(logger) },
  );
  return configureApiApp(app, logger);
}

/**
 * Filters, shutdown hooks and request logging. Shared with the end-to-end tests,
 * so they exercise exactly what production runs.
 */
export function configureApiApp(
  app: NestFastifyApplication,
  logger: Logger,
): NestFastifyApplication {
  app.useGlobalFilters(new ProblemDetailsFilter(logger));
  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onResponse', async (request, reply) => {
      logger.info(
        {
          reqId: request.id,
          method: request.method,
          route: request.routeOptions.url,
          status: reply.statusCode,
          durationMs: Math.round(reply.elapsedTime),
        },
        'request completed',
      );
    });
  return app;
}
