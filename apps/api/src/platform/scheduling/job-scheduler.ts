import type { Logger } from 'pino';
import type { ErrorReporter } from '../observability/error-reporter.js';

/** Recurring work for the worker process. Each run must be safe to repeat. */
export interface ScheduledJob {
  readonly name: string;
  readonly everySeconds: number;
  run(): Promise<void>;
}

/** Runs work only if no other process holds the lock for that name; returns whether it ran. */
export interface JobLock {
  runExclusively(name: string, work: () => Promise<void>): Promise<boolean>;
}

/**
 * Starts every job on its own interval. Several worker tasks can run this side by
 * side: the lock lets one of them do each run, and a run never overlaps itself.
 */
export class JobScheduler {
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly jobs: readonly ScheduledJob[],
    private readonly lock: JobLock,
    private readonly logger: Logger,
    private readonly errors: ErrorReporter,
  ) {}

  start(): void {
    for (const job of this.jobs) {
      this.timers.push(setInterval(() => void this.runOnce(job), job.everySeconds * 1000));
      this.logger.info({ job: job.name, everySeconds: job.everySeconds }, 'job scheduled');
    }
  }

  /** Public so tests and an operator can trigger a run without waiting. */
  async runOnce(job: ScheduledJob): Promise<void> {
    if (this.running.has(job.name)) return;
    const run = this.lock
      .runExclusively(job.name, () => job.run())
      .then((ran) => {
        if (!ran) this.logger.debug({ job: job.name }, 'job skipped, another worker holds it');
      })
      .catch((error: unknown) => {
        this.logger.error({ err: error, job: job.name }, 'job failed');
        this.errors.capture(error, { process: 'worker', job: job.name });
      })
      .finally(() => this.running.delete(job.name));
    this.running.set(job.name, run);
    await run;
  }

  /** Stops new runs and waits for the ones in progress, so a deploy does not cut one short. */
  async stop(): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
    await Promise.all(this.running.values());
  }
}
