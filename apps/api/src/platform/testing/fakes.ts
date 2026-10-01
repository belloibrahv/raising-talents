import type { Clock } from '../clock.js';
import type { DomainEvent, EventRecorder } from '../domain-event.js';
import type { RateLimitDecision, RateLimiter } from '../rate-limit/rate-limiter.js';
import type { UnitOfWork } from '../unit-of-work.js';

/** A clock tests can move forward. Starts at a fixed, readable moment. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(start = new Date('2026-10-01T09:00:00.000Z')) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }

  advanceDays(days: number): void {
    this.advanceSeconds(days * 24 * 60 * 60);
  }
}

/** Runs work directly. Rollback is covered by the integration tests against Postgres. */
export class InMemoryUnitOfWork implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export class InMemoryEventRecorder implements EventRecorder {
  readonly events: DomainEvent[] = [];

  async record(events: readonly DomainEvent[]): Promise<void> {
    this.events.push(...events);
  }

  ofType(type: string): DomainEvent[] {
    return this.events.filter((event) => event.type === type);
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return count <= limit
      ? { allowed: true, retryAfterSeconds: 0 }
      : { allowed: false, retryAfterSeconds: windowSeconds };
  }
}
