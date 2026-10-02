import { pino, type Logger } from 'pino';
import type { LoggerService } from '@nestjs/common';
import type { AppConfig } from '../../config/env.js';
import { traceLogFields } from '../observability/trace-context.js';

/**
 * Paths that must never reach the logs. Redaction is configured here once,
 * so no individual developer has to remember it.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.refreshToken',
  '*.accessToken',
  '*.code',
  '*.dateOfBirth',
  '*.passwordHash',
  'body.password',
  'body.refreshToken',
  'body.code',
  'body.dateOfBirth',
];

export type ProcessName = 'api' | 'worker' | 'realtime';

export function createLogger(
  config: Pick<AppConfig, 'LOG_LEVEL' | 'LOG_FORMAT' | 'NODE_ENV'>,
  processName: ProcessName,
): Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    base: { service: `raising-talents-${processName}`, env: config.NODE_ENV },
    // Every line logged inside a traced request carries trace_id and span_id.
    mixin: traceLogFields,
    ...(config.LOG_FORMAT === 'pretty'
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  });
}

/** Lets NestJS write its own startup and error logs through pino. */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, String(message));
  }
}
