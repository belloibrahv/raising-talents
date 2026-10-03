import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { and, asc, eq, isNull, lt, lte, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { Database } from '../database/client.js';
import type { ErrorReporter } from '../observability/error-reporter.js';
import { restoreTraceContext } from '../observability/trace-context.js';
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
const tracer = trace.getTracer('raising-talents.outbox');

/**
 * Seconds to wait before the next try: 2, 4, 8 ... capped at 15 minutes, plus up to
 * 20% random jitter so failed events do not all retry at the same moment.
 * Ten attempts span roughly 30 minutes, long enough to ride out a provider outage.
 */
export function retryDelaySeconds(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** attempts, MAX_BACKOFF_SECONDS);
  return Math.round(base * (1 + random() * 0.2));
}

type OutboxRow = typeof outbox.$inferSelect;

/**
 * Publishes outbox events in the worker. Rows are locked with SKIP LOCKED,
 * so several worker tasks can run side by side without double delivery.
 * An event that keeps failing stops at maxAttempts and raises an alert.
 *
 * Each event is handled in the trace of the request that created it. The
 * polling queries themselves are not traced: they run twice a second.
 */
export class OutboxRelay {
  private running = false;
  private stopped: Promise<void> | undefined;

  constructor(
    private readonly db: Database,
    private readonly dispatcher: EventDispatcher,
    private readonly logger: Logger,
    private readonly errors: ErrorReporter,
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

  publishBatch(): Promise<number> {
    return context.with(suppressTracing(context.active()), () =>
      this.db.transaction(async (tx) => {
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
          const failure = await this.dispatchInOriginalTrace(row);
          if (failure === null) {
            await tx
              .update(outbox)
              .set({ publishedAt: sql`now()` })
              .where(eq(outbox.id, row.id));
          } else {
            await this.recordFailure(tx, row, failure);
          }
        }
        return rows.length;
      }),
    );
  }

  /** Runs the handlers as a child of the originating request's trace. Returns the error, if any. */
  private dispatchInOriginalTrace(row: OutboxRow): Promise<unknown> {
    const parent = restoreTraceContext(row.headers);
    return tracer.startActiveSpan(
      `outbox process ${row.eventType}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'outbox',
          'messaging.operation.type': 'process',
          'messaging.destination.name': row.eventType,
          'messaging.message.id': row.id,
          'outbox.attempt': row.attempts + 1,
        },
      },
      parent,
      async (span) => {
        try {
          await this.dispatcher.dispatch({
            type: row.eventType,
            aggregateId: row.aggregateId,
            occurredAt: row.occurredAt,
            payload: row.payload,
          });
          return null;
        } catch (error) {
          span.recordException(error instanceof Error ? error : new Error(String(error)));
          span.setStatus({ code: SpanStatusCode.ERROR });
          return error;
        } finally {
          span.end();
        }
      },
    );
  }

  private async recordFailure(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    row: OutboxRow,
    error: unknown,
  ): Promise<void> {
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
    const fields = {
      eventId: row.id,
      eventType: row.eventType,
      attempts,
      error: message,
      retryInSeconds: deadLettered ? null : delaySeconds,
      alert: deadLettered,
    };
    if (deadLettered) {
      this.logger.error(fields, 'Outbox event dead-lettered after maximum attempts');
      this.errors.capture(error, { eventType: row.eventType, eventId: row.id, deadLettered: true });
    } else {
      this.logger.warn(fields, 'Outbox event handler failed, will retry');
    }
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
