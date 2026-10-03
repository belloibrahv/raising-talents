import { ErrorCode, type AgentMissingField } from '@rt/contracts';
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
