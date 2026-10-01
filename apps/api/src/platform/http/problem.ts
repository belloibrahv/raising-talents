import { ERROR_STATUS, type ErrorCode, type ProblemDetails } from '@rt/contracts';
import type { DomainError } from '../domain-error.js';

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
    const status = ERROR_STATUS[code];
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
