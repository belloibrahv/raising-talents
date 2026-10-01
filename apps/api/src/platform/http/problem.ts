import { ErrorCode, type ProblemDetails } from '@rt/contracts';
import type { DomainError } from '../domain-error.js';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
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
};

const TITLE_BY_STATUS: Record<number, string> = {
  400: 'Invalid request',
  401: 'Not signed in',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict',
  422: 'Request cannot be completed',
  429: 'Too many requests',
  500: 'Something went wrong',
};

const typeFor = (code: ErrorCode) =>
  `https://api.raisingtalents.app/errors/${code.toLowerCase().replaceAll('_', '-')}`;

/** Thrown by the interface layer only. Domain and application code return Results. */
export class ProblemException extends Error {
  constructor(readonly problem: Omit<ProblemDetails, 'traceId'>) {
    super(problem.detail ?? problem.title);
  }

  static fromCode(
    code: ErrorCode,
    detail?: string,
    extra: Pick<ProblemDetails, 'fields' | 'retryAfterSeconds'> = {},
  ): ProblemException {
    const status = STATUS_BY_CODE[code];
    return new ProblemException({
      type: typeFor(code),
      title: TITLE_BY_STATUS[status] ?? 'Error',
      status,
      code,
      ...(detail === undefined ? {} : { detail }),
      ...extra,
    });
  }

  static fromDomain(error: DomainError): ProblemException {
    return ProblemException.fromCode(
      error.code,
      error.message,
      error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds },
    );
  }
}

/** Unwraps a Result in a controller: returns the value or throws the matching API error. */
export function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: DomainError }): T {
  if (result.ok) return result.value;
  throw ProblemException.fromDomain(result.error);
}
