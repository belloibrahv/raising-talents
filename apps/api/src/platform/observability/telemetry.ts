import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import * as Sentry from '@sentry/node';

export interface TelemetrySettings {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
  /** OTLP over HTTP. Grafana Cloud in staging and production. Tracing is off when unset. */
  readonly otlpEndpoint: string | undefined;
  /** Error tracking is off when unset. */
  readonly sentryDsn: string | undefined;
}

let sdk: NodeSDK | undefined;
let sentryEnabled = false;

const HEADERS_NEVER_SENT = ['authorization', 'cookie', 'x-api-key'];

/**
 * Sentry collects user info, headers, cookies, request bodies, database values and
 * local variables by default. Our requests carry passwords, refresh tokens, codes
 * and dates of birth, so every category is set explicitly. beforeSend is a second layer.
 */
export function sentryOptions(
  dsn: string,
  settings: Pick<TelemetrySettings, 'environment' | 'serviceVersion'>,
): Sentry.NodeOptions {
  return {
    dsn,
    environment: settings.environment,
    release: settings.serviceVersion,
    // Traces go to Grafana through our own OpenTelemetry setup. Sentry only receives errors,
    // so it must not register a competing tracer provider.
    enableOpenTelemetrySetup: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { allow: ['user-agent', 'content-type', 'x-trace-id'] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        for (const header of HEADERS_NEVER_SENT) delete event.request.headers?.[header];
      }
      return event;
    },
  };
}

/**
 * Starts tracing and error tracking. Runs before the application is imported
 * (see instrument.ts), because instrumentation must wrap libraries as they load.
 */
export function startTelemetry(settings: TelemetrySettings): void {
  if (settings.otlpEndpoint) {
    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: settings.serviceName,
        [ATTR_SERVICE_VERSION]: settings.serviceVersion,
        'deployment.environment.name': settings.environment,
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${settings.otlpEndpoint.replace(/\/$/, '')}/v1/traces`,
      }),
      instrumentations: [
        new HttpInstrumentation({
          // Health checks run every few seconds and would bury real traffic.
          ignoreIncomingRequestHook: (request) => request.url?.startsWith('/health') ?? false,
        }),
        new UndiciInstrumentation(),
        // SQL with $1 placeholders is kept. Parameter values (emails, dates of birth) never are.
        new PgInstrumentation({ enhancedDatabaseReporting: false }),
        // Only the command name: rate limit keys contain email addresses.
        new IORedisInstrumentation({ dbStatementSerializer: (command) => command }),
        // No NestJS instrumentation: the official one supports NestJS up to 11. Server spans
        // are named from the matched route in create-api-app.ts instead.
      ],
    });
    sdk.start();
  }

  if (settings.sentryDsn) {
    Sentry.init(sentryOptions(settings.sentryDsn, settings));
    sentryEnabled = true;
  }
}

export const isSentryEnabled = (): boolean => sentryEnabled;

/** Sends what is still buffered. Called on shutdown so the last spans and errors are not lost. */
export async function flushTelemetry(): Promise<void> {
  await Promise.allSettled([sdk?.shutdown(), sentryEnabled ? Sentry.close(2000) : undefined]);
}
