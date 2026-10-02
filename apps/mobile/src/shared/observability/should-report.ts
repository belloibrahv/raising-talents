import { ApiError, NetworkError } from '../api/api-error';

export interface Report {
  readonly error: unknown;
  readonly tags: Record<string, string>;
}

/**
 * Decides whether an error is worth an engineer's attention. Wrong codes, expired
 * sessions and lost signal are normal events, not bugs. Server failures and
 * anything unexpected are reported, with the API's trace id when there is one.
 */
export function toReport(error: unknown): Report | null {
  if (error instanceof NetworkError) return null;
  if (error instanceof ApiError) {
    if (error.problem.status < 500) return null;
    return {
      error,
      tags: {
        api_code: error.code,
        api_status: String(error.problem.status),
        ...(error.problem.traceId ? { api_trace_id: error.problem.traceId } : {}),
      },
    };
  }
  return { error, tags: {} };
}
