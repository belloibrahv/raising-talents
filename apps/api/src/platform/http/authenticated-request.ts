import type { FastifyRequest } from 'fastify';

export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
}

export type AuthenticatedRequest = FastifyRequest & { principal: Principal };
