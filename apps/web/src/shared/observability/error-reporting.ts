import { toReport } from './should-report';

type SentryModule = typeof import('./sentry-client');

const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
let sentry: Promise<SentryModule> | null = null;

/**
 * Error tracking runs only in builds that set VITE_SENTRY_DSN. The SDK is fetched after the
 * app has started, so it never slows the first screen, and only when reporting is on.
 */
export function initErrorReporting(): void {
  if (!dsn || sentry) return;
  sentry = import('./sentry-client').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: (import.meta.env['VITE_APP_ENV'] as string | undefined) ?? 'development',
      release: import.meta.env['VITE_RELEASE'] as string | undefined,
      sendDefaultPii: false,
      // Errors only for now; no tracing and no session replay (which would record screens).
      tracesSampleRate: 0,
      beforeSend(event) {
        // Request bodies can hold passwords, codes and dates of birth.
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          delete event.request.headers;
        }
        return event;
      },
      // Lost signal and stale chunks after a release are expected, not bugs.
      ignoreErrors: [
        'Failed to fetch',
        'Load failed',
        'NetworkError when attempting to fetch resource',
        /Failed to fetch dynamically imported module/,
        /Importing a module script failed/,
      ],
    });
    return Sentry;
  });
}

/** Sends the error if it is worth reporting. Safe to call when reporting is off. */
export function reportError(error: unknown, context: Record<string, string> = {}): void {
  if (!sentry) return;
  const report = toReport(error);
  if (!report) return;
  void sentry.then((Sentry) => {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries({ ...report.tags, ...context })) {
        scope.setTag(key, value);
      }
      Sentry.captureException(report.error);
    });
  });
}
