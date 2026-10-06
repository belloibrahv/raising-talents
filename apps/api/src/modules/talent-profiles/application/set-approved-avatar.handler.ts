import type { Clock } from '../../../platform/clock.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { TalentProfileRepository } from '../domain/talent-profile.repository.js';
import type { ProfileAccounts } from './ports.js';

/**
 * Runs in the worker when an avatar passes scanning. Makes it the profile's avatar
 * and, if that completes the profile, completes onboarding in the same transaction.
 */
export class SetApprovedAvatarHandler {
  constructor(
    private readonly profiles: TalentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    if (event.payload['purpose'] !== 'avatar') return;
    const ownerId = event.payload['ownerId'];
    if (typeof ownerId !== 'string') return;

    await this.uow.run(async () => {
      const profile = await this.profiles.findByUserId(ownerId, { lock: true });
      // Avatars are the wizard's last step, so a profile exists; if not, there is nothing to attach to.
      if (!profile) return;
      if (profile.snapshot().avatarMediaId === event.aggregateId) return;
      const { becameComplete } = profile.setApprovedAvatar(event.aggregateId, this.clock.now());
      await this.profiles.save(profile);
      if (becameComplete) {
        const completed = await this.accounts.completeOnboarding(ownerId);
        if (!completed.ok)
          throw new Error(`Onboarding could not complete: ${completed.error.message}`);
      }
    });
  }
}

/**
 * Runs in the worker when an avatar is held for a moderator or turned down. A held photo is
 * enough to leave onboarding when every other step is done (ADR-044); a rejected one stops
 * waiting, so the talent is asked for another.
 */
export class AvatarReviewHandler {
  constructor(
    private readonly profiles: TalentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async held(event: DomainEvent): Promise<void> {
    if (event.payload['purpose'] !== 'avatar') return;
    const ownerId = event.payload['ownerId'];
    if (typeof ownerId !== 'string') return;
    await this.uow.run(async () => {
      const profile = await this.profiles.findByUserId(ownerId, { lock: true });
      if (!profile || profile.snapshot().pendingAvatarMediaId === event.aggregateId) return;
      const { canFinishOnboarding } = profile.avatarHeldForReview(
        event.aggregateId,
        this.clock.now(),
      );
      await this.profiles.save(profile);
      if (canFinishOnboarding) {
        const completed = await this.accounts.completeOnboarding(ownerId);
        if (!completed.ok)
          throw new Error(`Onboarding could not complete: ${completed.error.message}`);
      }
    });
  }

  async rejected(event: DomainEvent): Promise<void> {
    if (event.payload['purpose'] !== 'avatar') return;
    const ownerId = event.payload['ownerId'];
    if (typeof ownerId !== 'string') return;
    await this.uow.run(async () => {
      const profile = await this.profiles.findByUserId(ownerId, { lock: true });
      if (profile?.snapshot().pendingAvatarMediaId !== event.aggregateId) return;
      profile.avatarRejected(event.aggregateId, this.clock.now());
      await this.profiles.save(profile);
    });
  }
}
