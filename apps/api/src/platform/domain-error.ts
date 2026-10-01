import type { ErrorCode } from '@rt/contracts';

/** A business rule was broken. The interface layer turns this into an API error. */
export interface DomainError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly retryAfterSeconds?: number;
}

export const domainError = (
  code: ErrorCode,
  message: string,
  retryAfterSeconds?: number,
): DomainError =>
  retryAfterSeconds === undefined ? { code, message } : { code, message, retryAfterSeconds };
