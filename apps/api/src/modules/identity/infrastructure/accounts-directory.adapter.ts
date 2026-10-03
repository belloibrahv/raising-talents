import type { AccountsFacade } from '../../accounts/application/accounts.facade.js';
import type { AccountDirectory } from '../application/ports.js';

/** Connects identity's AccountDirectory port to the accounts module's public facade. */
export function accountsDirectory(facade: AccountsFacade): AccountDirectory {
  return {
    create: (input) => facade.createAccount(input),
    findByEmail: (email) => facade.findSummaryByEmail(email),
    findById: (id) => facade.findSummaryById(id),
    ensureCanSignIn: (userId) => facade.ensureCanSignIn(userId),
    markEmailVerified: (userId) => facade.markEmailVerified(userId),
    emailTaken: (email) => facade.emailTaken(email),
    changeEmail: (userId, email) => facade.changeEmail(userId, email),
  };
}
