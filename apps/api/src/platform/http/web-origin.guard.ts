import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '@rt/contracts';
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { PLATFORM } from '../platform.tokens.js';
import { ProblemException } from './problem.js';

/**
 * Cookie endpoints answer only to the web app's own origins. SameSite=Strict already
 * stops other sites; this also stops a request that carries no Origin at all.
 */
@Injectable()
export class WebOriginGuard implements CanActivate {
  constructor(@Inject(PLATFORM.Config) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<FastifyRequest>().headers.origin;
    if (origin && this.config.WEB_ORIGINS.includes(origin)) return true;
    throw ProblemException.fromCode(
      ErrorCode.Forbidden,
      'This request must come from the web app.',
    );
  }
}
