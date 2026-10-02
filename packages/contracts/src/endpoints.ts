import type { z } from 'zod';
import { meResponseSchema, selectRoleRequestSchema } from './accounts.js';
import {
  authResponseSchema,
  refreshRequestSchema,
  signInRequestSchema,
  signOutRequestSchema,
  signUpRequestSchema,
  verifyEmailRequestSchema,
  webAuthResponseSchema,
  webRefreshRequestSchema,
} from './auth.js';
import { ErrorCode } from './errors.js';
import {
  myAgentProfileSchema,
  myTalentProfileSchema,
  publicTalentProfileSchema,
  updateAgentProfileRequestSchema,
  updateTalentProfileRequestSchema,
} from './profiles.js';
import {
  createUploadIntentRequestSchema,
  mediaAssetSchema,
  uploadIntentResponseSchema,
} from './media.js';
import {
  addPortfolioItemRequestSchema,
  myPortfolioSchema,
  publicPortfolioSchema,
  reorderPortfolioRequestSchema,
  updatePortfolioItemRequestSchema,
} from './portfolio.js';
import { taxonomyResponseSchema } from './taxonomy.js';

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
  /**
   * Optimistic concurrency: the response carries an ETag, and updates must send it
   * back in If-Match. A stale version is refused with 412.
   */
  readonly concurrency?: 'etag' | 'if-match';
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
  'authWeb.signUp': define({
    method: 'POST',
    path: '/v1/auth/web/sign-up',
    summary: 'Create an account from the web app; the refresh token is set as an HttpOnly cookie',
    auth: false,
    request: signUpRequestSchema,
    response: webAuthResponseSchema,
    successStatus: 201,
    errors: [
      ErrorCode.EmailAlreadyRegistered,
      ErrorCode.UnderMinimumAge,
      ErrorCode.WeakPassword,
      ErrorCode.RateLimited,
      ErrorCode.Forbidden,
    ],
    tag: 'Auth (web)',
  }),
  'authWeb.signIn': define({
    method: 'POST',
    path: '/v1/auth/web/sign-in',
    summary: 'Sign in from the web app; the refresh token is set as an HttpOnly cookie',
    auth: false,
    request: signInRequestSchema,
    response: webAuthResponseSchema,
    successStatus: 200,
    errors: [
      ErrorCode.InvalidCredentials,
      ErrorCode.AccountSuspended,
      ErrorCode.AccountBanned,
      ErrorCode.RateLimited,
      ErrorCode.Forbidden,
    ],
    tag: 'Auth (web)',
  }),
  'authWeb.refresh': define({
    method: 'POST',
    path: '/v1/auth/web/refresh',
    summary: 'Swap the refresh cookie for a new access token and a rotated cookie',
    auth: false,
    request: webRefreshRequestSchema,
    response: webAuthResponseSchema,
    successStatus: 200,
    errors: [
      ErrorCode.Unauthenticated,
      ErrorCode.SessionExpired,
      ErrorCode.SessionRevoked,
      ErrorCode.AccountSuspended,
      ErrorCode.AccountBanned,
      ErrorCode.Forbidden,
    ],
    tag: 'Auth (web)',
  }),
  'authWeb.signOut': define({
    method: 'POST',
    path: '/v1/auth/web/sign-out',
    summary: 'End the web session and clear the refresh cookie',
    auth: false,
    successStatus: 204,
    errors: [ErrorCode.Forbidden],
    tag: 'Auth (web)',
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
  'taxonomy.get': define({
    method: 'GET',
    path: '/v1/taxonomy',
    summary: 'Categories, subcategories, skills and cities',
    auth: true,
    response: taxonomyResponseSchema,
    successStatus: 200,
    errors: [],
    tag: 'Taxonomy',
  }),
  'talentProfile.getMine': define({
    method: 'GET',
    path: '/v1/me/talent-profile',
    summary: "The signed-in talent's profile, with what is still missing",
    auth: true,
    response: myTalentProfileSchema,
    successStatus: 200,
    errors: [ErrorCode.WrongRole, ErrorCode.NotFound],
    tag: 'Talent profiles',
    concurrency: 'etag',
  }),
  'talentProfile.updateMine': define({
    method: 'PATCH',
    path: '/v1/me/talent-profile',
    summary: 'Create or update the talent profile, one onboarding step at a time',
    auth: true,
    request: updateTalentProfileRequestSchema,
    response: myTalentProfileSchema,
    successStatus: 200,
    errors: [
      ErrorCode.WrongRole,
      ErrorCode.EmailNotVerified,
      ErrorCode.PreconditionRequired,
      ErrorCode.PreconditionFailed,
      ErrorCode.HandleTaken,
      ErrorCode.HandleInvalid,
      ErrorCode.UnknownTaxonomy,
    ],
    tag: 'Talent profiles',
    concurrency: 'if-match',
  }),
  'talents.getByHandle': define({
    method: 'GET',
    path: '/v1/talents/{handle}',
    summary: 'A complete talent profile, as agents see it',
    auth: true,
    response: publicTalentProfileSchema,
    successStatus: 200,
    errors: [ErrorCode.NotFound],
    tag: 'Talent profiles',
  }),
  'agentProfile.getMine': define({
    method: 'GET',
    path: '/v1/me/agent-profile',
    summary: "The signed-in agent's profile, with what is still missing",
    auth: true,
    response: myAgentProfileSchema,
    successStatus: 200,
    errors: [ErrorCode.WrongRole, ErrorCode.NotFound],
    tag: 'Agent profiles',
    concurrency: 'etag',
  }),
  'agentProfile.updateMine': define({
    method: 'PATCH',
    path: '/v1/me/agent-profile',
    summary: 'Create or update the agent profile',
    auth: true,
    request: updateAgentProfileRequestSchema,
    response: myAgentProfileSchema,
    successStatus: 200,
    errors: [
      ErrorCode.WrongRole,
      ErrorCode.EmailNotVerified,
      ErrorCode.PreconditionRequired,
      ErrorCode.PreconditionFailed,
      ErrorCode.UnknownTaxonomy,
    ],
    tag: 'Agent profiles',
    concurrency: 'if-match',
  }),
  'media.createUploadIntent': define({
    method: 'POST',
    path: '/v1/media/upload-intents',
    summary: 'Get permission to upload one image or video straight to storage',
    auth: true,
    request: createUploadIntentRequestSchema,
    response: uploadIntentResponseSchema,
    successStatus: 201,
    errors: [
      ErrorCode.WrongRole,
      ErrorCode.EmailNotVerified,
      ErrorCode.MediaTypeNotAllowed,
      ErrorCode.MediaTooLarge,
      ErrorCode.RateLimited,
    ],
    tag: 'Media',
  }),
  'media.complete': define({
    method: 'POST',
    path: '/v1/media/{mediaId}/complete',
    summary: 'Confirm the upload finished; processing and scanning start',
    auth: true,
    response: mediaAssetSchema,
    successStatus: 202,
    errors: [
      ErrorCode.NotFound,
      ErrorCode.MediaNotUploaded,
      ErrorCode.MediaUploadMismatch,
      ErrorCode.MediaWrongState,
    ],
    tag: 'Media',
  }),
  'media.get': define({
    method: 'GET',
    path: '/v1/media/{mediaId}',
    summary: 'An asset: every state for its owner, ready assets only for everyone else',
    auth: true,
    response: mediaAssetSchema,
    successStatus: 200,
    errors: [ErrorCode.NotFound],
    tag: 'Media',
  }),
  'portfolio.getMine': define({
    method: 'GET',
    path: '/v1/me/portfolio',
    summary: "The signed-in talent's portfolio, every item with its media status",
    auth: true,
    response: myPortfolioSchema,
    successStatus: 200,
    errors: [ErrorCode.WrongRole],
    tag: 'Portfolio',
    concurrency: 'etag',
  }),
  'portfolio.addItem': define({
    method: 'POST',
    path: '/v1/me/portfolio/items',
    summary: 'Add an uploaded image to the end of the portfolio',
    auth: true,
    request: addPortfolioItemRequestSchema,
    response: myPortfolioSchema,
    successStatus: 201,
    errors: [
      ErrorCode.WrongRole,
      ErrorCode.EmailNotVerified,
      ErrorCode.NotFound,
      ErrorCode.MediaNotUploaded,
      ErrorCode.MediaWrongState,
      ErrorCode.MediaWrongPurpose,
      ErrorCode.MediaAlreadyUsed,
      ErrorCode.PortfolioFull,
      ErrorCode.Conflict,
    ],
    tag: 'Portfolio',
    concurrency: 'etag',
  }),
  'portfolio.updateItem': define({
    method: 'PATCH',
    path: '/v1/me/portfolio/items/{itemId}',
    summary: "Change an item's caption",
    auth: true,
    request: updatePortfolioItemRequestSchema,
    response: myPortfolioSchema,
    successStatus: 200,
    errors: [ErrorCode.WrongRole, ErrorCode.NotFound, ErrorCode.Conflict],
    tag: 'Portfolio',
    concurrency: 'etag',
  }),
  'portfolio.removeItem': define({
    method: 'DELETE',
    path: '/v1/me/portfolio/items/{itemId}',
    summary: 'Remove an item; its media is deleted from storage',
    auth: true,
    response: myPortfolioSchema,
    successStatus: 200,
    errors: [ErrorCode.WrongRole, ErrorCode.NotFound, ErrorCode.Conflict],
    tag: 'Portfolio',
    concurrency: 'etag',
  }),
  'portfolio.reorder': define({
    method: 'PUT',
    path: '/v1/me/portfolio/order',
    summary: 'Put every item in a new order',
    auth: true,
    request: reorderPortfolioRequestSchema,
    response: myPortfolioSchema,
    successStatus: 200,
    errors: [
      ErrorCode.WrongRole,
      ErrorCode.PreconditionRequired,
      ErrorCode.PreconditionFailed,
      ErrorCode.PortfolioOrderMismatch,
    ],
    tag: 'Portfolio',
    concurrency: 'if-match',
  }),
  'talents.getPortfolio': define({
    method: 'GET',
    path: '/v1/talents/{handle}/portfolio',
    summary: "A talent's portfolio, as agents see it",
    auth: true,
    response: publicPortfolioSchema,
    successStatus: 200,
    errors: [ErrorCode.NotFound],
    tag: 'Portfolio',
  }),
  'webhooks.mux': define({
    method: 'POST',
    path: '/v1/webhooks/mux',
    summary: 'Video processing events from Mux, signed with the shared webhook secret',
    auth: false,
    successStatus: 204,
    errors: [ErrorCode.Unauthenticated],
    tag: 'Webhooks',
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
