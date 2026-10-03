import type {
  MeResponse,
  NotificationPage,
  PendingEmailChange,
  ProblemDetails,
} from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';
const OLD = 'bisi.old@example.com';
const NEW = 'bisi.new@example.com';
const DEVICE = '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a61';

describe('Changing the email address over HTTP', () => {
  let testApp: TestApp;
  let token: string;

  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    testApp.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  const signUp = (email: string) =>
    testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email,
        password: PASSWORD,
        dateOfBirth: '1993-06-06',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: DEVICE,
      },
    });
  const signIn = (email: string) =>
    testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { email, password: PASSWORD, deviceId: DEVICE },
    });
  const subjectsTo = (address: string) =>
    testApp.email.sent
      .filter((message) => message.to === address)
      .map((message) => message.subject);

  beforeAll(async () => {
    testApp = await createTestApp();
    token = (await signUp(OLD)).json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    await signUp('someone.taken@example.com');
    await testApp.deliverEvents();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('needs the password and a free, different address', async () => {
    const wrong = await call('POST', '/v1/me/email', { newEmail: NEW, password: 'not-it-at-all' });
    expect(wrong.json<ProblemDetails>().code).toBe('INVALID_CREDENTIALS');
    const same = await call('POST', '/v1/me/email', { newEmail: OLD, password: PASSWORD });
    expect(same.json<ProblemDetails>().code).toBe('CONFLICT');
    const taken = await call('POST', '/v1/me/email', {
      newEmail: 'Someone.Taken@example.com',
      password: PASSWORD,
    });
    expect(taken.json<ProblemDetails>().code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('can be cancelled before the code is used', async () => {
    await call('POST', '/v1/me/email', { newEmail: 'bisi.maybe@example.com', password: PASSWORD });
    expect((await call('DELETE', '/v1/me/email/change')).statusCode).toBe(204);
    expect((await call('GET', '/v1/me/email/change')).statusCode).toBe(204);
    const late = await call('POST', '/v1/me/email/confirm', { code: '123456' });
    expect(late.json<ProblemDetails>().code).toBe('VERIFICATION_CODE_EXPIRED');
    await testApp.deliverEvents();
    expect(subjectsTo('bisi.maybe@example.com')).toEqual([]);
  });

  it('sends a code to the new address, warns the old one, and moves the account', async () => {
    testApp.clock.advanceSeconds(120);
    const requested = await call('POST', '/v1/me/email', { newEmail: NEW, password: PASSWORD });
    expect(requested.statusCode).toBe(202);
    expect(requested.json<PendingEmailChange>().newEmail).toBe(NEW);
    expect((await call('GET', '/v1/me/email/change')).json<PendingEmailChange>().newEmail).toBe(
      NEW,
    );

    await testApp.deliverEvents();
    const code = testApp.email.lastCodeFor(NEW) ?? '';
    expect(code).toMatch(/^\d{6}$/);
    expect(subjectsTo(OLD)).toContain('Someone asked to change your Raising Talents email');

    const guess = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    expect(
      (await call('POST', '/v1/me/email/confirm', { code: guess })).json<ProblemDetails>().code,
    ).toBe('VERIFICATION_CODE_INVALID');

    const moved = await call('POST', '/v1/me/email/confirm', { code });
    expect(moved.json<MeResponse>()).toMatchObject({ email: NEW, emailVerified: true });
    await testApp.deliverEvents();
    expect(subjectsTo(OLD)).toContain('Your Raising Talents email was changed');
    expect(
      testApp.email.sent.find((m) => m.to === OLD && m.subject.includes('was changed'))?.text,
    ).not.toContain(NEW);
    expect((await call('GET', '/v1/me/email/change')).statusCode).toBe(204);

    const inbox = (await call('GET', '/v1/me/notifications')).json<NotificationPage>();
    expect(inbox.items.map((item) => item.kind)).toContain('email_changed');
    expect((await signIn(NEW)).statusCode).toBe(200);
    expect((await signIn(OLD)).json<ProblemDetails>().code).toBe('INVALID_CREDENTIALS');
  });

  it('ties each code to its address: an earlier code cannot confirm a later request', async () => {
    // A fresh account: the earlier tests used this hour's requests for the first one.
    token = (await signUp('tunde.codes@example.com')).json<{ tokens: { accessToken: string } }>()
      .tokens.accessToken;
    await testApp.deliverEvents();
    await call('POST', '/v1/me/email', { newEmail: 'bisi.first@example.com', password: PASSWORD });
    await testApp.deliverEvents();
    const firstCode = testApp.email.lastCodeFor('bisi.first@example.com') ?? '';
    testApp.clock.advanceSeconds(120);
    await call('POST', '/v1/me/email', { newEmail: 'bisi.second@example.com', password: PASSWORD });
    const reused = await call('POST', '/v1/me/email/confirm', { code: firstCode });
    expect(reused.json<ProblemDetails>().code).toBe('VERIFICATION_CODE_EXPIRED');
    expect((await call('GET', '/v1/me')).json<MeResponse>().email).toBe('tunde.codes@example.com');

    await testApp.deliverEvents();
    const secondCode = testApp.email.lastCodeFor('bisi.second@example.com') ?? '';
    const moved = await call('POST', '/v1/me/email/confirm', { code: secondCode });
    expect(moved.json<MeResponse>().email).toBe('bisi.second@example.com');
  });
});
