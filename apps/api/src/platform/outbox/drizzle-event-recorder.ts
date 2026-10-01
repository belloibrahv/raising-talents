import type { DomainEvent, EventRecorder } from '../domain-event.js';
import type { DrizzleUnitOfWork } from '../database/drizzle-unit-of-work.js';
import { newId } from '../ids.js';
import { outbox } from './outbox.schema.js';

/** Writes events to the outbox inside the caller's transaction. */
export class DrizzleEventRecorder implements EventRecorder {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async record(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.uow
      .executor()
      .insert(outbox)
      .values(
        events.map((event) => ({
          id: newId(),
          eventType: event.type,
          aggregateId: event.aggregateId,
          payload: event.payload,
          occurredAt: event.occurredAt,
        })),
      );
  }
}
