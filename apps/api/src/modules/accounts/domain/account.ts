import {
  MINIMUM_AGE_YEARS,
  type AccountStatus,
  type Role,
  type SelectableRole,
} from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { ageInYears } from './age.js';
import { AccountErrors } from './account.errors.js';
import { AccountEvents } from './account.events.js';

export interface AccountProps {
  readonly id: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly role: Role | null;
  readonly roleLockedAt: Date | null;
  readonly status: AccountStatus;
  readonly dateOfBirth: string;
  readonly countryCode: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RegisterAccountInput {
  readonly id: string;
  readonly email: string;
  readonly dateOfBirth: string;
  readonly countryCode: string;
  readonly now: Date;
}

/**
 * A person's account. Owns the age gate, the account status and the role choice.
 * Profiles (talent or agent) live in their own modules.
 */
export class Account {
  private pendingEvents: DomainEvent[] = [];

  private constructor(private props: AccountProps) {}

  static register(input: RegisterAccountInput): Result<Account, DomainError> {
    const age = ageInYears(input.dateOfBirth, input.now);
    if (age === null) return err(AccountErrors.invalidDateOfBirth());
    if (age < MINIMUM_AGE_YEARS) return err(AccountErrors.underMinimumAge());

    const account = new Account({
      id: input.id,
      email: input.email,
      emailVerifiedAt: null,
      role: null,
      roleLockedAt: null,
      status: 'onboarding',
      dateOfBirth: input.dateOfBirth,
      countryCode: input.countryCode,
      createdAt: input.now,
      updatedAt: input.now,
    });
    account.raise(AccountEvents.AccountCreated, input.now, { countryCode: input.countryCode });
    return ok(account);
  }

  static restore(props: AccountProps): Account {
    return new Account(props);
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get isEmailVerified(): boolean {
    return this.props.emailVerifiedAt !== null;
  }

  snapshot(): AccountProps {
    return { ...this.props };
  }

  /** Suspended and banned accounts cannot start or refresh sessions. */
  ensureCanSignIn(): Result<void, DomainError> {
    if (this.props.status === 'suspended') return err(AccountErrors.suspended());
    if (this.props.status === 'banned') return err(AccountErrors.banned());
    return ok(undefined);
  }

  markEmailVerified(now: Date): Result<void, DomainError> {
    if (this.isEmailVerified) return err(AccountErrors.emailAlreadyVerified());
    this.props = { ...this.props, emailVerifiedAt: now, updatedAt: now };
    this.raise(AccountEvents.EmailVerified, now, {});
    return ok(undefined);
  }

  /** The role can change freely until onboarding completes and locks it. */
  selectRole(role: SelectableRole, now: Date): Result<void, DomainError> {
    if (this.props.roleLockedAt !== null) return err(AccountErrors.roleLocked());
    if (!this.isEmailVerified) return err(AccountErrors.emailNotVerified());
    if (this.props.role === role) return ok(undefined);
    this.props = { ...this.props, role, updatedAt: now };
    this.raise(AccountEvents.RoleSelected, now, { role });
    return ok(undefined);
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private raise(type: string, occurredAt: Date, payload: Record<string, unknown>): void {
    this.pendingEvents.push({ type, aggregateId: this.props.id, occurredAt, payload });
  }
}
