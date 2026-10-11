import type { MyAgentProfile } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type {
  TaxonomyCatalog,
  TaxonomySource,
} from '../../taxonomy/application/taxonomy-catalog.js';
import type { ProfileAccounts } from '../../talent-profiles/application/ports.js';
import {
  AgentProfile,
  AgentProfileErrors,
  type AgentListing,
  type AgentProfilePatch,
  type AgentProfileRepository,
} from '../domain/agent-profile.js';
import type { AgentAvatarUrls } from './agent-directory.use-cases.js';

export const AGENT = {
  Repository: Symbol('AgentProfileRepository'),
  UpdateMine: Symbol('UpdateMyAgentProfileHandler'),
  GetMine: Symbol('GetMyAgentProfileQuery'),
  Directory: Symbol('AgentDirectory'),
  EventHandlers: Symbol('AgentEventHandlers'),
  AvatarUrls: Symbol('AgentAvatarUrls'),
} as const;

export function toMyAgentProfile(
  profile: AgentProfile,
  catalog: TaxonomyCatalog,
  urls: AgentAvatarUrls,
): MyAgentProfile {
  const props = profile.snapshot();
  return {
    userId: props.userId,
    agencyName: props.agencyName,
    jobTitle: props.jobTitle,
    specializations: catalog.categoryRefs(props.specializationSlugs),
    city: catalog.city(props.citySlug),
    website: props.website,
    bio: props.bio,
    rosterStatus: props.rosterStatus,
    avatarMediaId: props.avatarMediaId,
    avatarUrls: props.avatarMediaId ? urls(props.userId, props.avatarMediaId) : null,
    verified: props.verifiedAt !== null,
    isComplete: profile.isComplete,
    missing: profile.missing(),
    version: props.version,
    updatedAt: props.updatedAt.toISOString(),
  };
}

export interface UpdateMyAgentProfileCommand {
  readonly userId: string;
  readonly expectedVersion: number | null;
  readonly patch: AgentProfilePatch;
}

export class UpdateMyAgentProfileHandler {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly urls: AgentAvatarUrls,
  ) {}

  async execute(
    command: UpdateMyAgentProfileCommand,
  ): Promise<Result<MyAgentProfile, DomainError>> {
    const account = await this.accounts.profileContext(command.userId);
    if (account?.role !== 'agent') return err(AgentProfileErrors.wrongRole());
    const catalog = await this.taxonomy.current();

    return this.uow.run(async () => {
      const now = this.clock.now();
      const existing = await this.profiles.findByUserId(command.userId, { lock: true });
      if (existing && command.expectedVersion === null)
        return err(AgentProfileErrors.versionRequired());
      if (existing && command.expectedVersion !== existing.version)
        return err(AgentProfileErrors.staleVersion());
      const profile = existing ?? AgentProfile.start(command.userId, now);

      const { becameComplete } = profile.apply(command.patch, now);
      const props = profile.snapshot();
      const categories = catalog.validateCategories(props.specializationSlugs);
      if (!categories.ok) return categories;
      const city = catalog.validateCity(props.citySlug);
      if (!city.ok) return city;

      await this.profiles.save(profile);
      if (becameComplete) {
        const completed = await this.accounts.completeOnboarding(command.userId);
        if (!completed.ok) return completed;
      }
      return ok(toMyAgentProfile(profile, catalog, this.urls));
    });
  }
}

export class GetMyAgentProfileQuery {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly urls: AgentAvatarUrls,
  ) {}

  async execute(userId: string): Promise<Result<MyAgentProfile, DomainError>> {
    const account = await this.accounts.profileContext(userId);
    if (account?.role !== 'agent') return err(AgentProfileErrors.wrongRole());
    const profile = await this.profiles.findByUserId(userId);
    if (!profile) return err(AgentProfileErrors.notFound());
    return ok(toMyAgentProfile(profile, await this.taxonomy.current(), this.urls));
  }
}

/** How an agent is introduced to talent. Other modules ask this instead of reading profiles. */
export class AgentDirectory {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly taxonomy: TaxonomySource,
    private readonly listing: AgentListing,
  ) {}

  /**
   * Whether talent can write to this agent first (ADR-050): open, closed, or null when the
   * agent is not one talent can find (unverified, unfinished or not in good standing).
   */
  async submissions(agentId: string): Promise<'open' | 'closed' | null> {
    const [listed] = await this.listing.listedAmong([agentId]);
    if (!listed) return null;
    return listed.snapshot().rosterStatus === 'open' ? 'open' : 'closed';
  }

  async summaryOf(agentId: string): Promise<{
    agencyName: string;
    jobTitle: string;
    city: string | null;
    verified: boolean;
    specializations: string[];
    website: string | null;
    verifiedAt: Date | null;
    memberSince: Date;
  } | null> {
    const profile = await this.profiles.findByUserId(agentId);
    const props = profile?.snapshot();
    if (!props?.agencyName) return null;
    const catalog = await this.taxonomy.current();
    return {
      agencyName: props.agencyName,
      jobTitle: props.jobTitle ?? '',
      city: catalog.placeName(props.citySlug),
      verified: props.verifiedAt !== null,
      specializations: catalog.categoryRefs(props.specializationSlugs).map((ref) => ref.name),
      website: props.website,
      verifiedAt: props.verifiedAt,
      memberSince: props.createdAt,
    };
  }
}

/**
 * Runs in the worker when a profile photo goes live or is taken down. Talent have their own
 * handler; this one acts only when the owner has an agent profile. The photo is optional for
 * agents, so it never changes whether the profile is complete.
 */
export class AgentAvatarHandler {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  ready(event: DomainEvent): Promise<void> {
    return this.change(event, (profile, now) => {
      profile.setAvatar(event.aggregateId, now);
    });
  }

  removed(event: DomainEvent): Promise<void> {
    return this.change(event, (profile, now) => {
      profile.removeAvatar(event.aggregateId, now);
    });
  }

  private async change(
    event: DomainEvent,
    apply: (profile: AgentProfile, now: Date) => void,
  ): Promise<void> {
    if (event.payload['purpose'] !== 'avatar') return;
    const ownerId = event.payload['ownerId'];
    if (typeof ownerId !== 'string') return;
    await this.uow.run(async () => {
      const profile = await this.profiles.findByUserId(ownerId, { lock: true });
      if (!profile) return;
      const before = profile.version;
      apply(profile, this.clock.now());
      if (profile.version !== before) await this.profiles.save(profile);
    });
  }
}
