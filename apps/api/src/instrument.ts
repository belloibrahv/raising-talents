// Loaded with --import before the application, so instrumentation can wrap
// http, pg, ioredis and NestJS as they are first imported.
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined;
const sentryDsn = process.env.SENTRY_DSN || undefined;

/**
 * Lets OpenTelemetry patch ES modules (NestJS 12 and several of its dependencies are ESM).
 * Synchronous in-thread hooks where Node supports them (22.22.3 and later); otherwise the
 * older off-thread loader, which Node has deprecated but still runs.
 */
async function registerModuleHooks(): Promise<void> {
  const hooks = await import('import-in-the-middle/register-hooks.mjs');
  if (hooks.supportsSyncHooks()) {
    hooks.register();
    return;
  }
  // Fallback for Node before 22.22.3, see above.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
}

if (otlpEndpoint || sentryDsn) {
  if (otlpEndpoint) await registerModuleHooks();

  const { version } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const entry = process.argv[1] ?? '';
  const processName = entry.includes('main.worker') ? 'worker' : 'api';
  const { startTelemetry } = await import('./platform/observability/telemetry.js');

  startTelemetry({
    serviceName: process.env.OTEL_SERVICE_NAME ?? `raising-talents-${processName}`,
    serviceVersion: process.env.APP_VERSION ?? version,
    environment: process.env.NODE_ENV ?? 'development',
    otlpEndpoint,
    sentryDsn,
  });
}
