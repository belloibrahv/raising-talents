import { webAuthResponseSchema, type MeResponse, type WebAuthResponse } from '@rt/contracts';
import type { z } from 'zod';
import { ApiError, NetworkError } from './api-error';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Runs work while no other tab holds the same lock. The Web Locks API in browsers that have it. */
export type CrossTabLock = <T>(name: string, work: () => Promise<T>) => Promise<T>;

export const webLocks: CrossTabLock = <T>(name: string, work: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && 'locks' in navigator
    ? (navigator.locks.request(name, work) as Promise<T>)
    : work();

export interface WebHttpClientOptions {
  readonly baseUrl: string;
  readonly deviceId: () => string;
  /** Called once when the session cannot be renewed, so the app can show the sign-in screen. */
  readonly onSessionEnded: () => void;
  readonly fetch?: Fetch;
  readonly now?: () => Date;
  readonly lock?: CrossTabLock;
}

export interface RequestOptions<TSchema extends z.ZodType | undefined> {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly authenticated?: boolean;
  readonly schema?: TSchema;
  readonly headers?: Record<string, string>;
}

type Parsed<TSchema> = TSchema extends z.ZodType ? z.infer<TSchema> : undefined;

/** Renew this many seconds before the access token expires, to absorb clock drift and slow networks. */
const EXPIRY_MARGIN_SECONDS = 30;
const WEB_AUTH_PREFIX = '/v1/auth/web/';
const REFRESH_LOCK = 'rt.refresh';

/**
 * The only way the web app talks to the API (ADR-024).
 *
 * The access token lives in memory; the refresh token is an HttpOnly cookie this code
 * never sees. Refresh tokens are single-use and every tab shares the cookie, so a refresh
 * holds a lock across tabs: two tabs refreshing at once would present the same token
 * twice, which the server treats as theft and signs the person out everywhere.
 */
export class WebHttpClient {
  private readonly fetchImpl: Fetch;
  private readonly now: () => Date;
  private readonly lock: CrossTabLock;
  private access: { token: string; expiresAt: number } | null = null;
  private refreshInFlight: Promise<MeResponse | null> | null = null;
  private sessionEndedBy: ApiError | null = null;

  constructor(private readonly options: WebHttpClientOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
    this.lock = options.lock ?? webLocks;
  }

  startSession(auth: WebAuthResponse): MeResponse {
    this.access = { token: auth.accessToken, expiresAt: Date.parse(auth.accessTokenExpiresAt) };
    this.sessionEndedBy = null;
    return auth.me;
  }

  /** Forgets the access token. The cookie is cleared by the sign-out endpoint, not here. */
  forgetSession(): void {
    this.access = null;
  }

  /**
   * Used at start-up and after a reload: swaps the cookie, if there is one, for an
   * access token. Null means signed out. Throws NetworkError when the API cannot be reached.
   */
  restore(): Promise<MeResponse | null> {
    return this.refreshOnce();
  }

  async request<TSchema extends z.ZodType | undefined = undefined>(
    path: string,
    options: RequestOptions<TSchema> = {},
  ): Promise<Parsed<TSchema>> {
    const authenticated = options.authenticated ?? true;
    // No token yet (just reloaded) or about to expire: the cookie is the way back in.
    if (authenticated && (!this.access || this.isNearExpiry())) await this.refreshOrThrow();

    let response = await this.send(path, options, authenticated);
    // The token can still expire between the check above and the server reading it.
    if (authenticated && response.status === 401) {
      const problem = await ApiError.fromResponse(response.clone());
      if (problem.code === 'SESSION_EXPIRED') {
        await this.refreshOrThrow();
        response = await this.send(path, options, authenticated);
      }
    }

    if (!response.ok) throw await ApiError.fromResponse(response);
    // 202 can carry a body (media.complete answers with the asset), so only 204 means none.
    if (response.status === 204 || !options.schema) {
      return undefined as Parsed<TSchema>;
    }
    return options.schema.parse(await response.json()) as Parsed<TSchema>;
  }

  /** Every caller in this tab shares one refresh; the lock makes other tabs wait their turn. */
  refreshOnce(): Promise<MeResponse | null> {
    this.refreshInFlight ??= this.lock(REFRESH_LOCK, () => this.refresh()).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async refreshOrThrow(): Promise<void> {
    if (await this.refreshOnce()) return;
    throw (
      this.sessionEndedBy ??
      new ApiError({
        type: 'about:blank',
        title: 'Not signed in',
        status: 401,
        code: 'UNAUTHENTICATED',
      })
    );
  }

  private async refresh(): Promise<MeResponse | null> {
    const response = await this.send(
      '/v1/auth/web/refresh',
      { method: 'POST', body: { deviceId: this.options.deviceId() } },
      false,
    );
    // 204: no cookie at all, so nobody is signed in on this browser.
    if (response.status === 204) {
      this.access = null;
      return null;
    }
    if (response.ok) return this.startSession(webAuthResponseSchema.parse(await response.json()));

    // The server refused the cookie: missing, expired, revoked or reused. Only now do we sign out.
    // Network failures throw before reaching here, so losing signal never signs anyone out.
    if (response.status === 401 || response.status === 403) {
      const hadSession = this.access !== null;
      this.sessionEndedBy = await ApiError.fromResponse(response);
      this.access = null;
      if (hadSession) this.options.onSessionEnded();
      return null;
    }
    throw await ApiError.fromResponse(response);
  }

  private async send(
    path: string,
    options: RequestOptions<z.ZodType | undefined>,
    authenticated: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (authenticated && this.access) headers['authorization'] = `Bearer ${this.access.token}`;
    try {
      return await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        // Only the web auth endpoints need the cookie; nothing else should carry credentials.
        credentials: path.startsWith(WEB_AUTH_PREFIX) ? 'include' : 'omit',
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      throw new NetworkError(error);
    }
  }

  private isNearExpiry(): boolean {
    if (!this.access) return false;
    return this.access.expiresAt - this.now().getTime() < EXPIRY_MARGIN_SECONDS * 1000;
  }
}
