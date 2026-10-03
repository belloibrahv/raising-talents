import { prepareBreadcrumb, prepareEvent } from './sentry-event';
import { toReport } from './should-report';

type SentryModule = typeof import('./sentry-client');

const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
let sentry: Promise<SentryModule> | null = null;

/**
 * Error tracking runs only in builds that set VITE_SENTRY_DSN. The SDK is fetched after the
 * app has started, so it never slows the first screen, and only when reporting is on.
 * If fetching it fails (no signal), the next report tries again.
 */
export function initErrorReporting(): Promise<SentryModule> | null {
  if (!dsn) return null;
  sentry ??= import('./sentry-client')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: (import.meta.env['VITE_APP_ENV'] as string | undefined) ?? 'development',
        release: import.meta.env['VITE_RELEASE'] as string | undefined,
        sendDefaultPii: false,
        // Errors only for now; no tracing and no session replay (which would record screens).
        tracesSampleRate: 0,
        beforeSend: (event, hint) => prepareEvent(event, hint.originalException),
        beforeBreadcrumb: (crumb) => prepareBreadcrumb(crumb),
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
    })
    .catch((error: unknown) => {
      sentry = null;
      throw error;
    });
  return sentry;
}

/** Sends the error if it is worth reporting. Safe to call when reporting is off. */
export function reportError(error: unknown, context: Record<string, string> = {}): void {
  const report = toReport(error);
  const loading = report ? initErrorReporting() : null;
  if (!report || !loading) return;
  loading
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        for (const [key, value] of Object.entries({ ...report.tags, ...context })) {
          scope.setTag(key, value);
        }
        Sentry.captureException(report.error);
      });
    })
    // Nowhere to send it right now; the error itself is already shown to the person.
    .catch(() => undefined);
}
