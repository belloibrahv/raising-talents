import type { MeResponse, PendingEmailChange } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent, EventRecorder } from '../../../platform/domain-event.js';
import { newId } from '../../../platform/ids.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { CredentialRepository } from '../domain/credential.repository.js';
import type { EmailChange, EmailChangeRepository } from '../domain/email-change.js';
import { IdentityErrors } from '../domain/identity.errors.js';
import { IdentityEvents } from '../domain/identity.events.js';
import { OneTimeCode } from '../domain/one-time-code.js';
import type { OneTimeCodeRepository } from '../domain/one-time-code.repository.js';
import {
  emailChangeCodeEmail,
  emailChangedEmail,
  emailChangeRequestedEmail,
} from './emails/email-change.templates.js';
import type {
  AccountDirectory,
  EmailSender,
  PasswordHasher,
  VerificationCodeFactory,
} from './ports.js';

export const EMAIL_CHANGE_LIMITS = {
  requestsPerUser: { limit: 5, windowSeconds: 3600 },
  confirmsPerUser: { limit: 10, windowSeconds: 900 },
} as const;

/** A request is forgotten after a day, so a stale one never blocks or confuses later. */
export const EMAIL_CHANGE_TTL_HOURS = 24;

const isOpen = (change: EmailChange | null, now: Date): change is EmailChange =>
  change !== null &&
  change.confirmedAt === null &&
  now.getTime() - change.requestedAt.getTime() < EMAIL_CHANGE_TTL_HOURS * 3_600_000;

const pendingView = (change: EmailChange): PendingEmailChange => ({
  newEmail: change.newEmail,
  requestedAt: change.requestedAt.toISOString(),
});

/** Who confirms the account's details back to the app after the change. */
export interface EmailChangeAccounts {
  getMe(userId: string): Promise<Result<MeResponse, DomainError>>;
}

/**
 * Starts a move to a new address. Needs the password, refuses an address another account
 * uses, and leaves the code and the emails to the worker so the code never enters the
 * outbox (ADR-034).
 */
export class RequestEmailChangeHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly changes: EmailChangeRepository,
    private readonly codes: OneTimeCodeRepository,
    private readonly events: EventRecorder,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    input: { newEmail: string; password: string },
  ): Promise<Result<PendingEmailChange, DomainError>> {
    const { limit, windowSeconds } = EMAIL_CHANGE_LIMITS.requestsPerUser;
    const decision = await this.rateLimiter.consume(`email-change:${userId}`, limit, windowSeconds);
    if (!decision.allowed) return err(IdentityErrors.rateLimited(decision.retryAfterSeconds));

    const [account, hash] = await Promise.all([
      this.directory.findById(userId),
      this.credentials.findPasswordHash(userId),
    ]);
    if (!account || !hash || !(await this.hasher.verify(hash, input.password))) {
      return err(domainError('INVALID_CREDENTIALS', 'Your password is not right.'));
    }
    if (input.newEmail === account.email) {
      return err(domainError('CONFLICT', 'That is already your email address.'));
    }
    if (await this.directory.emailTaken(input.newEmail)) {
      return err(
        domainError('EMAIL_ALREADY_REGISTERED', 'Another account already uses that address.'),
      );
    }

    const now = this.clock.now();
    const existing = await this.changes.find(userId);
    const latest = await this.codes.findLatest(userId, 'email_change');
    // The same address asked for again moments later: the code on its way still works.
    if (
      isOpen(existing, now) &&
      existing.newEmail === input.newEmail &&
      (latest?.secondsUntilResendAllowed(now) ?? 0) > 0
    ) {
      return ok(pendingView(existing));
    }

    const change: EmailChange = {
      userId,
      newEmail: input.newEmail,
      previousEmail: account.email,
      requestedAt: now,
      confirmedAt: null,
    };
    await this.uow.run(async () => {
      await this.changes.save(change);
      await this.events.record([
        {
          type: IdentityEvents.EmailChangeRequested,
          aggregateId: userId,
          occurredAt: now,
          payload: {},
        },
      ]);
    });
    return ok(pendingView(change));
  }
}

/** Runs in the worker: the code to the new address, a warning to the old one. */
export class IssueEmailChangeCodeHandler {
  constructor(
    private readonly changes: EmailChangeRepository,
    private readonly codes: OneTimeCodeRepository,
    private readonly codeFactory: VerificationCodeFactory,
    private readonly email: EmailSender,
    private readonly clock: Clock,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const now = this.clock.now();
    const change = await this.changes.find(event.aggregateId);
    if (!isOpen(change, now)) return;
    const latest = await this.codes.findLatest(change.userId, 'email_change');
    // A code newer than this event means a redelivery: it was already handled.
    if (latest && latest.createdAt >= event.occurredAt) return;

    const { code, hash } = this.codeFactory.create();
    await this.email.send(emailChangeCodeEmail({ to: change.newEmail, code }));
    await this.email.send(
      emailChangeRequestedEmail({ to: change.previousEmail, newEmail: change.newEmail }),
    );
    if (latest) {
      latest.invalidate(now);
      await this.codes.save(latest);
    }
    await this.codes.save(
      OneTimeCode.issue({
        id: newId(),
        userId: change.userId,
        purpose: 'email_change',
        codeHash: hash,
        now,
      }),
    );
  }
}

export class GetPendingEmailChangeQuery {
  constructor(
    private readonly changes: EmailChangeRepository,
    private readonly clock: Clock,
  ) {}

  /** Null when nothing is waiting, which is the usual case and not an error. */
  async execute(userId: string): Promise<PendingEmailChange | null> {
    const change = await this.changes.find(userId);
    return isOpen(change, this.clock.now()) ? pendingView(change) : null;
  }
}

export class CancelEmailChangeHandler {
  constructor(
    private readonly changes: EmailChangeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<void> {
    const change = await this.changes.find(userId);
    if (isOpen(change, this.clock.now())) await this.changes.remove(userId);
  }
}

/**
 * Finishes the move with the code. The new address is proven, so it counts as verified.
 * The row stays, marked confirmed, until the worker has told the old address.
 */
export class ConfirmEmailChangeHandler {
  constructor(
    private readonly changes: EmailChangeRepository,
    private readonly codes: OneTimeCodeRepository,
    private readonly codeFactory: VerificationCodeFactory,
    private readonly directory: AccountDirectory,
    private readonly accounts: EmailChangeAccounts,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, code: string): Promise<Result<MeResponse, DomainError>> {
    const { limit, windowSeconds } = EMAIL_CHANGE_LIMITS.confirmsPerUser;
    const decision = await this.rateLimiter.consume(
      `email-change-confirm:${userId}`,
      limit,
      windowSeconds,
    );
    if (!decision.allowed) return err(IdentityErrors.rateLimited(decision.retryAfterSeconds));

    const now = this.clock.now();
    const change = await this.changes.find(userId);
    const latest = isOpen(change, now) ? await this.codes.findLatest(userId, 'email_change') : null;
    if (!change || !latest) return err(IdentityErrors.codeExpired());

    const attempt = latest.attempt(this.codeFactory.hashOf(code), now);
    if (!attempt.ok) {
      // A wrong guess counts even though the request fails.
      await this.codes.save(latest);
      return attempt;
    }
    const changed = await this.uow.run(async (): Promise<Result<void, DomainError>> => {
      await this.codes.save(latest);
      const moved = await this.directory.changeEmail(userId, change.newEmail);
      if (!moved.ok) return moved;
      await this.changes.save({ ...change, confirmedAt: now });
      return ok(undefined);
    });
    if (!changed.ok) return changed;
    return this.accounts.getMe(userId);
  }
}

/** Runs in the worker after the account moved: tells the old address, then forgets it. */
export class NotifyEmailChangedHandler {
  constructor(
    private readonly changes: EmailChangeRepository,
    private readonly email: EmailSender,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const change = await this.changes.find(event.aggregateId);
    if (!change?.confirmedAt) return;
    await this.email.send(
      emailChangedEmail({ to: change.previousEmail, newEmail: change.newEmail }),
    );
    await this.changes.remove(change.userId);
  }
}
