import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/** Set by the proxy check in create-api-app when a trusted proxy names the client. */
export type WithClientIp = FastifyRequest & { clientIp?: string };

/**
 * The caller's IP: as named by our own proxy (PROXY_SECRET), or resolved through the load
 * balancer when TRUST_PROXY is on, or the connection's address.
 */
export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<WithClientIp>();
    return request.clientIp ?? request.ip;
  },
);
