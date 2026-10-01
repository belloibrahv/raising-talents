import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { CODE_RESEND_COOLDOWN_SECONDS } from '../domain/one-time-code.js';
import type { OneTimeCodeRepository } from '../domain/one-time-code.repository.js';
import { IdentityErrors } from '../domain/identity.errors.js';
import { IdentityEvents } from '../domain/identity.events.js';
import type { AccountDirectory } from './ports.js';

/** "Send me a new code". The worker creates and emails the code. */
export class RequestEmailVerificationHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly codes: OneTimeCodeRepository,
    private readonly events: EventRecorder,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<Result<void, DomainError>> {
    const account = await this.directory.findById(userId);
    if (!account) return err(IdentityErrors.sessionExpired());
    if (account.emailVerified) return err(IdentityErrors.emailAlreadyVerified());

    const now = this.clock.now();
    const latest = await this.codes.findLatest(userId, 'email_verification');
    const wait = latest?.secondsUntilResendAllowed(now) ?? 0;
    if (wait > 0) return err(IdentityErrors.resendTooSoon(wait));

    const limit = await this.rateLimiter.consume(
      `verify-resend:${userId}`,
      1,
      CODE_RESEND_COOLDOWN_SECONDS,
    );
    if (!limit.allowed) return err(IdentityErrors.resendTooSoon(limit.retryAfterSeconds));

    await this.events.record([
      {
        type: IdentityEvents.EmailVerificationRequested,
        aggregateId: userId,
        occurredAt: now,
        payload: {},
      },
    ]);
    return ok(undefined);
  }
}
