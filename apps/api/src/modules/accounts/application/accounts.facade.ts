import type { MeResponse } from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import { err, type Result } from '../../../platform/result.js';
import { AccountErrors } from '../domain/account.errors.js';
import type { AccountRepository } from '../domain/account.repository.js';
import type { CreateAccountCommand, CreateAccountHandler } from './create-account.handler.js';
import type { GetMeQuery } from './get-me.query.js';
import type { MarkEmailVerifiedHandler } from './mark-email-verified.handler.js';

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
  ) {}

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
