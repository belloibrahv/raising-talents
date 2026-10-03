import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InMemoryRateLimiter } from '../src/platform/testing/fakes.js';
import { PLATFORM } from '../src/platform/platform.tokens.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const SECRET = 'a-proxy-secret-of-at-least-32-characters';

describe('Who may name the client address', () => {
  let testApp: TestApp;

  const signIn = (headers: Record<string, string>) =>
    testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      headers,
      payload: {
        email: 'nobody.here@example.com',
        password: 'relay-baton-ikorodu-26',
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a71',
      },
    });
  const countedIps = () =>
    [...testApp.moduleRef.get<InMemoryRateLimiter>(PLATFORM.RateLimiter).counts.keys()]
      .filter((key) => key.startsWith('sign-in:ip:'))
      .map((key) => key.replace('sign-in:ip:', ''));

  beforeAll(async () => {
    testApp = await createTestApp({ PROXY_SECRET: SECRET });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('counts limits against the client our proxy names', async () => {
    await signIn({ 'x-proxy-secret': SECRET, 'x-forwarded-for': '102.89.1.10' });
    expect(countedIps()).toContain('102.89.1.10');
  });

  it('ignores a forwarded address from anyone without the secret', async () => {
    await signIn({ 'x-forwarded-for': '203.0.113.7' });
    await signIn({
      'x-proxy-secret': 'a-wrong-secret-of-at-least-32-characters!',
      'x-forwarded-for': '203.0.113.8',
    });
    expect(countedIps()).not.toContain('203.0.113.7');
    expect(countedIps()).not.toContain('203.0.113.8');
  });
});
