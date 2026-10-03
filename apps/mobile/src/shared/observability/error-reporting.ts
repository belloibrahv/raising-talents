import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';
import { toReport } from './should-report';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Error tracking runs only in builds that set EXPO_PUBLIC_SENTRY_DSN (see eas.json). */
export function initErrorReporting(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    sendDefaultPii: false,
    // Performance tracing is not on yet. Errors only.
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
  });
}

/** Sends the error if it is worth reporting. Safe to call when reporting is off. */
export function reportError(error: unknown): void {
  if (!dsn) return;
  const report = toReport(error);
  if (!report) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(report.tags)) scope.setTag(key, value);
    Sentry.captureException(report.error);
  });
}

/** Wraps the root component so native crashes and render errors are captured. */
export function withErrorReporting(component: ComponentType): ComponentType {
  return dsn ? Sentry.wrap(component as ComponentType<Record<string, unknown>>) : component;
}
