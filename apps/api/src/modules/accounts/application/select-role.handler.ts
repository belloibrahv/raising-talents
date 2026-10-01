import type { SelectableRole } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import { err, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import { AccountErrors } from '../domain/account.errors.js';
import type { AccountRepository } from '../domain/account.repository.js';

export interface SelectRoleCommand {
  readonly userId: string;
  readonly role: SelectableRole;
}

export class SelectRoleHandler {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  execute(command: SelectRoleCommand): Promise<Result<void, DomainError>> {
    return this.uow.run(async () => {
      const account = await this.accounts.findById(command.userId);
      if (!account) return err(AccountErrors.notFound());

      const result = account.selectRole(command.role, this.clock.now());
      if (!result.ok) return result;

      await this.accounts.save(account);
      return result;
    });
  }
}
