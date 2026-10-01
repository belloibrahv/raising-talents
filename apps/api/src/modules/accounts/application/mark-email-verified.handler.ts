import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import { err, type Result } from '../../../platform/result.js';
import { AccountErrors } from '../domain/account.errors.js';
import type { AccountRepository } from '../domain/account.repository.js';

export class MarkEmailVerifiedHandler {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<Result<void, DomainError>> {
    const account = await this.accounts.findById(userId);
    if (!account) return err(AccountErrors.notFound());

    const result = account.markEmailVerified(this.clock.now());
    if (!result.ok) return result;

    await this.accounts.save(account);
    return result;
  }
}
