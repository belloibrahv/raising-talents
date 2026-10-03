import type { AccountStatus, MeResponse, Role } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { ageInYears } from '../domain/age.js';
import type { DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { AccountErrors } from '../domain/account.errors.js';
import type { AccountRepository } from '../domain/account.repository.js';
import type { CreateAccountCommand, CreateAccountHandler } from './create-account.handler.js';
import type { GetMeQuery } from './get-me.query.js';
import type { MarkEmailVerifiedHandler } from './mark-email-verified.handler.js';

/** What profile modules need to know about an account. */
export interface ProfileContext {
  readonly userId: string;
  readonly role: Role | null;
  readonly emailVerified: boolean;
  readonly status: AccountStatus;
  /** Whole years. Profiles show this, never the date of birth. */
  readonly ageYears: number | null;
}

/** What an account looks like to other modules. No entity leaves this module. */
export interface AccountSummary {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

/**
 * The only entry point other modules may use. Everything behind it can change
 * without touching identity, profiles or any other module.
 */
export class AccountsFacade {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly createAccountHandler: CreateAccountHandler,
    private readonly markEmailVerifiedHandler: MarkEmailVerifiedHandler,
    private readonly getMeQuery: GetMeQuery,
    private readonly clock: Clock,
  ) {}

  async profileContext(userId: string): Promise<ProfileContext | null> {
    const account = await this.accounts.findById(userId);
    if (!account) return null;
    return {
      userId: account.id,
      role: account.role,
      emailVerified: account.isEmailVerified,
      status: account.status,
      ageYears: ageInYears(account.dateOfBirth, this.clock.now()),
    };
  }

  /**
   * For the search index only: whether the account may be found, and the date of birth so
   * agents can filter by age. Search results show age in years, never this date.
   */
  async indexFacts(userId: string): Promise<{ status: AccountStatus; dateOfBirth: string } | null> {
    const account = await this.accounts.findById(userId);
    return account ? { status: account.status, dateOfBirth: account.dateOfBirth } : null;
  }

  /** Schedules erasure after the grace period. Joins the caller's transaction. */
  async requestDeletion(userId: string, graceDays: number): Promise<Result<Date, DomainError>> {
    const account = await this.accounts.findById(userId);
    if (!account) return err(AccountErrors.notFound());
    const scheduled = account.requestDeletion(this.clock.now(), graceDays);
    if (scheduled.ok) await this.accounts.save(account);
    return scheduled;
  }

  async cancelDeletion(userId: string): Promise<Result<void, DomainError>> {
    const account = await this.accounts.findById(userId);
    if (!account) return err(AccountErrors.notFound());
    account.cancelDeletion(this.clock.now());
    await this.accounts.save(account);
    return ok(undefined);
  }

  async dueForDeletion(limit: number): Promise<string[]> {
    return (await this.accounts.findDueForDeletion(this.clock.now(), limit)).map(
      (account) => account.id,
    );
  }

  /** Erases the account and, through the database, everything that belongs to it. */
  async erase(userId: string): Promise<void> {
    await this.accounts.erase(userId, this.clock.now());
  }

  /** Everything the account holds about the person, for their data export. */
  async exportFacts(userId: string) {
    const account = await this.accounts.findById(userId);
    if (!account) return null;
    const props = account.snapshot();
    return {
      email: props.email,
      emailVerifiedAt: props.emailVerifiedAt?.toISOString() ?? null,
      dateOfBirth: props.dateOfBirth,
      countryCode: props.countryCode,
      role: props.role,
      status: props.status,
      deletionScheduledAt: props.deletionScheduledAt?.toISOString() ?? null,
      createdAt: props.createdAt.toISOString(),
    };
  }

  /** For the operator script only. Logged by the caller. */
  async grantStaffRole(
    email: string,
    role: 'moderator' | 'admin',
  ): Promise<Result<string, DomainError>> {
    const account = await this.accounts.findByEmail(email);
    if (!account) return err(AccountErrors.notFound());
    const granted = account.grantStaffRole(role, this.clock.now());
    if (!granted.ok) return granted;
    await this.accounts.save(account);
    return ok(account.id);
  }

  /** Locks the role and activates the account. Joins the caller's transaction. */
  async completeOnboarding(userId: string): Promise<Result<void, DomainError>> {
    const account = await this.accounts.findById(userId);
    if (!account) return err(AccountErrors.notFound());
    const result = account.completeOnboarding(this.clock.now());
    if (!result.ok) return result;
    await this.accounts.save(account);
    return result;
  }

  async createAccount(command: CreateAccountCommand): Promise<Result<AccountSummary, DomainError>> {
    const created = await this.createAccountHandler.execute(command);
    if (!created.ok) return created;
    return {
      ok: true,
      value: { id: created.value.id, email: created.value.email, emailVerified: false },
    };
  }

  async findSummaryByEmail(email: string): Promise<AccountSummary | null> {
    const account = await this.accounts.findByEmail(email);
    return account
      ? { id: account.id, email: account.email, emailVerified: account.isEmailVerified }
      : null;
  }

  async findSummaryById(id: string): Promise<AccountSummary | null> {
    const account = await this.accounts.findById(id);
    return account
      ? { id: account.id, email: account.email, emailVerified: account.isEmailVerified }
      : null;
  }

  async ensureCanSignIn(userId: string): Promise<Result<void, DomainError>> {
    const account = await this.accounts.findById(userId);
    if (!account) return err(AccountErrors.notFound());
    return account.ensureCanSignIn();
  }

  markEmailVerified(userId: string): Promise<Result<void, DomainError>> {
    return this.markEmailVerifiedHandler.execute(userId);
  }

  getMe(userId: string): Promise<Result<MeResponse, DomainError>> {
    return this.getMeQuery.execute(userId);
  }
}
