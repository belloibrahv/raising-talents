import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { OneTimeCodeRepository } from '../domain/one-time-code.repository.js';
import { IdentityErrors } from '../domain/identity.errors.js';
import type { AccountDirectory, VerificationCodeFactory } from './ports.js';

export interface VerifyEmailCommand {
  readonly userId: string;
  readonly code: string;
}

export class VerifyEmailHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly codes: OneTimeCodeRepository,
    private readonly codeFactory: VerificationCodeFactory,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<Result<void, DomainError>> {
    const limit = await this.rateLimiter.consume(`verify:${command.userId}`, 10, 900);
    if (!limit.allowed) return err(IdentityErrors.rateLimited(limit.retryAfterSeconds));

    const account = await this.directory.findById(command.userId);
    if (!account) return err(IdentityErrors.sessionExpired());
    if (account.emailVerified) return err(IdentityErrors.emailAlreadyVerified());

    const code = await this.codes.findLatest(command.userId, 'email_verification');
    if (!code) return err(IdentityErrors.codeExpired());

    const attempt = code.attempt(this.codeFactory.hashOf(command.code), this.clock.now());
    if (!attempt.ok) {
      // A wrong guess is saved outside any transaction, so it counts even though the request fails.
      await this.codes.save(code);
      return attempt;
    }

    return this.uow.run(async () => {
      await this.codes.save(code);
      return this.directory.markEmailVerified(command.userId);
    });
  }
}
