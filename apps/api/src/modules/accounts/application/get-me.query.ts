import type { MeResponse } from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { Account } from '../domain/account.js';
import { AccountErrors } from '../domain/account.errors.js';
import type { AccountRepository } from '../domain/account.repository.js';

export function toMeResponse(account: Account): MeResponse {
  const props = account.snapshot();
  return {
    id: props.id,
    email: props.email,
    emailVerified: props.emailVerifiedAt !== null,
    role: props.role,
    roleLocked: props.roleLockedAt !== null,
    status: props.status,
    countryCode: props.countryCode,
    deletionScheduledAt: props.deletionScheduledAt?.toISOString() ?? null,
    createdAt: props.createdAt.toISOString(),
  };
}

export class GetMeQuery {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(userId: string): Promise<Result<MeResponse, DomainError>> {
    const account = await this.accounts.findById(userId);
    return account ? ok(toMeResponse(account)) : err(AccountErrors.notFound());
  }
}
