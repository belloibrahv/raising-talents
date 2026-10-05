import type { MyTalentProfile, PublicTalentProfile, TalentCard } from '@rt/contracts';
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

/**
 * Who others may see: an active account with a verified email. Until the email is verified
 * the profile is private, however complete it is (ADR-037).
 */
export const isPublic = (account: { status: string; emailVerified: boolean } | null): boolean =>
  account?.status === 'active' && account.emailVerified;

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

/** A visible talent as the search index needs them: the public view, plus who and when. */
export interface SearchableTalent {
  readonly userId: string;
  readonly profile: PublicTalentProfile;
  readonly updatedAt: Date;
}

/** Answers whether other users may see a talent. Other modules ask this instead of reading profiles. */
export class TalentDirectory {
  constructor(
    private readonly profiles: TalentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly avatarUrls: AvatarUrls,
  ) {}

  /**
   * The public view of a complete profile, or null when it is not complete. The account's
   * status is the caller's to check: search removes anyone who is not active.
   */
  async searchable(userId: string): Promise<SearchableTalent | null> {
    const profile = await this.profiles.findByUserId(userId);
    if (!profile?.isComplete) return null;
    const view = toPublicTalentProfile(
      profile,
      await this.taxonomy.current(),
      null,
      this.avatarUrls,
    );
    return view ? { userId, profile: view, updatedAt: profile.snapshot().updatedAt } : null;
  }

  /** Every complete profile's user id, in pages, for rebuilding the search index. */
  async *completeUserIds(pageSize = 500): AsyncGenerator<readonly string[]> {
    let after: string | null = null;
    for (;;) {
      const page = await this.profiles.listCompleteUserIds(after, pageSize);
      if (page.length === 0) return;
      yield page;
      after = page[page.length - 1] ?? null;
    }
  }

  /** The card agents see in lists, or null when the talent is not visible to them now. */
  async cardFor(userId: string): Promise<TalentCard | null> {
    const [profile, account] = await Promise.all([
      this.profiles.findByUserId(userId),
      this.accounts.profileContext(userId),
    ]);
    if (!profile?.isComplete || !account || !isPublic(account)) return null;
    const view = toPublicTalentProfile(
      profile,
      await this.taxonomy.current(),
      account.ageYears,
      this.avatarUrls,
    );
    return view
      ? {
          handle: view.handle,
          displayName: view.displayName,
          category: view.category,
          subcategories: view.subcategories,
          city: view.city,
          ageYears: view.ageYears,
          verified: view.verified,
          avatarUrls: view.avatarUrls,
        }
      : null;
  }

  /** The user id behind a handle, whatever the account's status. For undoing a saved reference. */
  async userIdOf(handle: string): Promise<string | null> {
    return (await this.profiles.findByHandle(handle.toLowerCase()))?.userId ?? null;
  }

  /**
   * The page anyone with the link can see (ADR-042): only for a complete, public profile
   * whose owner turned the link on, and never with age or gender.
   */
  async shareable(handle: string): Promise<{
    userId: string;
    handle: string;
    displayName: string;
    bio: string;
    discipline: string;
    category: string;
    city: string;
    skills: string[];
    verified: boolean;
    avatarUrls: TalentCard['avatarUrls'];
  } | null> {
    const profile = await this.profiles.findByHandle(handle.toLowerCase());
    if (!profile?.isComplete || !profile.snapshot().publicLink) return null;
    const account = await this.accounts.profileContext(profile.userId);
    if (!isPublic(account)) return null;
    const view = toPublicTalentProfile(
      profile,
      await this.taxonomy.current(),
      null,
      this.avatarUrls,
    );
    if (!view) return null;
    return {
      userId: profile.userId,
      handle: view.handle,
      displayName: view.displayName,
      bio: view.bio,
      discipline: view.subcategories.map((entry) => entry.name).join(', ') || view.category.name,
      category: view.category.name,
      city: view.city.name,
      skills: view.skills.map((entry) => entry.name),
      verified: view.verified,
      avatarUrls: view.avatarUrls,
    };
  }

  /** The name and handle, whatever the account's status, for someone they already talk to. */
  async nameOf(userId: string): Promise<{ handle: string; displayName: string } | null> {
    const props = (await this.profiles.findByUserId(userId))?.snapshot();
    return props?.handle && props.displayName
      ? { handle: props.handle, displayName: props.displayName }
      : null;
  }

  /** The handle, whatever the account's status. For the owner's data export only. */
  async handleOf(userId: string): Promise<string | null> {
    return (await this.profiles.findByUserId(userId))?.snapshot().handle ?? null;
  }

  /** The talent's user id when the profile is complete and the account active, otherwise null. */
  async visibleUserId(handle: string): Promise<string | null> {
    const profile = await this.profiles.findByHandle(handle.toLowerCase());
    if (!profile?.isComplete) return null;
    const account = await this.accounts.profileContext(profile.userId);
    return isPublic(account) ? profile.userId : null;
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
    if (!isPublic(account) || !account) return err(notFound);
    const view = toPublicTalentProfile(
      profile,
      await this.taxonomy.current(),
      account.ageYears,
      this.avatarUrls,
    );
    return view ? ok(view) : err(notFound);
  }
}
