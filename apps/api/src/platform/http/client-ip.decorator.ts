import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/** The caller's IP, already resolved through the load balancer when TRUST_PROXY is on. */
export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<FastifyRequest>().ip,
);
