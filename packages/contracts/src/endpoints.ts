import type { z } from 'zod';
import { meResponseSchema, selectRoleRequestSchema } from './accounts.js';
import {
  authResponseSchema,
  refreshRequestSchema,
  signInRequestSchema,
  signOutRequestSchema,
  signUpRequestSchema,
  verifyEmailRequestSchema,
} from './auth.js';
import { ErrorCode } from './errors.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface EndpointDefinition {
  readonly method: HttpMethod;
  /** Path parameters are written as {name}, the OpenAPI style. */
  readonly path: string;
  readonly summary: string;
  /** Needs a bearer access token. */
  readonly auth: boolean;
  readonly request?: z.ZodType;
  readonly response?: z.ZodType;
  readonly successStatus: 200 | 201 | 202 | 204;
  /** Business errors this endpoint can return, beyond the ones every endpoint can return. */
  readonly errors: readonly ErrorCode[];
  readonly tag: string;
}

const define = <const T extends EndpointDefinition>(endpoint: T): T => endpoint;

/**
 * Every route the API serves. The API's tests fail if a route exists that is
 * not listed here, or the other way round. The app calls endpoints by name,
 * and the OpenAPI document is generated from this list.
 */
export const endpoints = {
  'auth.signUp': define({
    method: 'POST',
    path: '/v1/auth/sign-up',
    summary: 'Create an account and start a session',
    auth: false,
    request: signUpRequestSchema,
    response: authResponseSchema,
    successStatus: 201,
    errors: [
      ErrorCode.EmailAlreadyRegistered,
      ErrorCode.UnderMinimumAge,
      ErrorCode.WeakPassword,
      ErrorCode.RateLimited,
    ],
    tag: 'Auth',
  }),
  'auth.signIn': define({
    method: 'POST',
    path: '/v1/auth/sign-in',
    summary: 'Sign in with email and password',
    auth: false,
    request: signInRequestSchema,
    response: authResponseSchema,
    successStatus: 200,
    errors: [
      ErrorCode.InvalidCredentials,
      ErrorCode.AccountSuspended,
      ErrorCode.AccountBanned,
      ErrorCode.RateLimited,
    ],
    tag: 'Auth',
  }),
  'auth.refresh': define({
    method: 'POST',
    path: '/v1/auth/refresh',
    summary: 'Swap a refresh token for a new token pair',
    auth: false,
    request: refreshRequestSchema,
    response: authResponseSchema,
    successStatus: 200,
    errors: [
      ErrorCode.SessionExpired,
      ErrorCode.SessionRevoked,
      ErrorCode.AccountSuspended,
      ErrorCode.AccountBanned,
    ],
    tag: 'Auth',
  }),
  'auth.signOut': define({
    method: 'POST',
    path: '/v1/auth/sign-out',
    summary: 'End the session on this device',
    auth: false,
    request: signOutRequestSchema,
    successStatus: 204,
    errors: [],
    tag: 'Auth',
  }),
  'auth.verifyEmail': define({
    method: 'POST',
    path: '/v1/auth/verify-email',
    summary: 'Confirm the email address with the emailed code',
    auth: true,
    request: verifyEmailRequestSchema,
    response: meResponseSchema,
    successStatus: 200,
    errors: [
      ErrorCode.VerificationCodeInvalid,
      ErrorCode.VerificationCodeExpired,
      ErrorCode.VerificationAttemptsExceeded,
      ErrorCode.EmailAlreadyVerified,
      ErrorCode.RateLimited,
    ],
    tag: 'Auth',
  }),
  'auth.resendVerification': define({
    method: 'POST',
    path: '/v1/auth/verify-email/resend',
    summary: 'Email a new verification code',
    auth: true,
    successStatus: 202,
    errors: [ErrorCode.VerificationResendTooSoon, ErrorCode.EmailAlreadyVerified],
    tag: 'Auth',
  }),
  'me.get': define({
    method: 'GET',
    path: '/v1/me',
    summary: 'The signed-in account',
    auth: true,
    response: meResponseSchema,
    successStatus: 200,
    errors: [],
    tag: 'Me',
  }),
  'me.selectRole': define({
    method: 'POST',
    path: '/v1/me/role',
    summary: 'Choose talent or agent',
    auth: true,
    request: selectRoleRequestSchema,
    response: meResponseSchema,
    successStatus: 200,
    errors: [ErrorCode.EmailNotVerified, ErrorCode.RoleAlreadyLocked],
    tag: 'Me',
  }),
} as const satisfies Record<string, EndpointDefinition>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

type SchemaInput<T> = T extends z.ZodType ? z.input<T> : undefined;
type SchemaOutput<T> = T extends z.ZodType ? z.output<T> : undefined;

/** What the caller sends. Input type, so the API's own normalising (trim, lowercase) stays on the server. */
export type EndpointRequest<N extends EndpointName> = SchemaInput<
  Endpoints[N] extends { request: infer R } ? R : undefined
>;

/** What the caller receives. */
export type EndpointResponse<N extends EndpointName> = SchemaOutput<
  Endpoints[N] extends { response: infer R } ? R : undefined
>;

/** Path parameter names in an endpoint path, for example {talentId}. */
export type PathParams<P extends string> = P extends `${string}{${infer Name}}${infer Rest}`
  ? { [K in Name | keyof PathParams<Rest>]: string }
  : // An endpoint without path parameters takes none. The empty object type is the point here.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {};

/** Fills {name} placeholders. Values are URL-encoded so an id can never change the path. */
export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${path}`);
    return encodeURIComponent(value);
  });
}

/** Errors every endpoint can return, listed once in the OpenAPI document. */
export const COMMON_ERRORS: readonly ErrorCode[] = [ErrorCode.ValidationFailed, ErrorCode.Internal];
export const AUTHENTICATED_ERRORS: readonly ErrorCode[] = [
  ErrorCode.Unauthenticated,
  ErrorCode.SessionExpired,
];
