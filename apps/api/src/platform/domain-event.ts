/**
 * Something that happened in the domain. Events are saved to the outbox in the
 * same transaction as the change that caused them, then published by the worker.
 * Payloads never contain secrets: no passwords, tokens or verification codes.
 */
export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  readonly type: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export interface EventRecorder {
  record(events: readonly DomainEvent[]): Promise<void>;
}
