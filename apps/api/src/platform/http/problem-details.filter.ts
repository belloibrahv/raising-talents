import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import { ErrorCode } from '@rt/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { ProblemException } from './problem.js';

/** Turns every error into RFC 9457 problem details with our stable error code. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const problem = this.toProblem(exception, request);

    if (problem.problem.status >= 500) {
      this.logger.error({ err: exception, reqId: request.id }, 'Unhandled error');
    }
    if (problem.problem.retryAfterSeconds !== undefined) {
      void reply.header('Retry-After', String(problem.problem.retryAfterSeconds));
    }
    void reply
      .status(problem.problem.status)
      .type('application/problem+json')
      .send({ ...problem.problem, traceId: request.id });
  }

  private toProblem(exception: unknown, request: FastifyRequest): ProblemException {
    if (exception instanceof ProblemException) return exception;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404)
        return ProblemException.fromCode(
          ErrorCode.NotFound,
          `No route for ${request.method} ${request.url}`,
        );
      if (status === 401) return ProblemException.fromCode(ErrorCode.Unauthenticated);
      if (status === 403) return ProblemException.fromCode(ErrorCode.Forbidden);
      if (status === 429) return ProblemException.fromCode(ErrorCode.RateLimited);
      if (status >= 400 && status < 500)
        return ProblemException.fromCode(ErrorCode.ValidationFailed, exception.message);
    }

    const fastifyError = exception as { statusCode?: number; message?: string };
    if (
      typeof fastifyError.statusCode === 'number' &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      return ProblemException.fromCode(ErrorCode.ValidationFailed, fastifyError.message);
    }

    return ProblemException.fromCode(ErrorCode.Internal);
  }
}
