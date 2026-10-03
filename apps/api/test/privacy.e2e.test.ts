import type { DataExport, MeResponse, ProblemDetails } from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';

describe('Privacy over HTTP', () => {
  let testApp: TestApp;
  let token: string;

  const call = (method: 'GET' | 'POST', url: string, payload?: object) =>
    testApp.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    testApp = await createTestApp();
    const signUp = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email: 'yemi.alade@example.com',
        password: PASSWORD,
        dateOfBirth: '1997-03-08',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a11',
      },
    });
    token = signUp.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('downloads the export as a file that no cache keeps', async () => {
    const response = await call('GET', '/v1/me/export');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="raising-talents-data.json"',
    );
    expect(response.json<DataExport>().account.email).toBe('yemi.alade@example.com');
  });

  it('refuses a wrong password, schedules deletion with the right one, and cancels', async () => {
    const wrong = await call('POST', '/v1/me/deletion', { password: 'not-it' });
    expect(wrong.json<ProblemDetails>().code).toBe('INVALID_CREDENTIALS');

    const scheduled = await call('POST', '/v1/me/deletion', { password: PASSWORD });
    expect(scheduled.json<MeResponse>()).toMatchObject({ status: 'pending_deletion' });
    expect(scheduled.json<MeResponse>().deletionScheduledAt).not.toBeNull();
    expect((await call('GET', '/v1/me')).json<MeResponse>().status).toBe('pending_deletion');

    const kept = await call('POST', '/v1/me/deletion/cancel');
    expect(kept.json<MeResponse>()).toMatchObject({
      status: 'onboarding',
      deletionScheduledAt: null,
    });
  });
});
