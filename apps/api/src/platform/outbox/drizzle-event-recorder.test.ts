import { context, propagation, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DrizzleUnitOfWork } from '../database/drizzle-unit-of-work.js';
import { DrizzleEventRecorder } from './drizzle-event-recorder.js';

/** Captures what would be inserted, without a database. */
function capturingUnitOfWork() {
  const inserted: Record<string, unknown>[] = [];
  const uow = {
    executor: () => ({
      insert: () => ({
        values: (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as DrizzleUnitOfWork;
  return { uow, inserted };
}

const event = {
  type: 'identity.EmailVerificationRequested',
  aggregateId: '0192a3b4-0000-7000-8000-000000000001',
  occurredAt: new Date('2026-10-01T09:00:00.000Z'),
  payload: {},
};

describe('DrizzleEventRecorder', () => {
  const contextManager = new AsyncLocalStorageContextManager();

  beforeAll(() => {
    context.setGlobalContextManager(contextManager.enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  });

  afterAll(() => {
    context.disable();
    propagation.disable();
  });

  it('stores the trace context of the request, so the worker continues the same trace', async () => {
    const { uow, inserted } = capturingUnitOfWork();
    const requestSpan = trace.wrapSpanContext({
      traceId: 'de5ae0a95823ba13bf292e729678e6e2',
      spanId: '9cc04fbf0e09c100',
      traceFlags: TraceFlags.SAMPLED,
    });

    await context.with(trace.setSpan(context.active(), requestSpan), () =>
      new DrizzleEventRecorder(uow).record([event]),
    );

    expect(inserted[0]?.headers).toEqual({
      traceparent: '00-de5ae0a95823ba13bf292e729678e6e2-9cc04fbf0e09c100-01',
    });
  });

  it('stores empty headers when nothing is being traced', async () => {
    const { uow, inserted } = capturingUnitOfWork();
    await new DrizzleEventRecorder(uow).record([event]);
    expect(inserted[0]?.headers).toEqual({});
  });
});
