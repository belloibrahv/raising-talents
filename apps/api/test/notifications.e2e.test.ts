import type { DataExport, NotificationPage } from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';

describe('Notification inbox over HTTP', () => {
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
        email: 'tola.inbox@example.com',
        password: PASSWORD,
        dateOfBirth: '1994-04-04',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a51',
      },
    });
    token = signUp.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    await testApp.deliverEvents();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('starts empty, collects notices, counts unread and marks them read', async () => {
    expect((await call('GET', '/v1/me/notifications')).json<NotificationPage>()).toEqual({
      items: [],
      unread: 0,
      nextCursor: null,
    });

    await call('POST', '/v1/me/password', {
      currentPassword: PASSWORD,
      newPassword: 'talking-drum-oyo-sunset-27',
    });
    testApp.clock.advanceSeconds(60);
    await call('POST', '/v1/me/deletion', { password: 'talking-drum-oyo-sunset-27' });
    await testApp.deliverEvents();
    await testApp.deliverEvents();

    const page = (await call('GET', '/v1/me/notifications')).json<NotificationPage>();
    expect(page.unread).toBe(2);
    expect(page.items.map((item) => [item.kind, item.read])).toEqual([
      ['deletion_scheduled', false],
      ['password_changed', false],
    ]);
    expect((await call('GET', '/v1/me/notifications/unread')).json()).toEqual({ unread: 2 });

    expect((await call('POST', '/v1/me/notifications/read')).statusCode).toBe(204);
    expect((await call('GET', '/v1/me/notifications/unread')).json()).toEqual({ unread: 0 });
    const exported = (await call('GET', '/v1/me/export')).json<DataExport>();
    expect(exported.notifications.map((item) => [item.kind, item.read])).toEqual([
      ['deletion_scheduled', true],
      ['password_changed', true],
    ]);
  });
});
