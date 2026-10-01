import { describe, expect, it } from 'vitest';
import { retryDelaySeconds } from './outbox-relay.js';

describe('retryDelaySeconds', () => {
  it('doubles the wait after each failure', () => {
    const noJitter = () => 0;
    expect([1, 2, 3, 4, 5].map((attempt) => retryDelaySeconds(attempt, noJitter))).toEqual([
      2, 4, 8, 16, 32,
    ]);
  });

  it('never waits longer than 15 minutes plus jitter', () => {
    expect(retryDelaySeconds(20, () => 0)).toBe(900);
    expect(retryDelaySeconds(20, () => 1)).toBe(1080);
  });

  it('spreads ten attempts over roughly half an hour so a short outage is survived', () => {
    const total = Array.from({ length: 9 }, (_, index) =>
      retryDelaySeconds(index + 1, () => 0),
    ).reduce((sum, delay) => sum + delay, 0);
    expect(total).toBeGreaterThan(15 * 60);
    expect(total).toBeLessThan(45 * 60);
  });
});
