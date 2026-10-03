import { context, propagation, ROOT_CONTEXT, trace, type Context } from '@opentelemetry/api';

/** The active trace id, or undefined when tracing is off or nothing is being traced. */
export function currentTraceId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && trace.isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
}

/** Log fields that tie a log line to its trace. Empty when tracing is off. */
export function traceLogFields(): Record<string, string> {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !trace.isSpanContextValid(spanContext)) return {};
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

/** Serialises the current trace context (W3C traceparent) so it can travel inside an outbox row. */
export function captureTraceHeaders(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** Rebuilds a trace context saved by captureTraceHeaders. */
export function restoreTraceContext(headers: Record<string, string>): Context {
  return propagation.extract(ROOT_CONTEXT, headers);
}

/** Gives the HTTP server span a stable name and route, for example POST /v1/auth/sign-up. */
export function nameServerSpan(method: string, route: string | undefined): void {
  const span = trace.getActiveSpan();
  if (!span || !route) return;
  span.setAttribute('http.route', route);
  span.updateName(`${method} ${route}`);
}
