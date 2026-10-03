import { describe, expect, expectTypeOf, it } from 'vitest';
import type { MeResponse } from '@rt/contracts';
import { MemorySessionStorage } from '../storage/session-storage';
import { createApi } from './api';
import { HttpClient } from './http-client';

const me: MeResponse = {
  id: '0192a3b4-0000-7000-8000-000000000001',
  email: 'aisha.bello@example.com',
  emailVerified: true,
  role: 'agent',
  roleLocked: false,
  status: 'onboarding',
  countryCode: 'NG',
  createdAt: '2026-10-01T09:00:00.000Z',
};

function setup() {
  const calls: { url: string; method: string; auth: boolean; body: unknown }[] = [];
  const http = new HttpClient({
    baseUrl: 'https://api.test',
    storage: new MemorySessionStorage({
      accessToken: 'access-1',
      accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
      refreshToken: 'r'.repeat(43),
      refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    }),
    deviceId: () => Promise.resolve('0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b'),
    onSessionEnded: () => undefined,
    fetch: (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        auth: headers.has('authorization'),
        body: init?.body ? (JSON.parse(init.body as string) as unknown) : undefined,
      });
      return Promise.resolve(
        url.endsWith('/resend') ? new Response(null, { status: 202 }) : Response.json(me),
      );
    },
  });
  return { api: createApi(http), calls };
}

describe('createApi', () => {
  it('takes path, method and token use from the catalogue', async () => {
    const { api, calls } = setup();
    await api.call('me.selectRole', { body: { role: 'agent' } });
    await api.call('auth.resendVerification');
    expect(calls).toEqual([
      { url: 'https://api.test/v1/me/role', method: 'POST', auth: true, body: { role: 'agent' } },
      {
        url: 'https://api.test/v1/auth/verify-email/resend',
        method: 'POST',
        auth: true,
        body: undefined,
      },
    ]);
  });

  it('validates and types the response', async () => {
    const { api } = setup();
    const result = await api.call('me.get');
    expectTypeOf(result).toEqualTypeOf<MeResponse>();
    expect(result.email).toBe('aisha.bello@example.com');
  });

  it('rejects wrong calls at compile time', () => {
    const { api } = setup();
    const neverRun = () => {
      // @ts-expect-error selectRole needs a body
      void api.call('me.selectRole');
      // @ts-expect-error role must be talent or agent
      void api.call('me.selectRole', { body: { role: 'admin' } });
      // @ts-expect-error there is no such endpoint
      void api.call('me.delete');
    };
    expect(typeof neverRun).toBe('function');
  });
});
