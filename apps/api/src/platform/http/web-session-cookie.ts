/** The refresh cookie for browsers (ADR-024). Only the web auth endpoints ever see it. */
export const REFRESH_COOKIE = 'rt_refresh';
export const REFRESH_COOKIE_PATH = '/v1/auth/web';

export interface CookieOptions {
  readonly secure: boolean;
}

/**
 * HttpOnly: page scripts cannot read it. SameSite=Strict: other sites cannot make the
 * browser send it. Path: only the web auth endpoints receive it, not every API call.
 */
export function refreshCookie(
  token: string,
  expiresAt: Date,
  now: Date,
  options: CookieOptions,
): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return [
    `${REFRESH_COOKIE}=${token}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    `Max-Age=${String(maxAge)}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedRefreshCookie(options: CookieOptions): string {
  return refreshCookie('', new Date(0), new Date(0), options);
}

/** Reads one cookie from a Cookie header. Values we set are URL-safe, so no decoding is needed. */
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}
