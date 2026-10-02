/** Sends unexpected errors to an error tracker. Business errors never come here. */
export interface ErrorReporter {
  capture(error: unknown, context?: Record<string, string | number | boolean>): void;
}

export class NoopErrorReporter implements ErrorReporter {
  capture(): void {
    // Error tracking is off in this environment. The error is still logged by the caller.
  }
}
