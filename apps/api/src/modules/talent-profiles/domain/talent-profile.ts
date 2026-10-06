import { BIO_MIN_FOR_COMPLETE, type Gender, type TalentMissingField } from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { isReservedHandle } from './handle.js';
import { TalentProfileErrors } from './talent-profile.errors.js';
import { TalentProfileEvents } from './talent-profile.events.js';

export interface TalentProfileProps {
  readonly userId: string;
  readonly handle: string;
  readonly displayName: string | null;
  readonly bio: string;
  readonly categorySlug: string | null;
  readonly subcategorySlugs: readonly string[];
  readonly skillSlugs: readonly string[];
  readonly citySlug: string | null;
  readonly gender: Gender | null;
  readonly genderSearchable: boolean;
  /** The talent chose to share a public link that anyone can open (ADR-042). */
  readonly publicLink: boolean;
  /**
   * Made once, the first time the link is turned on, and never reused: a shared link keeps
   * pointing at this talent even if the handle changes and someone else takes the old one.
   */
  readonly shareCode: string | null;
  readonly avatarMediaId: string | null;
  /**
   * A photo sent for review and not decided yet. With every other step done, it is enough
   * to finish onboarding; agents still see the profile only once a photo is approved.
   */
  readonly pendingAvatarMediaId: string | null;
  readonly completedAt: Date | null;
  readonly verifiedAt: Date | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TalentProfilePatch {
  readonly handle?: string;
  readonly displayName?: string;
  readonly bio?: string;
  readonly categorySlug?: string;
  readonly subcategorySlugs?: readonly string[];
  readonly skillSlugs?: readonly string[];
  readonly citySlug?: string;
  readonly gender?: Gender | null;
  readonly genderSearchable?: boolean;
  readonly publicLink?: boolean;
  /** Set by the application layer when the link is first turned on. */
  readonly shareCode?: string;
}

const unique = (values: readonly string[]) => [...new Set(values)];

/**
 * A talent's public face. Hidden from search and the feed until every completeness
 * rule in the design is met (section 6.2).
 */
export class TalentProfile {
  private pendingEvents: DomainEvent[] = [];

  private constructor(private props: TalentProfileProps) {}

  static start(input: {
    userId: string;
    handle: string;
    now: Date;
  }): Result<TalentProfile, DomainError> {
    if (isReservedHandle(input.handle))
      return err(TalentProfileErrors.handleReserved(input.handle));
    return ok(
      new TalentProfile({
        userId: input.userId,
        handle: input.handle,
        displayName: null,
        bio: '',
        categorySlug: null,
        subcategorySlugs: [],
        skillSlugs: [],
        citySlug: null,
        gender: null,
        genderSearchable: false,
        publicLink: false,
        shareCode: null,
        avatarMediaId: null,
        pendingAvatarMediaId: null,
        completedAt: null,
        verifiedAt: null,
        version: 0,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(props: TalentProfileProps): TalentProfile {
    return new TalentProfile(props);
  }

  get userId(): string {
    return this.props.userId;
  }
  get handle(): string {
    return this.props.handle;
  }
  get version(): number {
    return this.props.version;
  }

  snapshot(): TalentProfileProps {
    return { ...this.props };
  }

  /** In the order the onboarding wizard asks for them. */
  missing(): TalentMissingField[] {
    const missing: TalentMissingField[] = [];
    if (!this.props.displayName) missing.push('displayName');
    if (!this.props.categorySlug) missing.push('category');
    if (this.props.subcategorySlugs.length === 0) missing.push('subcategories');
    if (!this.props.citySlug) missing.push('city');
    if (this.props.bio.length < BIO_MIN_FOR_COMPLETE) missing.push('bio');
    if (!this.props.avatarMediaId) missing.push('avatar');
    return missing;
  }

  get isComplete(): boolean {
    return this.missing().length === 0;
  }

  /**
   * Every step is done and a photo is approved or waiting for a moderator. The account can
   * then leave onboarding; visibility to agents still waits for isComplete.
   */
  get canFinishOnboarding(): boolean {
    const photo = this.props.avatarMediaId !== null || this.props.pendingAvatarMediaId !== null;
    return photo && this.missing().every((field) => field === 'avatar');
  }

  /** Applies one wizard step. Returns whether this change completed the profile for the first time. */
  apply(patch: TalentProfilePatch, now: Date): Result<{ becameComplete: boolean }, DomainError> {
    if (
      patch.handle !== undefined &&
      patch.handle !== this.props.handle &&
      isReservedHandle(patch.handle)
    ) {
      return err(TalentProfileErrors.handleReserved(patch.handle));
    }

    const categoryChanged =
      patch.categorySlug !== undefined && patch.categorySlug !== this.props.categorySlug;
    const categorySlug = patch.categorySlug ?? this.props.categorySlug;
    // Subcategories belong to a category: a new category without new subcategories clears them.
    const subcategorySlugs = unique(
      patch.subcategorySlugs ?? (categoryChanged ? [] : this.props.subcategorySlugs),
    );
    if (subcategorySlugs.length > 0 && categorySlug === null) {
      return err(TalentProfileErrors.subcategoriesWithoutCategory());
    }

    const gender = patch.gender === undefined ? this.props.gender : patch.gender;
    // A cleared gender can never stay searchable.
    const genderSearchable =
      gender === null ? false : (patch.genderSearchable ?? this.props.genderSearchable);

    this.props = {
      ...this.props,
      handle: patch.handle ?? this.props.handle,
      displayName: patch.displayName ?? this.props.displayName,
      bio: patch.bio ?? this.props.bio,
      categorySlug,
      subcategorySlugs,
      skillSlugs: unique(patch.skillSlugs ?? this.props.skillSlugs),
      citySlug: patch.citySlug ?? this.props.citySlug,
      gender,
      genderSearchable,
      publicLink: patch.publicLink ?? this.props.publicLink,
      shareCode: this.props.shareCode ?? patch.shareCode ?? null,
      version: this.props.version + 1,
      updatedAt: now,
    };
    return ok({ becameComplete: this.recordChange(now) });
  }

  /** Called by the media module once an uploaded avatar has passed scanning. */
  setApprovedAvatar(mediaId: string, now: Date): { becameComplete: boolean } {
    this.props = {
      ...this.props,
      avatarMediaId: mediaId,
      pendingAvatarMediaId:
        this.props.pendingAvatarMediaId === mediaId ? null : this.props.pendingAvatarMediaId,
      version: this.props.version + 1,
      updatedAt: now,
    };
    return { becameComplete: this.recordChange(now) };
  }

  /** A new photo is waiting for a moderator. Returns whether onboarding can now finish. */
  avatarHeldForReview(mediaId: string, now: Date): { canFinishOnboarding: boolean } {
    this.props = {
      ...this.props,
      pendingAvatarMediaId: mediaId,
      version: this.props.version + 1,
      updatedAt: now,
    };
    this.recordChange(now);
    return { canFinishOnboarding: this.canFinishOnboarding };
  }

  /** The waiting photo was turned down: nothing is waiting any more. */
  avatarRejected(mediaId: string, now: Date): void {
    if (this.props.pendingAvatarMediaId !== mediaId) return;
    this.props = {
      ...this.props,
      pendingAvatarMediaId: null,
      version: this.props.version + 1,
      updatedAt: now,
    };
    this.recordChange(now);
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private recordChange(now: Date): boolean {
    const becameComplete = this.isComplete && this.props.completedAt === null;
    if (becameComplete) this.props = { ...this.props, completedAt: now };
    this.raise(TalentProfileEvents.Updated, now, {
      isComplete: this.isComplete,
      version: this.props.version,
    });
    if (becameComplete) this.raise(TalentProfileEvents.Completed, now, {});
    return becameComplete;
  }

  private raise(type: string, occurredAt: Date, payload: Record<string, unknown>): void {
    this.pendingEvents.push({ type, aggregateId: this.props.userId, occurredAt, payload });
  }
}
