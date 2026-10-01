import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '@rt/contracts';
import { ACCESS_TOKENS, type AccessTokenVerifier } from '../auth/access-tokens.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { ProblemException } from './problem.js';

/** Requires a valid bearer access token and attaches the principal to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(ACCESS_TOKENS.Verifier) private readonly verifier: AccessTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
    if (!token) throw ProblemException.fromCode(ErrorCode.Unauthenticated, 'Sign in to continue');

    const principal = await this.verifier.verify(token);
    if (!principal)
      throw ProblemException.fromCode(ErrorCode.SessionExpired, 'Your session has expired');

    request.principal = principal;
    return true;
  }
}
