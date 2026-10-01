import type { DomainEvent } from '../domain-event.js';

export type EventHandler = (event: DomainEvent) => Promise<void>;

/**
 * Maps event types to the handlers that react to them in the worker.
 * Handlers must be idempotent: an event can be delivered more than once.
 */
export class EventDispatcher {
  private readonly handlers = new Map<string, EventHandler[]>();

  on(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, handler]);
  }

  async dispatch(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers.get(event.type) ?? []) {
      await handler(event);
    }
  }
}
