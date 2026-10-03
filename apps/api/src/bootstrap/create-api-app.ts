import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Logger } from 'pino';
import { AppModule } from '../app.module.js';
import type { AppConfig } from '../config/env.js';
import { newId } from '../platform/ids.js';
import { ProblemDetailsFilter } from '../platform/http/problem-details.filter.js';
import { PinoNestLogger } from '../platform/logging/logger.js';
import type { ErrorReporter } from '../platform/observability/error-reporter.js';
import { currentTraceId, nameServerSpan } from '../platform/observability/trace-context.js';
import { PLATFORM } from '../platform/platform.tokens.js';

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
    // rawBody keeps the exact bytes for webhook signature checks; parsed bodies are unchanged.
    { logger: new PinoNestLogger(logger), rawBody: true },
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
  app.useGlobalFilters(
    new ProblemDetailsFilter(logger, app.get<ErrorReporter>(PLATFORM.ErrorReporter)),
  );
  // Browsers may call the API only from the web app's origins. Credentials are allowed
  // so the refresh cookie reaches the web auth endpoints; everything else uses bearer tokens.
  const config = app.get<AppConfig>(PLATFORM.Config);
  app.enableCors({
    origin: config.WEB_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', 'if-match', 'accept'],
    exposedHeaders: ['etag', 'x-trace-id', 'retry-after'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
  const fastify = app.getHttpAdapter().getInstance();
  // Names the request's trace after its route, so /v1/talents/{id} groups as one operation.
  fastify.addHook('onRequest', (request, _reply, done) => {
    nameServerSpan(request.method, request.routeOptions.url);
    done();
  });
  // Lets the app attach the trace id to its own error reports.
  fastify.addHook('onSend', (request, reply, payload, done) => {
    void reply.header('x-trace-id', currentTraceId() ?? request.id);
    done(null, payload);
  });
  fastify.addHook('onResponse', async (request, reply) => {
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
