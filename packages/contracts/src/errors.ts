import { z } from 'zod';

/**
 * Stable error codes shared by the API and every client.
 * The app chooses what to show by code, never by parsing the message.
 * Codes are only ever added. Renaming or removing one is a breaking change.
 */
export const ErrorCode = {
  ValidationFailed: 'VALIDATION_FAILED',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  RateLimited: 'RATE_LIMITED',
  Internal: 'INTERNAL',

  EmailAlreadyRegistered: 'EMAIL_ALREADY_REGISTERED',
  UnderMinimumAge: 'UNDER_MINIMUM_AGE',
  WeakPassword: 'WEAK_PASSWORD',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  AccountSuspended: 'ACCOUNT_SUSPENDED',
  AccountBanned: 'ACCOUNT_BANNED',
  SessionExpired: 'SESSION_EXPIRED',
  SessionRevoked: 'SESSION_REVOKED',
  VerificationCodeInvalid: 'VERIFICATION_CODE_INVALID',
  VerificationCodeExpired: 'VERIFICATION_CODE_EXPIRED',
  VerificationAttemptsExceeded: 'VERIFICATION_ATTEMPTS_EXCEEDED',
  VerificationResendTooSoon: 'VERIFICATION_RESEND_TOO_SOON',
  EmailAlreadyVerified: 'EMAIL_ALREADY_VERIFIED',
  EmailNotVerified: 'EMAIL_NOT_VERIFIED',
  RoleAlreadyLocked: 'ROLE_ALREADY_LOCKED',

  PreconditionRequired: 'PRECONDITION_REQUIRED',
  PreconditionFailed: 'PRECONDITION_FAILED',
  WrongRole: 'WRONG_ROLE',
  HandleTaken: 'HANDLE_TAKEN',
  HandleInvalid: 'HANDLE_INVALID',
  UnknownTaxonomy: 'UNKNOWN_TAXONOMY',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const errorCodeValues = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];

/** The HTTP status for each code. Shared so the API and the OpenAPI document cannot drift apart. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.ValidationFailed]: 400,
  [ErrorCode.Unauthenticated]: 401,
  [ErrorCode.Forbidden]: 403,
  [ErrorCode.NotFound]: 404,
  [ErrorCode.Conflict]: 409,
  [ErrorCode.RateLimited]: 429,
  [ErrorCode.Internal]: 500,

  [ErrorCode.EmailAlreadyRegistered]: 409,
  [ErrorCode.UnderMinimumAge]: 422,
  [ErrorCode.WeakPassword]: 422,
  [ErrorCode.InvalidCredentials]: 401,
  [ErrorCode.AccountSuspended]: 403,
  [ErrorCode.AccountBanned]: 403,
  [ErrorCode.SessionExpired]: 401,
  [ErrorCode.SessionRevoked]: 401,
  [ErrorCode.VerificationCodeInvalid]: 422,
  [ErrorCode.VerificationCodeExpired]: 422,
  [ErrorCode.VerificationAttemptsExceeded]: 422,
  [ErrorCode.VerificationResendTooSoon]: 429,
  [ErrorCode.EmailAlreadyVerified]: 409,
  [ErrorCode.EmailNotVerified]: 403,
  [ErrorCode.RoleAlreadyLocked]: 409,

  [ErrorCode.PreconditionRequired]: 428,
  [ErrorCode.PreconditionFailed]: 412,
  [ErrorCode.WrongRole]: 403,
  [ErrorCode.HandleTaken]: 409,
  [ErrorCode.HandleInvalid]: 422,
  [ErrorCode.UnknownTaxonomy]: 422,
};

export const fieldProblemSchema = z
  .object({
    path: z.string(),
    message: z.string(),
  })
  .meta({ id: 'FieldProblem' });

/** RFC 9457 problem details, with our stable code and a trace id for support. */
export const problemDetailsSchema = z
  .object({
    type: z.url(),
    title: z.string(),
    status: z.number().int(),
    code: z.enum(errorCodeValues),
    detail: z.string().optional(),
    traceId: z.string().optional(),
    fields: z.array(fieldProblemSchema).optional(),
    retryAfterSeconds: z.number().int().optional(),
  })
  .meta({ id: 'Problem' });

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
