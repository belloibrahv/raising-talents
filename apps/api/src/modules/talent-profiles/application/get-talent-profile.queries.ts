import type { MyTalentProfile, PublicTalentProfile } from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import { domainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { TaxonomySource } from '../../taxonomy/application/taxonomy-catalog.js';
import { TalentProfileErrors } from '../domain/talent-profile.errors.js';
import type { TalentProfileRepository } from '../domain/talent-profile.repository.js';
import type { ProfileAccounts } from './ports.js';
import { toMyTalentProfile, toPublicTalentProfile } from './talent-profile.presenter.js';

export class GetMyTalentProfileQuery {
  constructor(
    private readonly profiles: TalentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly taxonomy: TaxonomySource,
  ) {}

  async execute(userId: string): Promise<Result<MyTalentProfile, DomainError>> {
    const account = await this.accounts.profileContext(userId);
    if (!account || account.role !== 'talent') return err(TalentProfileErrors.wrongRole());
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) return err(TalentProfileErrors.notFound());
    return ok(toMyTalentProfile(profile, await this.taxonomy.current()));
  }
}

/**
 * The profile agents see. Incomplete, suspended, banned and deleted profiles all
 * answer the same 404, so a viewer cannot tell which (design section 6.7).
 */
export class GetPublicTalentProfileQuery {
  constructor(
    private readonly profiles: TalentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly taxonomy: TaxonomySource,
  ) {}

  async execute(handle: string): Promise<Result<PublicTalentProfile, DomainError>> {
    const notFound = domainError('NOT_FOUND', 'This profile is not available.');
    const profile = await this.profiles.findByHandle(handle.toLowerCase());
    if (!profile?.isComplete) return err(notFound);
    const account = await this.accounts.profileContext(profile.userId);
    if (account?.status !== 'active') return err(notFound);
    const view = toPublicTalentProfile(profile, await this.taxonomy.current(), account.ageYears);
    return view ? ok(view) : err(notFound);
  }
}
