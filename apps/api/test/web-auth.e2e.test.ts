import type { ProblemDetails, WebAuthResponse } from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, E2E_WEB_ORIGIN, type TestApp } from './support/create-test-app.js';

const DEVICE = '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6c';

describe('Web sessions over HTTP', () => {
  let testApp: TestApp;

  const post = (url: string, payload: object = {}, headers: Record<string, string> = {}) =>
    testApp.app.inject({
      method: 'POST',
      url,
      payload,
      headers: { origin: E2E_WEB_ORIGIN, ...headers },
    });

  /** The refresh cookie's value from a Set-Cookie header, and the header itself. */
  function cookieFrom(response: {
    headers: Record<string, string | string[] | number | undefined>;
  }) {
    const raw = response.headers['set-cookie'];
    const header = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
    const value = /^rt_refresh=([^;]*)/.exec(header)?.[1] ?? '';
    return { header, value };
  }

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('answers CORS preflight for the web app only', async () => {
    const allowed = await testApp.app.inject({
      method: 'OPTIONS',
      url: '/v1/me',
      headers: {
        origin: E2E_WEB_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(E2E_WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await testApp.app.inject({
      method: 'OPTIONS',
      url: '/v1/me',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps the refresh token out of the body and in an HttpOnly, SameSite=Strict cookie', async () => {
    const signUp = await post('/v1/auth/web/sign-up', {
      email: 'folake.adebayo@example.com',
      password: 'aso-oke-weaver-abeokuta',
      dateOfBirth: '1998-06-14',
      countryCode: 'NG',
      acceptedTerms: true,
      deviceId: DEVICE,
    });
    expect(signUp.statusCode).toBe(201);
    const body = signUp.json<WebAuthResponse & { refreshToken?: string }>();
    expect(body.accessToken).toBeTruthy();
    expect(body.me.email).toBe('folake.adebayo@example.com');
    expect(JSON.stringify(body)).not.toContain('refreshToken');

    const { header, value } = cookieFrom(signUp);
    expect(value.length).toBeGreaterThan(30);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Secure');
    expect(header).toContain('Path=/v1/auth/web');
    expect(header).toMatch(/Max-Age=\d{6,}/);
  });

  it('rotates the cookie on refresh, and treats a replayed cookie as theft', async () => {
    const signIn = await post('/v1/auth/web/sign-in', {
      email: 'folake.adebayo@example.com',
      password: 'aso-oke-weaver-abeokuta',
      deviceId: DEVICE,
    });
    const first = cookieFrom(signIn).value;

    const refreshed = await post(
      '/v1/auth/web/refresh',
      { deviceId: DEVICE },
      { cookie: `theme=dark; rt_refresh=${first}` },
    );
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<WebAuthResponse>().accessToken).toBeTruthy();
    const second = cookieFrom(refreshed).value;
    expect(second).not.toBe(first);

    const replay = await post(
      '/v1/auth/web/refresh',
      { deviceId: DEVICE },
      { cookie: `rt_refresh=${first}` },
    );
    expect(replay.json<ProblemDetails>().code).toBe('SESSION_REVOKED');
    expect(cookieFrom(replay).header).toContain('Max-Age=0');

    // Reuse ends the whole family, including the cookie issued after it.
    const after = await post(
      '/v1/auth/web/refresh',
      { deviceId: DEVICE },
      { cookie: `rt_refresh=${second}` },
    );
    expect(after.statusCode).toBe(401);
  });

  it('refuses calls from another origin or with no origin, and refresh with no cookie', async () => {
    const credentials = {
      email: 'folake.adebayo@example.com',
      password: 'aso-oke-weaver-abeokuta',
      deviceId: DEVICE,
    };
    const foreign = await post('/v1/auth/web/sign-in', credentials, {
      origin: 'https://evil.example',
    });
    expect(foreign.statusCode).toBe(403);
    const none = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/web/sign-in',
      payload: credentials,
    });
    expect(none.statusCode).toBe(403);
    const noCookie = await post('/v1/auth/web/refresh', { deviceId: DEVICE });
    expect(noCookie.json<ProblemDetails>().code).toBe('UNAUTHENTICATED');
  });

  it('signs out by revoking the session and clearing the cookie', async () => {
    const signIn = await post('/v1/auth/web/sign-in', {
      email: 'folake.adebayo@example.com',
      password: 'aso-oke-weaver-abeokuta',
      deviceId: DEVICE,
    });
    const cookie = `rt_refresh=${cookieFrom(signIn).value}`;
    const signOut = await post('/v1/auth/web/sign-out', {}, { cookie });
    expect(signOut.statusCode).toBe(204);
    expect(cookieFrom(signOut).header).toContain('Max-Age=0');
    const refresh = await post('/v1/auth/web/refresh', { deviceId: DEVICE }, { cookie });
    expect(refresh.statusCode).toBe(401);
  });
});
