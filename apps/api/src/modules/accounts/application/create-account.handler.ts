import type { DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { Account } from '../domain/account.js';
import { AccountErrors } from '../domain/account.errors.js';
import type { AccountRepository } from '../domain/account.repository.js';

export interface CreateAccountCommand {
  readonly id: string;
  readonly email: string;
  readonly dateOfBirth: string;
  readonly countryCode: string;
  readonly now: Date;
}

/** Creates an account. Runs inside the caller's transaction (sign-up). */
export class CreateAccountHandler {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(command: CreateAccountCommand): Promise<Result<Account, DomainError>> {
    if (await this.accounts.emailExists(command.email))
      return err(AccountErrors.emailAlreadyRegistered());

    const registered = Account.register(command);
    if (!registered.ok) return registered;

    await this.accounts.save(registered.value);
    return ok(registered.value);
  }
}
