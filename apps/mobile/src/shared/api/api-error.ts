import { problemDetailsSchema, type ErrorCode, type ProblemDetails } from '@rt/contracts';

/** An error the API answered with. Screens decide what to show from `code`, never from the message. */
export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get code(): ErrorCode {
    return this.problem.code;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const body: unknown = await response.json().catch(() => null);
    const parsed = problemDetailsSchema.safeParse(body);
    if (parsed.success) return new ApiError(parsed.data);
    return new ApiError({
      type: 'about:blank',
      title: 'Unexpected response',
      status: response.status,
      code: 'INTERNAL',
    });
  }
}

/** The request never got an answer: no signal, airplane mode or the server is unreachable. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed', { cause });
    this.name = 'NetworkError';
  }
}

export const isApiError = (error: unknown, code?: ErrorCode): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);
