import type { Clock } from '../../../platform/clock.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { newId } from '../../../platform/ids.js';
import { OneTimeCode } from '../domain/one-time-code.js';
import type { OneTimeCodeRepository } from '../domain/one-time-code.repository.js';
import { verificationCodeEmail } from './emails/verification-code.template.js';
import type { AccountDirectory, EmailSender, VerificationCodeFactory } from './ports.js';

/**
 * Runs in the worker when EmailVerificationRequested is published.
 * The email is sent before the code is saved. If sending fails the event is
 * retried; if a code newer than the event already exists, the request was
 * already handled and nothing happens.
 */
export class IssueEmailVerificationCodeHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly codes: OneTimeCodeRepository,
    private readonly codeFactory: VerificationCodeFactory,
    private readonly email: EmailSender,
    private readonly clock: Clock,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const account = await this.directory.findById(event.aggregateId);
    if (!account || account.emailVerified) return;

    const latest = await this.codes.findLatest(account.id, 'email_verification');
    if (latest && latest.createdAt >= event.occurredAt) return;

    const now = this.clock.now();
    const { code, hash } = this.codeFactory.create();
    await this.email.send(verificationCodeEmail({ to: account.email, code }));

    if (latest) {
      latest.invalidate(now);
      await this.codes.save(latest);
    }
    await this.codes.save(
      OneTimeCode.issue({
        id: newId(),
        userId: account.id,
        purpose: 'email_verification',
        codeHash: hash,
        now,
      }),
    );
  }
}
