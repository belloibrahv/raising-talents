import type { DomainError } from '../../../platform/domain-error.js';
import type { Result } from '../../../platform/result.js';
import type { AccountStatus, Role } from '@rt/contracts';

/** What talent profiles need from accounts, shaped by this module. */
export interface ProfileAccounts {
  profileContext(userId: string): Promise<{
    role: Role | null;
    emailVerified: boolean;
    status: AccountStatus;
    ageYears: number | null;
  } | null>;
  completeOnboarding(userId: string): Promise<Result<void, DomainError>>;
}
