import { ErrorCode } from '@rt/contracts';
import { domainError } from '../../../platform/domain-error.js';

export const IdentityErrors = {
  invalidCredentials: () =>
    domainError(ErrorCode.InvalidCredentials, 'That email and password do not match.'),
  weakPassword: (reason: string) => domainError(ErrorCode.WeakPassword, reason),
  sessionExpired: () =>
    domainError(ErrorCode.SessionExpired, 'Your session has expired. Sign in again.'),
  sessionRevoked: () =>
    domainError(ErrorCode.SessionRevoked, 'You were signed out for your security. Sign in again.'),
  codeInvalid: (attemptsLeft: number) =>
    domainError(
      ErrorCode.VerificationCodeInvalid,
      `That code is not right. ${attemptsLeft} attempt(s) left.`,
    ),
  codeExpired: () =>
    domainError(ErrorCode.VerificationCodeExpired, 'That code has expired. Ask for a new one.'),
  attemptsExceeded: () =>
    domainError(ErrorCode.VerificationAttemptsExceeded, 'Too many wrong codes. Ask for a new one.'),
  resendTooSoon: (retryAfterSeconds: number) =>
    domainError(
      ErrorCode.VerificationResendTooSoon,
      `Wait ${retryAfterSeconds} seconds before asking for a new code.`,
      retryAfterSeconds,
    ),
  emailAlreadyVerified: () =>
    domainError(ErrorCode.EmailAlreadyVerified, 'Your email is already verified.'),
  breachedPassword: () =>
    domainError(
      ErrorCode.WeakPassword,
      'This password has appeared in a data breach elsewhere. Choose a different one.',
    ),
  rateLimited: (retryAfterSeconds: number) =>
    domainError(ErrorCode.RateLimited, 'Too many attempts. Try again shortly.', retryAfterSeconds),
};
