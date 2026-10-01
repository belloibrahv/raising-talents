import type { Account } from './account.js';

/** Persists accounts. Saving also records the account's pending events to the outbox. */
export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  emailExists(email: string): Promise<boolean>;
  save(account: Account): Promise<void>;
}
