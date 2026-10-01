import { authResponseSchema, type SessionTokens } from '@rt/contracts';
import type { z } from 'zod';
import type { SessionStorage } from '../storage/session-storage';
import { ApiError, NetworkError } from './api-error';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly storage: SessionStorage;
  readonly deviceId: () => Promise<string>;
  /** Called once when the session cannot be renewed, so the app can show the sign-in screen. */
  readonly onSessionEnded: () => void;
  readonly fetch?: Fetch;
  readonly now?: () => Date;
}

export interface RequestOptions<TSchema extends z.ZodType | undefined> {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  /** Send the access token. True for everything except the auth endpoints. */
  readonly authenticated?: boolean;
  /** Validates the response, so a server change shows up as a clear error instead of a crash later. */
  readonly schema?: TSchema;
}

/** Renew this many seconds before the access token expires, to absorb clock drift and slow networks. */
const EXPIRY_MARGIN_SECONDS = 30;

/**
 * The only way the app talks to the API.
 *
 * Refresh tokens are single-use on the server: presenting one twice signs the
 * person out everywhere. So every caller that needs a fresh token waits on the
 * same refresh promise, and there is never more than one refresh in flight.
 */
export class HttpClient {
  private readonly fetchImpl: Fetch;
  private readonly now: () => Date;
  private tokens: SessionTokens | null = null;
  private loaded = false;
  private refreshInFlight: Promise<boolean> | null = null;
  /** The server's answer when it last refused a refresh: expired, revoked or reused. */
  private sessionEndedBy: ApiError | null = null;

  constructor(private readonly options: HttpClientOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  async hasSession(): Promise<boolean> {
    return (await this.currentTokens()) !== null;
  }

  async startSession(tokens: SessionTokens): Promise<void> {
    this.tokens = tokens;
    this.sessionEndedBy = null;
    this.loaded = true;
    await this.options.storage.save(tokens);
  }

  async endSession(): Promise<void> {
    this.tokens = null;
    this.loaded = true;
    await this.options.storage.clear();
  }

  refreshToken(): string | null {
    return this.tokens?.refreshToken ?? null;
  }

  async request<TSchema extends z.ZodType | undefined = undefined>(
    path: string,
    options: RequestOptions<TSchema> = {},
  ): Promise<TSchema extends z.ZodType ? z.infer<TSchema> : undefined> {
    const authenticated = options.authenticated ?? true;

    if (authenticated && this.isNearExpiry(await this.currentTokens())) {
      await this.refreshOrThrow();
    }

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
    if (response.status === 204 || response.status === 202 || !options.schema) {
      return undefined as TSchema extends z.ZodType ? z.infer<TSchema> : undefined;
    }
    return options.schema.parse(await response.json()) as TSchema extends z.ZodType
      ? z.infer<TSchema>
      : undefined;
  }

  /** Every caller shares one refresh. Resolves true when a new token pair is stored. */
  refreshOnce(): Promise<boolean> {
    this.refreshInFlight ??= this.refresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  /** Refreshes, or fails with the reason the server gave, without sending a request that cannot succeed. */
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

  private async refresh(): Promise<boolean> {
    const current = await this.currentTokens();
    if (!current) return false;

    const response = await this.send(
      '/v1/auth/refresh',
      {
        method: 'POST',
        body: { refreshToken: current.refreshToken, deviceId: await this.options.deviceId() },
      },
      false,
    );

    if (response.ok) {
      const { tokens } = authResponseSchema.parse(await response.json());
      await this.startSession(tokens);
      return true;
    }

    // The server refused the token: it expired, was revoked or was reused. Only now do we sign out.
    // Network failures throw before reaching here, so losing signal never signs anyone out.
    if (response.status === 401 || response.status === 403) {
      this.sessionEndedBy = await ApiError.fromResponse(response);
      await this.endSession();
      this.options.onSessionEnded();
      return false;
    }
    throw await ApiError.fromResponse(response);
  }

  private async send(
    path: string,
    options: RequestOptions<z.ZodType | undefined>,
    authenticated: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (authenticated) {
      const tokens = await this.currentTokens();
      if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
    }
    try {
      return await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      throw new NetworkError(error);
    }
  }

  private async currentTokens(): Promise<SessionTokens | null> {
    if (!this.loaded) {
      this.tokens = await this.options.storage.load();
      this.loaded = true;
    }
    return this.tokens;
  }

  private isNearExpiry(tokens: SessionTokens | null): boolean {
    if (!tokens) return false;
    const expiresAt = new Date(tokens.accessTokenExpiresAt).getTime();
    return expiresAt - this.now().getTime() < EXPIRY_MARGIN_SECONDS * 1000;
  }
}
