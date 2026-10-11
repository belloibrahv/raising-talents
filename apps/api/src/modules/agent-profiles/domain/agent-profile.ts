import { ErrorCode, type AgentMissingField, type RosterStatus } from '@rt/contracts';
import { domainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';

export const AgentProfileEvents = {
  Updated: 'agent.AgentProfileUpdated',
  Completed: 'agent.AgentProfileCompleted',
} as const;

export const AgentProfileErrors = {
  notFound: () => domainError(ErrorCode.NotFound, 'You have not started your agent profile yet.'),
  wrongRole: () => domainError(ErrorCode.WrongRole, 'Only agent accounts have an agent profile.'),
  versionRequired: () =>
    domainError(
      ErrorCode.PreconditionRequired,
      'Send the If-Match header from your last read of this profile.',
    ),
  staleVersion: () =>
    domainError(
      ErrorCode.PreconditionFailed,
      'Your profile changed on another device. Reload it and try again.',
    ),
};

export interface AgentProfileProps {
  readonly userId: string;
  readonly agencyName: string | null;
  readonly jobTitle: string | null;
  readonly specializationSlugs: readonly string[];
  readonly citySlug: string | null;
  readonly website: string | null;
  /** Certifications, who they have worked with, what they look for. Empty until written. */
  readonly bio: string;
  /** Whether they are taking on new talent. Null until they say. */
  readonly rosterStatus: RosterStatus | null;
  readonly avatarMediaId: string | null;
  readonly completedAt: Date | null;
  readonly verifiedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgentProfilePatch {
  readonly agencyName?: string;
  readonly jobTitle?: string;
  readonly specializationSlugs?: readonly string[];
  readonly citySlug?: string;
  readonly website?: string | null;
  readonly bio?: string;
  readonly rosterStatus?: RosterStatus | null;
}

/**
 * An agent's profile. Complete agents can browse, search and shortlist; contacting
 * talent additionally needs verification (design section 6.3).
 */
export class AgentProfile {
  private pendingEvents: DomainEvent[] = [];

  private constructor(private props: AgentProfileProps) {}

  static start(userId: string, now: Date): AgentProfile {
    return new AgentProfile({
      userId,
      agencyName: null,
      jobTitle: null,
      specializationSlugs: [],
      citySlug: null,
      website: null,
      bio: '',
      rosterStatus: null,
      avatarMediaId: null,
      completedAt: null,
      verifiedAt: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: AgentProfileProps): AgentProfile {
    return new AgentProfile(props);
  }

  get userId(): string {
    return this.props.userId;
  }
  get version(): number {
    return this.props.version;
  }

  snapshot(): AgentProfileProps {
    return { ...this.props };
  }

  missing(): AgentMissingField[] {
    const missing: AgentMissingField[] = [];
    if (!this.props.agencyName) missing.push('agencyName');
    if (!this.props.jobTitle) missing.push('jobTitle');
    if (this.props.specializationSlugs.length === 0) missing.push('specializations');
    if (!this.props.citySlug) missing.push('city');
    return missing;
  }

  get isComplete(): boolean {
    return this.missing().length === 0;
  }

  apply(patch: AgentProfilePatch, now: Date): { becameComplete: boolean } {
    // Renaming the agency of a verified agent removes the badge until it is reviewed again (section 6.12).
    const agencyRenamed =
      patch.agencyName !== undefined && patch.agencyName !== this.props.agencyName;
    this.props = {
      ...this.props,
      agencyName: patch.agencyName ?? this.props.agencyName,
      jobTitle: patch.jobTitle ?? this.props.jobTitle,
      specializationSlugs: [
        ...new Set(patch.specializationSlugs ?? this.props.specializationSlugs),
      ],
      citySlug: patch.citySlug ?? this.props.citySlug,
      website: patch.website === undefined ? this.props.website : patch.website,
      bio: patch.bio ?? this.props.bio,
      rosterStatus: patch.rosterStatus === undefined ? this.props.rosterStatus : patch.rosterStatus,
      verifiedAt: agencyRenamed ? null : this.props.verifiedAt,
      version: this.props.version + 1,
      updatedAt: now,
    };
    const becameComplete = this.isComplete && this.props.completedAt === null;
    if (becameComplete) this.props = { ...this.props, completedAt: now };
    this.raise(AgentProfileEvents.Updated, now, {
      isComplete: this.isComplete,
      verificationCleared: agencyRenamed,
    });
    if (becameComplete) this.raise(AgentProfileEvents.Completed, now, {});
    return { becameComplete };
  }

  get isVerified(): boolean {
    return this.props.verifiedAt !== null;
  }

  /** A moderator confirmed the agency. Bumps the version so open forms reload the badge. */
  markVerified(now: Date): void {
    if (this.props.verifiedAt !== null) return;
    this.props = {
      ...this.props,
      verifiedAt: now,
      version: this.props.version + 1,
      updatedAt: now,
    };
    this.raise(AgentProfileEvents.Updated, now, { isComplete: this.isComplete, verified: true });
  }

  /** Who talent can find: a finished profile whose agency a moderator confirmed (ADR-049). */
  get isListed(): boolean {
    return this.isComplete && this.isVerified;
  }

  /** The uploaded photo is live. The photo is optional, so nothing else changes. */
  setAvatar(mediaId: string, now: Date): void {
    if (this.props.avatarMediaId === mediaId) return;
    this.touch({ avatarMediaId: mediaId }, now);
  }

  /** A moderator took the photo down: the profile goes back to initials. */
  removeAvatar(mediaId: string, now: Date): void {
    if (this.props.avatarMediaId !== mediaId) return;
    this.touch({ avatarMediaId: null }, now);
  }

  private touch(change: Partial<AgentProfileProps>, now: Date): void {
    this.props = { ...this.props, ...change, version: this.props.version + 1, updatedAt: now };
    this.raise(AgentProfileEvents.Updated, now, { isComplete: this.isComplete });
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private raise(type: string, occurredAt: Date, payload: Record<string, unknown>): void {
    this.pendingEvents.push({ type, aggregateId: this.props.userId, occurredAt, payload });
  }
}

export interface AgentProfileRepository {
  findByUserId(userId: string, options?: { lock?: boolean }): Promise<AgentProfile | null>;
  save(profile: AgentProfile): Promise<void>;
}

export interface AgentListingFilter {
  /** Words to find in the agency name, job title or bio. */
  readonly text: string | null;
  readonly categorySlug: string | null;
  readonly countryCode: string | null;
  readonly citySlug: string | null;
  readonly openOnly: boolean;
}

/** A position in the directory: when the agency was verified, and the id to break ties. */
export interface ListingCursor {
  readonly verifiedAt: Date;
  readonly agentId: string;
}

/** Reads the directory of listed agents. Only active accounts are ever returned. */
export interface AgentListing {
  /** Most recently verified first. */
  search(
    filter: AgentListingFilter,
    after: ListingCursor | null,
    limit: number,
  ): Promise<AgentProfile[]>;
  /** The listed agents among these ids, in no particular order. */
  listedAmong(agentIds: readonly string[]): Promise<AgentProfile[]>;
}

export interface SavedAgent {
  readonly userId: string;
  readonly agentId: string;
  readonly savedAt: Date;
}

export interface SavedAgentRepository {
  /** Keeps the first saved date when it is already there. */
  save(entry: SavedAgent): Promise<void>;
  remove(userId: string, agentId: string): Promise<void>;
  count(userId: string): Promise<number>;
  /** Which of these agents the member saved. */
  savedAmong(userId: string, agentIds: readonly string[]): Promise<Set<string>>;
  /** Newest first. */
  page(
    userId: string,
    after: { savedAt: Date; agentId: string } | null,
    limit: number,
  ): Promise<SavedAgent[]>;
  all(userId: string): Promise<SavedAgent[]>;
}
