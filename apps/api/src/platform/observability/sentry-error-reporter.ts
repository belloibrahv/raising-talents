import * as Sentry from '@sentry/node';
import { currentTraceId } from './trace-context.js';
import type { ErrorReporter } from './error-reporter.js';

/** Reports to Sentry, tagged with the trace id so an error leads straight to its trace in Grafana. */
export class SentryErrorReporter implements ErrorReporter {
  capture(error: unknown, context: Record<string, string | number | boolean> = {}): void {
    Sentry.withScope((scope) => {
      const traceId = currentTraceId();
      if (traceId) scope.setTag('trace_id', traceId);
      for (const [key, value] of Object.entries(context)) scope.setTag(key, String(value));
      Sentry.captureException(error);
    });
  }
}
