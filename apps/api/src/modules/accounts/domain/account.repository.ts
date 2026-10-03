import type { Account } from './account.js';

/** Thrown by save when another account already has the email address. */
export class EmailTakenError extends Error {
  constructor() {
    super('email already registered');
    this.name = 'EmailTakenError';
  }
}

/** Persists accounts. Saving also records the account's pending events to the outbox. */
export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  emailExists(email: string): Promise<boolean>;
  save(account: Account): Promise<void>;
  /** Accounts whose grace period has ended, oldest first. */
  findDueForDeletion(now: Date, limit: number): Promise<Account[]>;
  /** Erases the account; the database removes everything that belongs to it. Records AccountDeleted. */
  erase(id: string, now: Date): Promise<void>;
}
