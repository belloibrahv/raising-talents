import { meResponseSchema } from '@rt/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from './api-error';
import { WebHttpClient, type CrossTabLock } from './web-http-client';

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
  createdAt: NOW.toISOString(),
};

const problem = (status: number, code: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'Error', status, code }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });

/**
 * A stand-in for the API and the browser's cookie jar. It enforces the server's rule:
 * a refresh cookie works once, and presenting a used one revokes the session.
 */
class FakeBrowserAndApi {
  cookie: string | null = null;
  validAccess = new Set<string>();
  usedCookies = new Set<string>();
  refreshCalls = 0;
  revoked = false;
  offline = false;
  accessMinutes = 15;
  readonly requests: {
    path: string;
    credentials: RequestCredentials | undefined;
    auth: string | undefined;
  }[] = [];
  private counter = 0;

  signIn(): void {
    this.cookie = this.newCookie();
  }

  private newCookie(): string {
    this.counter += 1;
    return `cookie-${String(this.counter)}`;
  }

  private issueAccess(): { accessToken: string; accessTokenExpiresAt: string } {
    this.counter += 1;
    const accessToken = `access-${String(this.counter)}`;
    this.validAccess.add(accessToken);
    return { accessToken, accessTokenExpiresAt: inMinutes(this.accessMinutes) };
  }

  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    // Read the cookie when the request leaves, as a browser does, then let other work run.
    const sentCookie = init?.credentials === 'include' ? this.cookie : null;
    await Promise.resolve();
    await Promise.resolve();
    if (this.offline) throw new TypeError('Failed to fetch');
    const path = url.replace('https://api.test', '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    this.requests.push({ path, credentials: init?.credentials, auth: headers['authorization'] });

    if (path === '/v1/auth/web/refresh') {
      this.refreshCalls += 1;
      if (!sentCookie) return problem(401, 'UNAUTHENTICATED');
      if (this.revoked) return problem(401, 'SESSION_REVOKED');
      if (this.usedCookies.has(sentCookie)) {
        this.revoked = true;
        return problem(401, 'SESSION_REVOKED');
      }
      this.usedCookies.add(sentCookie);
      this.cookie = this.newCookie();
      return Response.json({ ...this.issueAccess(), me });
    }
    if (path === '/v1/me') {
      const token = headers['authorization']?.replace('Bearer ', '') ?? '';
      if (!this.validAccess.has(token)) return problem(401, 'SESSION_EXPIRED');
      return Response.json(me);
    }
    return problem(404, 'NOT_FOUND');
  };
}

/** The Web Locks API, as one browser shares it between tabs. */
function sharedLock(): CrossTabLock {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(_name: string, work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  };
}

const noLock: CrossTabLock = (_name, work) => work();

function tab(fake: FakeBrowserAndApi, lock: CrossTabLock = sharedLock()) {
  let ended = 0;
  const client = new WebHttpClient({
    baseUrl: 'https://api.test',
    deviceId: () => DEVICE,
    onSessionEnded: () => {
      ended += 1;
    },
    fetch: fake.fetch,
    now: () => NOW,
    lock,
  });
  return { client, ended: () => ended };
}

describe('WebHttpClient', () => {
  it('restores nothing, quietly, when there is no cookie', async () => {
    const fake = new FakeBrowserAndApi();
    const { client, ended } = tab(fake);
    await expect(client.restore()).resolves.toBeNull();
    expect(ended()).toBe(0);
  });

  it('restores from the cookie, then calls with the bearer token and no credentials', async () => {
    const fake = new FakeBrowserAndApi();
    fake.signIn();
    const { client } = tab(fake);
    expect((await client.restore())?.email).toBe(me.email);
    await client.request('/v1/me', { schema: meResponseSchema });
    const call = fake.requests.find((request) => request.path === '/v1/me');
    expect(call?.auth).toMatch(/^Bearer access-/);
    expect(call?.credentials).toBe('omit');
    const refresh = fake.requests.find((request) => request.path === '/v1/auth/web/refresh');
    expect(refresh?.credentials).toBe('include');
  });

  it('refreshes once for many calls that find the token about to expire', async () => {
    const fake = new FakeBrowserAndApi();
    fake.signIn();
    fake.accessMinutes = 0;
    const { client } = tab(fake);
    await client.restore();
    fake.accessMinutes = 15;
    await Promise.all(
      Array.from({ length: 5 }, () => client.request('/v1/me', { schema: meResponseSchema })),
    );
    expect(fake.refreshCalls).toBe(2);
    expect(fake.revoked).toBe(false);
  });

  it('keeps two tabs from presenting the same cookie when they refresh together', async () => {
    const fake = new FakeBrowserAndApi();
    fake.signIn();
    const lock = sharedLock();
    const first = tab(fake, lock);
    const second = tab(fake, lock);
    await Promise.all([first.client.restore(), second.client.restore()]);
    expect(fake.revoked).toBe(false);
    expect(first.ended() + second.ended()).toBe(0);
  });

  it('would sign the person out everywhere without the lock, which is why it exists', async () => {
    const fake = new FakeBrowserAndApi();
    fake.signIn();
    await Promise.all([tab(fake, noLock).client.restore(), tab(fake, noLock).client.restore()]);
    expect(fake.revoked).toBe(true);
  });

  it('never signs anyone out because the connection dropped', async () => {
    const fake = new FakeBrowserAndApi();
    fake.signIn();
    const { client, ended } = tab(fake);
    await client.restore();
    fake.offline = true;
    fake.validAccess.clear();
    await expect(client.request('/v1/me', { schema: meResponseSchema })).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(ended()).toBe(0);
  });

  it('ends the session once, with the server reason, when the cookie is refused', async () => {
    const fake = new FakeBrowserAndApi();
    fake.signIn();
    const { client, ended } = tab(fake);
    await client.restore();
    fake.revoked = true;
    fake.validAccess.clear();
    const failure = await client
      .request('/v1/me', { schema: meResponseSchema })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('SESSION_REVOKED');
    expect(ended()).toBe(1);
  });
});

describe('WebHttpClient responses', () => {
  it('reads the body of a 202, which media.complete uses for the asset', async () => {
    const fake = new FakeBrowserAndApi();
    fake.signIn();
    const { client } = tab(fake);
    await client.restore();
    const fetchFn = fake.fetch;
    fake.fetch = async (url, init) =>
      url.endsWith('/v1/accepted') ? Response.json(me, { status: 202 }) : fetchFn(url, init);
    const accepted = tab(fake);
    await accepted.client.restore();
    expect(
      await accepted.client.request('/v1/accepted', { method: 'POST', schema: meResponseSchema }),
    ).toEqual(me);
  });
});
