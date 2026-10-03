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
  /** Set while the owner has asked for deletion; the account is erased after this moment. */
  readonly deletionScheduledAt: Date | null;
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
      deletionScheduledAt: null,
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

  /**
   * Called when the first complete profile is saved. Locks the role (only an admin can
   * change it afterwards) and activates the account. Safe to call again.
   */
  completeOnboarding(now: Date): Result<void, DomainError> {
    if (this.props.roleLockedAt !== null) return ok(undefined);
    if (!this.isEmailVerified) return err(AccountErrors.emailNotVerified());
    if (this.props.role === null) return err(AccountErrors.noRoleChosen());
    const status = this.props.status === 'onboarding' ? 'active' : this.props.status;
    this.props = { ...this.props, roleLockedAt: now, status, updatedAt: now };
    this.raise(AccountEvents.OnboardingCompleted, now, { role: this.props.role });
    return ok(undefined);
  }

  /**
   * Makes a verified account a moderator or admin. Granted by an operator, never chosen in
   * the app. Staff keep separate accounts, so a talent or agent account cannot be promoted.
   */
  grantStaffRole(role: 'moderator' | 'admin', now: Date): Result<void, DomainError> {
    if (!this.isEmailVerified) return err(AccountErrors.emailNotVerified());
    const current = this.props.role;
    if (current === 'talent' || current === 'agent') {
      if (this.props.roleLockedAt !== null) return err(AccountErrors.memberCannotBeStaff());
    }
    if (current === role && this.props.roleLockedAt !== null) return ok(undefined);
    const status = this.props.status === 'onboarding' ? 'active' : this.props.status;
    this.props = { ...this.props, role, roleLockedAt: now, status, updatedAt: now };
    this.raise(AccountEvents.StaffRoleGranted, now, { role });
    return ok(undefined);
  }

  /**
   * The owner asked to delete the account. It disappears from search and public view at
   * once and is erased after the grace period, unless they cancel first.
   */
  requestDeletion(now: Date, graceDays: number): Result<Date, DomainError> {
    if (this.props.status === 'suspended') return err(AccountErrors.suspended());
    if (this.props.status === 'banned') return err(AccountErrors.banned());
    if (this.props.status === 'pending_deletion' && this.props.deletionScheduledAt) {
      return ok(this.props.deletionScheduledAt);
    }
    const scheduledFor = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);
    this.props = {
      ...this.props,
      status: 'pending_deletion',
      deletionScheduledAt: scheduledFor,
      updatedAt: now,
    };
    this.raise(AccountEvents.DeletionRequested, now, { scheduledFor: scheduledFor.toISOString() });
    return ok(scheduledFor);
  }

  /** Keeps the account. It returns to where it was: active once onboarding had finished. */
  cancelDeletion(now: Date): void {
    if (this.props.status !== 'pending_deletion') return;
    const status = this.props.roleLockedAt === null ? 'onboarding' : 'active';
    this.props = { ...this.props, status, deletionScheduledAt: null, updatedAt: now };
    this.raise(AccountEvents.DeletionCancelled, now, {});
  }

  get role(): Role | null {
    return this.props.role;
  }

  get status(): AccountStatus {
    return this.props.status;
  }

  get dateOfBirth(): string {
    return this.props.dateOfBirth;
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
