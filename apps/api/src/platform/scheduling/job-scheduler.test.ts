import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { JobScheduler, type JobLock, type ScheduledJob } from './job-scheduler.js';

class InMemoryJobLock implements JobLock {
  readonly held = new Set<string>();
  async runExclusively(name: string, work: () => Promise<void>): Promise<boolean> {
    if (this.held.has(name)) return false;
    this.held.add(name);
    try {
      await work();
      return true;
    } finally {
      this.held.delete(name);
    }
  }
}

class CapturingErrors {
  readonly captured: { error: unknown; context: unknown }[] = [];
  capture(error: unknown, context?: Record<string, string | number | boolean>): void {
    this.captured.push({ error, context });
  }
}

const job = (run: () => Promise<void>): ScheduledJob => ({
  name: 'media.abandoned-uploads',
  everySeconds: 900,
  run,
});

describe('JobScheduler', () => {
  const logger = pino({ level: 'silent' });

  it('never overlaps a run with itself', async () => {
    let runs = 0;
    let release = () => {};
    const slow = job(
      () =>
        new Promise<void>((resolve) => {
          runs += 1;
          release = resolve;
        }),
    );
    const scheduler = new JobScheduler(
      [slow],
      new InMemoryJobLock(),
      logger,
      new CapturingErrors(),
    );
    const first = scheduler.runOnce(slow);
    await scheduler.runOnce(slow);
    expect(runs).toBe(1);
    release();
    await first;
    const stopped = scheduler.stop();
    await expect(stopped).resolves.toBeUndefined();
  });

  it('skips the run while another worker holds the lock', async () => {
    let runs = 0;
    const counted = job(async () => {
      runs += 1;
    });
    const lock = new InMemoryJobLock();
    lock.held.add(counted.name);
    await new JobScheduler([counted], lock, logger, new CapturingErrors()).runOnce(counted);
    expect(runs).toBe(0);
  });

  it('reports a failed run and keeps going', async () => {
    const errors = new CapturingErrors();
    const failing = job(() => Promise.reject(new Error('S3 timed out')));
    const scheduler = new JobScheduler([failing], new InMemoryJobLock(), logger, errors);
    await scheduler.runOnce(failing);
    await scheduler.runOnce(failing);
    expect(errors.captured).toHaveLength(2);
    expect(errors.captured[0]?.context).toEqual({ process: 'worker', job: failing.name });
  });
});
