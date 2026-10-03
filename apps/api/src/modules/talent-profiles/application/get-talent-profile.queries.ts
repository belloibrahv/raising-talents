import type { MyTalentProfile, PublicTalentProfile } from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import { domainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { TaxonomySource } from '../../taxonomy/application/taxonomy-catalog.js';
import { TalentProfileErrors } from '../domain/talent-profile.errors.js';
import type { TalentProfileRepository } from '../domain/talent-profile.repository.js';
import type { ProfileAccounts } from './ports.js';
import {
  toMyTalentProfile,
  toPublicTalentProfile,
  type AvatarUrls,
} from './talent-profile.presenter.js';

export class GetMyTalentProfileQuery {
  constructor(
    private readonly profiles: TalentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly avatarUrls: AvatarUrls,
  ) {}

  async execute(userId: string): Promise<Result<MyTalentProfile, DomainError>> {
    const account = await this.accounts.profileContext(userId);
    if (!account || account.role !== 'talent') return err(TalentProfileErrors.wrongRole());
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) return err(TalentProfileErrors.notFound());
    return ok(toMyTalentProfile(profile, await this.taxonomy.current(), this.avatarUrls));
  }
}

/** Answers whether other users may see a talent. Other modules ask this instead of reading profiles. */
export class TalentDirectory {
  constructor(
    private readonly profiles: TalentProfileRepository,
    private readonly accounts: ProfileAccounts,
  ) {}

  /** The talent's user id when the profile is complete and the account active, otherwise null. */
  async visibleUserId(handle: string): Promise<string | null> {
    const profile = await this.profiles.findByHandle(handle.toLowerCase());
    if (!profile?.isComplete) return null;
    const account = await this.accounts.profileContext(profile.userId);
    return account?.status === 'active' ? profile.userId : null;
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
    private readonly avatarUrls: AvatarUrls,
  ) {}

  async execute(handle: string): Promise<Result<PublicTalentProfile, DomainError>> {
    const notFound = domainError('NOT_FOUND', 'This profile is not available.');
    const profile = await this.profiles.findByHandle(handle.toLowerCase());
    if (!profile?.isComplete) return err(notFound);
    const account = await this.accounts.profileContext(profile.userId);
    if (account?.status !== 'active') return err(notFound);
    const view = toPublicTalentProfile(
      profile,
      await this.taxonomy.current(),
      account.ageYears,
      this.avatarUrls,
    );
    return view ? ok(view) : err(notFound);
  }
}
