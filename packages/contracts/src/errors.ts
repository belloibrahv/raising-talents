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
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const errorCodeValues = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];

export const fieldProblemSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/** RFC 9457 problem details, with our stable code and a trace id for support. */
export const problemDetailsSchema = z.object({
  type: z.url(),
  title: z.string(),
  status: z.number().int(),
  code: z.enum(errorCodeValues),
  detail: z.string().optional(),
  traceId: z.string().optional(),
  fields: z.array(fieldProblemSchema).optional(),
  retryAfterSeconds: z.number().int().optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
