import { and, asc, eq, isNull, lt, lte, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { Database } from '../database/client.js';
import type { EventDispatcher } from './event-dispatcher.js';
import { outbox } from './outbox.schema.js';

export interface OutboxRelayOptions {
  readonly batchSize: number;
  readonly pollIntervalMs: number;
  readonly maxAttempts: number;
}

export const DEFAULT_RELAY_OPTIONS: OutboxRelayOptions = {
  batchSize: 50,
  pollIntervalMs: 500,
  maxAttempts: 10,
};

const MAX_BACKOFF_SECONDS = 15 * 60;

/**
 * Seconds to wait before the next try: 2, 4, 8 ... capped at 15 minutes, plus up to
 * 20% random jitter so failed events do not all retry at the same moment.
 * Ten attempts span roughly 30 minutes, long enough to ride out a provider outage.
 */
export function retryDelaySeconds(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** attempts, MAX_BACKOFF_SECONDS);
  return Math.round(base * (1 + random() * 0.2));
}

/**
 * Publishes outbox events in the worker. Rows are locked with SKIP LOCKED,
 * so several worker tasks can run side by side without double delivery.
 * An event that keeps failing stops at maxAttempts and raises an alert.
 */
export class OutboxRelay {
  private running = false;
  private stopped: Promise<void> | undefined;

  constructor(
    private readonly db: Database,
    private readonly dispatcher: EventDispatcher,
    private readonly logger: Logger,
    private readonly options: OutboxRelayOptions = DEFAULT_RELAY_OPTIONS,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopped = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.stopped;
  }

  async publishBatch(): Promise<number> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outbox)
        .where(
          and(
            isNull(outbox.publishedAt),
            lt(outbox.attempts, this.options.maxAttempts),
            lte(outbox.nextAttemptAt, sql`now()`),
          ),
        )
        .orderBy(asc(outbox.nextAttemptAt))
        .limit(this.options.batchSize)
        .for('update', { skipLocked: true });

      for (const row of rows) {
        try {
          await this.dispatcher.dispatch({
            type: row.eventType,
            aggregateId: row.aggregateId,
            occurredAt: row.occurredAt,
            payload: row.payload,
          });
          await tx
            .update(outbox)
            .set({ publishedAt: sql`now()` })
            .where(eq(outbox.id, row.id));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const attempts = row.attempts + 1;
          const delaySeconds = retryDelaySeconds(attempts);
          await tx
            .update(outbox)
            .set({
              attempts,
              lastError: message,
              nextAttemptAt: sql`now() + make_interval(secs => ${delaySeconds})`,
            })
            .where(eq(outbox.id, row.id));
          const deadLettered = attempts >= this.options.maxAttempts;
          this.logger[deadLettered ? 'error' : 'warn'](
            {
              eventId: row.id,
              eventType: row.eventType,
              attempts,
              error: message,
              retryInSeconds: deadLettered ? null : delaySeconds,
              alert: deadLettered,
            },
            deadLettered
              ? 'Outbox event dead-lettered after maximum attempts'
              : 'Outbox event handler failed, will retry',
          );
        }
      }
      return rows.length;
    });
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const published = await this.publishBatch();
        if (published === 0) await sleep(this.options.pollIntervalMs);
      } catch (error) {
        this.logger.error({ err: error }, 'Outbox relay batch failed');
        await sleep(this.options.pollIntervalMs * 4);
      }
    }
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
