import { ApiError, NetworkError } from '../api/api-error';

export interface Report {
  readonly error: unknown;
  readonly tags: Record<string, string>;
}

/** A lazily loaded code chunk that no longer exists, usually because a new version shipped. */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

/**
 * Decides whether an error is worth an engineer's attention. Wrong input, expired
 * sessions, lost signal and stale chunks after a release are normal, not bugs. Server
 * failures and anything unexpected are reported, with the API's trace id when there is one.
 */
export function toReport(error: unknown): Report | null {
  if (error instanceof NetworkError || isStaleChunkError(error)) return null;
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
