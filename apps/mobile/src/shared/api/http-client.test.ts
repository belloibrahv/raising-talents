import { meResponseSchema, type SessionTokens } from '@rt/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemorySessionStorage } from '../storage/session-storage';
import { ApiError, NetworkError } from './api-error';
import { HttpClient } from './http-client';

const NOW = new Date('2026-10-01T09:00:00.000Z');
const inMinutes = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const DEVICE = '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b';

const me = {
  id: '0192a3b4-0000-7000-8000-000000000001',
  email: 'ngozi.adeyemi@example.com',
  emailVerified: true,
  role: 'talent',
  roleLocked: false,
  status: 'onboarding',
  countryCode: 'NG',
  deletionScheduledAt: null,
  createdAt: NOW.toISOString(),
};

const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'Error', status, code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });

/**
 * A small stand-in for the API that enforces the real rule: each refresh token
 * works once. Presenting a used one revokes the session, like the server does.
 */
class FakeApi {
  validAccess = new Set<string>();
  liveRefresh = new Set<string>();
  usedRefresh = new Set<string>();
  refreshCalls = 0;
  revoked = false;
  offline = false;
  private counter = 0;

  issue(accessMinutes = 15): SessionTokens {
    this.counter += 1;
    const tokens = {
      accessToken: `access-${this.counter}`,
      accessTokenExpiresAt: inMinutes(accessMinutes),
      refreshToken: `refresh-${this.counter}-${'x'.repeat(40)}`,
      refreshTokenExpiresAt: inMinutes(60 * 24 * 30),
    };
    this.validAccess.add(tokens.accessToken);
    this.liveRefresh.add(tokens.refreshToken);
    return tokens;
  }

  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    await Promise.resolve();
    if (this.offline) throw new TypeError('Network request failed');
    const path = url.replace('https://api.test', '');
    if (path === '/v1/auth/refresh') {
      this.refreshCalls += 1;
      const body = JSON.parse(init?.body as string) as { refreshToken: string };
      if (this.usedRefresh.has(body.refreshToken)) {
        this.revoked = true;
        return problem(401, 'SESSION_REVOKED');
      }
      if (!this.liveRefresh.has(body.refreshToken)) return problem(401, 'SESSION_EXPIRED');
      this.liveRefresh.delete(body.refreshToken);
      this.usedRefresh.add(body.refreshToken);
      return Response.json({ tokens: this.issue(), me });
    }
    const auth = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '');
    if (!auth || !this.validAccess.has(auth)) return problem(401, 'SESSION_EXPIRED');
    return Response.json(me);
  };
}

describe('HttpClient', () => {
  let api: FakeApi;
  let storage: MemorySessionStorage;
  let sessionEnded: number;

  const client = () =>
    new HttpClient({
      baseUrl: 'https://api.test',
      storage,
      deviceId: () => Promise.resolve(DEVICE),
      onSessionEnded: () => {
        sessionEnded += 1;
      },
      fetch: api.fetch,
      now: () => NOW,
    });

  beforeEach(() => {
    api = new FakeApi();
    storage = new MemorySessionStorage();
    sessionEnded = 0;
  });

  it('sends the access token and validates the response', async () => {
    await storage.save(api.issue());
    const result = await client().request('/v1/me', { schema: meResponseSchema });
    expect(result.email).toBe('ngozi.adeyemi@example.com');
    expect(api.refreshCalls).toBe(0);
  });

  it('refreshes once for many parallel requests when the token has expired', async () => {
    const tokens = api.issue();
    api.validAccess.delete(tokens.accessToken);
    await storage.save(tokens);
    const http = client();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => http.request('/v1/me', { schema: meResponseSchema })),
    );

    expect(results).toHaveLength(5);
    expect(api.refreshCalls).toBe(1);
    expect(api.revoked).toBe(false);
    expect((await storage.load())?.accessToken).not.toBe(tokens.accessToken);
  });

  it('renews ahead of time when the token is about to expire', async () => {
    await storage.save(api.issue(0.25));
    await client().request('/v1/me', { schema: meResponseSchema });
    expect(api.refreshCalls).toBe(1);
  });

  it('signs out once when the server refuses the refresh token', async () => {
    const tokens = api.issue();
    api.validAccess.delete(tokens.accessToken);
    api.liveRefresh.delete(tokens.refreshToken);
    await storage.save(tokens);
    const http = client();

    const outcomes = await Promise.allSettled([http.request('/v1/me'), http.request('/v1/me')]);

    expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(true);
    expect(sessionEnded).toBe(1);
    expect(await storage.load()).toBeNull();
  });

  it('reports why the session ended and sends nothing without a token', async () => {
    const tokens = api.issue(0.25);
    api.usedRefresh.add(tokens.refreshToken);
    await storage.save(tokens);
    let callsAfterRefresh = 0;
    const originalFetch = api.fetch;
    api.fetch = async (url, init) => {
      if (api.refreshCalls > 0 && !url.endsWith('/v1/auth/refresh')) callsAfterRefresh += 1;
      return originalFetch(url, init);
    };

    await expect(client().request('/v1/me')).rejects.toSatisfy(
      (error: unknown) => error instanceof ApiError && error.code === 'SESSION_REVOKED',
    );
    expect(callsAfterRefresh).toBe(0);
    expect(sessionEnded).toBe(1);
  });

  it('keeps the session when the phone has no signal', async () => {
    const tokens = api.issue(0.25);
    await storage.save(tokens);
    api.offline = true;

    await expect(client().request('/v1/me')).rejects.toBeInstanceOf(NetworkError);
    expect(sessionEnded).toBe(0);
    expect(await storage.load()).toEqual(tokens);
  });

  it('turns API errors into ApiError with the stable code', async () => {
    await expect(client().request('/v1/me', { authenticated: false })).rejects.toSatisfy(
      (error: unknown) => error instanceof ApiError && error.code === 'SESSION_EXPIRED',
    );
  });
});
