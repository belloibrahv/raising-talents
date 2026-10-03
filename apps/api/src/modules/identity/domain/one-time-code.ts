import type { DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { IdentityErrors } from './identity.errors.js';

export type OneTimeCodePurpose = 'email_verification' | 'password_reset' | 'email_change';

export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_COOLDOWN_SECONDS = 60;

export interface OneTimeCodeProps {
  readonly id: string;
  readonly userId: string;
  readonly purpose: OneTimeCodePurpose;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly consumedAt: Date | null;
  readonly createdAt: Date;
}

/** A short numeric code sent by email. Only its keyed hash is stored. */
export class OneTimeCode {
  private constructor(private props: OneTimeCodeProps) {}

  static issue(input: {
    id: string;
    userId: string;
    purpose: OneTimeCodePurpose;
    codeHash: string;
    now: Date;
  }): OneTimeCode {
    return new OneTimeCode({
      id: input.id,
      userId: input.userId,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: new Date(input.now.getTime() + CODE_TTL_MINUTES * 60 * 1000),
      attempts: 0,
      consumedAt: null,
      createdAt: input.now,
    });
  }

  static restore(props: OneTimeCodeProps): OneTimeCode {
    return new OneTimeCode(props);
  }

  snapshot(): OneTimeCodeProps {
    return { ...this.props };
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  isActive(now: Date): boolean {
    return (
      this.props.consumedAt === null &&
      now < this.props.expiresAt &&
      this.props.attempts < CODE_MAX_ATTEMPTS
    );
  }

  secondsUntilResendAllowed(now: Date): number {
    const elapsed = Math.floor((now.getTime() - this.props.createdAt.getTime()) / 1000);
    return Math.max(CODE_RESEND_COOLDOWN_SECONDS - elapsed, 0);
  }

  /**
   * Checks a candidate. A wrong guess counts as an attempt and must be saved
   * even though the request fails.
   */
  attempt(candidateHash: string, now: Date): Result<void, DomainError> {
    if (this.props.consumedAt !== null || now >= this.props.expiresAt)
      return err(IdentityErrors.codeExpired());
    if (this.props.attempts >= CODE_MAX_ATTEMPTS) return err(IdentityErrors.attemptsExceeded());

    if (candidateHash !== this.props.codeHash) {
      const attempts = this.props.attempts + 1;
      this.props = { ...this.props, attempts };
      return attempts >= CODE_MAX_ATTEMPTS
        ? err(IdentityErrors.attemptsExceeded())
        : err(IdentityErrors.codeInvalid(CODE_MAX_ATTEMPTS - attempts));
    }

    this.props = { ...this.props, consumedAt: now };
    return ok(undefined);
  }

  invalidate(now: Date): void {
    if (this.props.consumedAt === null) this.props = { ...this.props, consumedAt: now };
  }
}
