import type { MyTalentProfile } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { TaxonomySource } from '../../taxonomy/application/taxonomy-catalog.js';
import { handleFromName } from '../domain/handle.js';
import { TalentProfile, type TalentProfilePatch } from '../domain/talent-profile.js';
import { TalentProfileErrors } from '../domain/talent-profile.errors.js';
import {
  HandleConflictError,
  type TalentProfileRepository,
} from '../domain/talent-profile.repository.js';
import type { ProfileAccounts } from './ports.js';
import { toMyTalentProfile } from './talent-profile.presenter.js';

export interface UpdateMyTalentProfileCommand {
  readonly userId: string;
  /** From If-Match. Required once the profile exists. */
  readonly expectedVersion: number | null;
  readonly patch: TalentProfilePatch;
}

/** Saves one onboarding step (or any later edit). Creates the profile on the first save. */
export class UpdateMyTalentProfileHandler {
  constructor(
    private readonly profiles: TalentProfileRepository,
    private readonly accounts: ProfileAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly random: () => number = Math.random,
  ) {}

  async execute(
    command: UpdateMyTalentProfileCommand,
  ): Promise<Result<MyTalentProfile, DomainError>> {
    const account = await this.accounts.profileContext(command.userId);
    // Email first: an unverified account cannot have chosen a role yet, so checking the
    // role first would send it the wrong next step.
    if (account && !account.emailVerified) return err(TalentProfileErrors.emailNotVerified());
    if (account?.role !== 'talent') return err(TalentProfileErrors.wrongRole());
    const catalog = await this.taxonomy.current();

    try {
      return await this.uow.run(async () => {
        const now = this.clock.now();
        const existing = await this.profiles.findByUserId(command.userId, { lock: true });

        let profile: TalentProfile;
        if (existing) {
          if (command.expectedVersion === null) return err(TalentProfileErrors.versionRequired());
          if (command.expectedVersion !== existing.version)
            return err(TalentProfileErrors.staleVersion());
          profile = existing;
        } else {
          const started = TalentProfile.start({
            userId: command.userId,
            handle: command.patch.handle ?? (await this.freeHandle(command.patch.displayName)),
            now,
          });
          if (!started.ok) return started;
          profile = started.value;
        }

        const wantsNewHandle =
          command.patch.handle !== undefined && command.patch.handle !== (existing?.handle ?? null);
        if (
          wantsNewHandle &&
          command.patch.handle &&
          (await this.profiles.handleExists(command.patch.handle))
        ) {
          return err(TalentProfileErrors.handleTaken(command.patch.handle));
        }

        const applied = profile.apply(command.patch, now);
        if (!applied.ok) return applied;

        const props = profile.snapshot();
        const valid = catalog.validateTalentSelection(props);
        if (!valid.ok) return valid;

        await this.profiles.save(profile);
        if (applied.value.becameComplete) {
          const completed = await this.accounts.completeOnboarding(command.userId);
          if (!completed.ok) return completed;
        }
        return ok(toMyTalentProfile(profile, catalog));
      });
    } catch (error) {
      // Two people chose the same handle at the same moment; the database kept one.
      if (error instanceof HandleConflictError)
        return err(TalentProfileErrors.handleTaken(error.handle));
      throw error;
    }
  }

  /** "amaka.okafor", or "amaka.okafor42" if that is taken. */
  private async freeHandle(displayName: string | undefined): Promise<string> {
    const base = handleFromName(displayName ?? '');
    if (!(await this.profiles.handleExists(base))) return base;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}${String(Math.floor(this.random() * 9000) + 100)}`;
      if (!(await this.profiles.handleExists(candidate))) return candidate;
    }
    return `${base}${String(Date.now()).slice(-6)}`;
  }
}
