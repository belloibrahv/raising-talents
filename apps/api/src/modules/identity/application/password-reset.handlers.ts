import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent, EventRecorder } from '../../../platform/domain-event.js';
import { newId } from '../../../platform/ids.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { CredentialRepository } from '../domain/credential.repository.js';
import { IdentityErrors } from '../domain/identity.errors.js';
import { IdentityEvents } from '../domain/identity.events.js';
import { OneTimeCode } from '../domain/one-time-code.js';
import type { OneTimeCodeRepository } from '../domain/one-time-code.repository.js';
import { checkPasswordPolicy } from '../domain/password-policy.js';
import type { SessionRepository } from '../domain/session.repository.js';
import { passwordChangedEmail, passwordResetCodeEmail } from './emails/password-reset.templates.js';
import type {
  AccountDirectory,
  BreachedPasswordChecker,
  EmailSender,
  IdentitySettings,
  PasswordHasher,
  VerificationCodeFactory,
} from './ports.js';

export const PASSWORD_RESET_LIMITS = {
  requestsPerIp: { limit: 20, windowSeconds: 3600 },
  requestsPerEmail: { limit: 5, windowSeconds: 3600 },
  confirmsPerEmail: { limit: 10, windowSeconds: 900 },
} as const;

/**
 * "I forgot my password". Answers the same whether or not the email has an account, so it
 * cannot be used to find out who is on Raising Talents. The worker sends the code.
 */
export class RequestPasswordResetHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly codes: OneTimeCodeRepository,
    private readonly events: EventRecorder,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async execute(input: { email: string; ip: string }): Promise<Result<void, DomainError>> {
    const { requestsPerIp, requestsPerEmail } = PASSWORD_RESET_LIMITS;
    // Counted for every address, account or not, so a refusal reveals nothing either.
    for (const [key, rule] of [
      [`reset-request:ip:${input.ip}`, requestsPerIp],
      [`reset-request:email:${input.email}`, requestsPerEmail],
    ] as const) {
      const decision = await this.rateLimiter.consume(key, rule.limit, rule.windowSeconds);
      if (!decision.allowed) return err(IdentityErrors.rateLimited(decision.retryAfterSeconds));
    }

    const account = await this.directory.findByEmail(input.email);
    if (!account) return ok(undefined);

    const now = this.clock.now();
    const latest = await this.codes.findLatest(account.id, 'password_reset');
    // A code was sent moments ago; sending another would only race it. Same answer either way.
    if ((latest?.secondsUntilResendAllowed(now) ?? 0) > 0) return ok(undefined);

    await this.events.record([
      {
        type: IdentityEvents.PasswordResetRequested,
        aggregateId: account.id,
        occurredAt: now,
        payload: {},
      },
    ]);
    return ok(undefined);
  }
}

/**
 * Runs in the worker. Sends before saving, like the email verification code: if sending
 * fails the event is retried, and a code newer than the event means it was already handled.
 */
export class IssuePasswordResetCodeHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly codes: OneTimeCodeRepository,
    private readonly codeFactory: VerificationCodeFactory,
    private readonly email: EmailSender,
    private readonly clock: Clock,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const account = await this.directory.findById(event.aggregateId);
    if (!account) return;
    const latest = await this.codes.findLatest(account.id, 'password_reset');
    if (latest && latest.createdAt >= event.occurredAt) return;

    const now = this.clock.now();
    const { code, hash } = this.codeFactory.create();
    await this.email.send(passwordResetCodeEmail({ to: account.email, code }));
    if (latest) {
      latest.invalidate(now);
      await this.codes.save(latest);
    }
    await this.codes.save(
      OneTimeCode.issue({
        id: newId(),
        userId: account.id,
        purpose: 'password_reset',
        codeHash: hash,
        now,
      }),
    );
  }
}

/**
 * Sets a new password with the emailed code, then signs the account out everywhere: if
 * someone else had the old password, they lose access now. Receiving the code also
 * proves the email address, so an unverified one becomes verified.
 */
export class ResetPasswordHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly codes: OneTimeCodeRepository,
    private readonly codeFactory: VerificationCodeFactory,
    private readonly credentials: CredentialRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly breached: BreachedPasswordChecker,
    private readonly events: EventRecorder,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly settings: IdentitySettings,
  ) {}

  async execute(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<Result<void, DomainError>> {
    const { confirmsPerEmail } = PASSWORD_RESET_LIMITS;
    const limit = await this.rateLimiter.consume(
      `reset-confirm:${input.email}`,
      confirmsPerEmail.limit,
      confirmsPerEmail.windowSeconds,
    );
    if (!limit.allowed) return err(IdentityErrors.rateLimited(limit.retryAfterSeconds));

    // The password is checked before the code is used, so a weak password does not burn the code.
    const policy = checkPasswordPolicy(input.newPassword, input.email);
    if (!policy.ok) return policy;
    if (
      this.settings.breachedPasswordCheck &&
      (await this.breached.isBreached(input.newPassword))
    ) {
      return err(IdentityErrors.breachedPassword());
    }

    // No account and no code look the same from outside.
    const account = await this.directory.findByEmail(input.email);
    const code = account ? await this.codes.findLatest(account.id, 'password_reset') : null;
    if (!account || !code) return err(IdentityErrors.codeExpired());

    const now = this.clock.now();
    const attempt = code.attempt(this.codeFactory.hashOf(input.code), now);
    if (!attempt.ok) {
      // A wrong guess counts even though the request fails.
      await this.codes.save(code);
      return attempt;
    }

    const passwordHash = await this.hasher.hash(input.newPassword);
    return this.uow.run(async () => {
      await this.codes.save(code);
      await this.credentials.savePasswordHash(account.id, passwordHash, now);
      await this.sessions.revokeAllForUser(account.id, 'password_reset', now);
      if (!account.emailVerified) {
        const verified = await this.directory.markEmailVerified(account.id);
        if (!verified.ok) return verified;
      }
      await this.events.record([
        {
          type: IdentityEvents.PasswordChanged,
          aggregateId: account.id,
          occurredAt: now,
          payload: {},
        },
      ]);
      return ok(undefined);
    });
  }
}

/** Runs in the worker: tells the owner their password changed, in case it was not them. */
export class NotifyPasswordChangedHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly email: EmailSender,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const account = await this.directory.findById(event.aggregateId);
    if (!account) return;
    const signedOut = event.payload['signedOut'] === 'others' ? 'others' : 'all';
    await this.email.send(passwordChangedEmail({ to: account.email, signedOut }));
  }
}
