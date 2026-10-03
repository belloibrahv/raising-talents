import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';
import { sentryOptions } from './telemetry.js';

describe('sentryOptions', () => {
  const options = sentryOptions('https://key@sentry.example/1', {
    environment: 'test',
    serviceVersion: '0.0.0',
  });

  it('collects no bodies, local variables, database values, cookies or user info', () => {
    expect(options.dataCollection).toMatchObject({
      httpBodies: [],
      stackFrameVariables: false,
      databaseQueryData: false,
      cookies: false,
      userInfo: false,
      urlQueryParams: false,
    });
  });

  it('strips request data and secret headers before sending', () => {
    const event = {
      request: {
        data: '{"password":"striker-number-nine"}',
        cookies: { session: 'abc' },
        headers: { authorization: 'Bearer eyJhbGciOi', 'user-agent': 'RaisingTalents/0.1' },
      },
    } as unknown as ErrorEvent;
    const sent = options.beforeSend?.(event, {}) as ErrorEvent;
    expect(sent.request?.data).toBeUndefined();
    expect(sent.request?.cookies).toBeUndefined();
    expect(sent.request?.headers).toEqual({ 'user-agent': 'RaisingTalents/0.1' });
  });

  it('leaves tracing to OpenTelemetry', () => {
    expect(options.enableOpenTelemetrySetup).toBe(false);
  });
});
