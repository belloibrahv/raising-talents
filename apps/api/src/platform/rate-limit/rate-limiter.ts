export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Counts one attempt for the key and says whether it is within the limit. */
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}
