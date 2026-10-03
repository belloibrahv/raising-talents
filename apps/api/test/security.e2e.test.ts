import type { ProblemDetails, SignedInDevices } from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const EMAIL = 'kunle.drums@example.com';
const PASSWORD = 'relay-baton-ikorodu-26';
const NEW_PASSWORD = 'talking-drum-oyo-sunset-27';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DEVICE = {
  phone: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a41',
  tablet: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a42',
  laptop: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a43',
};

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe('Account security over HTTP', () => {
  let testApp: TestApp;
  let phone: Tokens;

  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, token: string, payload?: object) =>
    testApp.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  const signIn = async (deviceId: string, userAgent: string, password = PASSWORD) => {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      headers: { 'user-agent': userAgent },
      payload: { email: EMAIL, password, deviceId },
    });
    return response;
  };

  const refresh = (tokens: Tokens, deviceId: string) =>
    testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: tokens.refreshToken, deviceId },
    });

  beforeAll(async () => {
    testApp = await createTestApp();
    const signUp = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      headers: { 'user-agent': ANDROID },
      payload: {
        email: EMAIL,
        password: PASSWORD,
        dateOfBirth: '1995-12-01',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: DEVICE.phone,
      },
    });
    phone = signUp.json<{ tokens: Tokens }>().tokens;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('lists signed-in devices by name, marks this one, and signs one out', async () => {
    const tablet = (await signIn(DEVICE.tablet, IPHONE)).json<{ tokens: Tokens }>().tokens;
    const list = (await call('GET', '/v1/me/sessions', phone.accessToken)).json<SignedInDevices>();
    expect(list.items.map((item) => [item.device, item.current]).sort()).toEqual([
      ['Chrome on Android', true],
      ['Safari on iPhone', false],
    ]);

    const tabletId = list.items.find((item) => !item.current)?.id ?? '';
    expect(
      (await call('DELETE', `/v1/me/sessions/${tabletId}`, phone.accessToken)).statusCode,
    ).toBe(204);
    expect((await refresh(tablet, DEVICE.tablet)).json<ProblemDetails>().code).toBe(
      'SESSION_REVOKED',
    );
    const after = (await call('GET', '/v1/me/sessions', phone.accessToken)).json<SignedInDevices>();
    expect(after.items).toHaveLength(1);
  });

  it('signs out every other device and keeps this one', async () => {
    const laptop = (await signIn(DEVICE.laptop, IPHONE)).json<{ tokens: Tokens }>().tokens;
    expect(
      (await call('POST', '/v1/me/sessions/sign-out-others', phone.accessToken)).statusCode,
    ).toBe(204);
    expect((await refresh(laptop, DEVICE.laptop)).statusCode).toBe(401);
    const kept = await refresh(phone, DEVICE.phone);
    expect(kept.statusCode).toBe(200);
    phone = kept.json<{ tokens: Tokens }>().tokens;
  });

  it('changes the password with the current one, signs out other devices and emails the owner', async () => {
    const laptop = (await signIn(DEVICE.laptop, IPHONE)).json<{ tokens: Tokens }>().tokens;
    const wrong = await call('POST', '/v1/me/password', phone.accessToken, {
      currentPassword: 'not-the-password',
      newPassword: NEW_PASSWORD,
    });
    expect(wrong.json<ProblemDetails>().code).toBe('INVALID_CREDENTIALS');
    const same = await call('POST', '/v1/me/password', phone.accessToken, {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });
    expect(same.json<ProblemDetails>().code).toBe('WEAK_PASSWORD');

    const changed = await call('POST', '/v1/me/password', phone.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(changed.statusCode).toBe(204);
    expect((await refresh(laptop, DEVICE.laptop)).statusCode).toBe(401);
    const kept = await refresh(phone, DEVICE.phone);
    expect(kept.statusCode).toBe(200);
    phone = kept.json<{ tokens: Tokens }>().tokens;

    expect((await signIn(DEVICE.laptop, IPHONE)).json<ProblemDetails>().code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect((await signIn(DEVICE.laptop, IPHONE, NEW_PASSWORD)).statusCode).toBe(200);
    await testApp.deliverEvents();
    expect(testApp.email.sent.at(-1)?.subject).toBe('Your Raising Talents password was changed');
  });

  it('ignores an attempt to sign out a device on someone else account', async () => {
    const other = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email: 'someone.else@example.com',
        password: PASSWORD,
        dateOfBirth: '1990-01-01',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a49',
      },
    });
    const intruder = other.json<{ tokens: Tokens }>().tokens;
    const mine = (await call('GET', '/v1/me/sessions', phone.accessToken)).json<SignedInDevices>();
    const target = mine.items.find((item) => item.current)?.id ?? '';
    expect(
      (await call('DELETE', `/v1/me/sessions/${target}`, intruder.accessToken)).statusCode,
    ).toBe(204);
    expect((await refresh(phone, DEVICE.phone)).statusCode).toBe(200);
  });
});
