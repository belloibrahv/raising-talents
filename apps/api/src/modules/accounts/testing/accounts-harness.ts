import type { SelectableRole } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import { newId } from '../../../platform/ids.js';
import { AccountsFacade } from '../application/accounts.facade.js';
import { CreateAccountHandler } from '../application/create-account.handler.js';
import { GetMeQuery } from '../application/get-me.query.js';
import { MarkEmailVerifiedHandler } from '../application/mark-email-verified.handler.js';
import { Account } from '../domain/account.js';
import { InMemoryAccountRepository } from './in-memory-account.repository.js';

/** The real accounts facade over in-memory storage, with a helper to create ready accounts. */
export function createAccountsHarness(events: EventRecorder, clock: Clock) {
  const repository = new InMemoryAccountRepository(events);
  const facade = new AccountsFacade(
    repository,
    new CreateAccountHandler(repository),
    new MarkEmailVerifiedHandler(repository, clock),
    new GetMeQuery(repository),
    clock,
  );

  async function createAccount(input: {
    email: string;
    role?: SelectableRole | null;
    verified?: boolean;
    dateOfBirth?: string;
  }): Promise<string> {
    const now = clock.now();
    const registered = Account.register({
      id: newId(),
      email: input.email,
      dateOfBirth: input.dateOfBirth ?? '2001-04-17',
      countryCode: 'NG',
      now,
    });
    if (!registered.ok) throw new Error(registered.error.message);
    const account = registered.value;
    if (input.verified ?? true) account.markEmailVerified(now);
    if (input.role) account.selectRole(input.role, now);
    await repository.save(account);
    return account.id;
  }

  return { repository, facade, createAccount };
}
