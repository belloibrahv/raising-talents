import { Module } from '@nestjs/common';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../platform/domain-event.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import type { ModuleEventHandlers } from '../identity/identity.module.js';
import type { MediaUrls } from '../media/application/media-urls.js';
import { MEDIA } from '../media/application/media.use-cases.js';
import { MediaEvents } from '../media/domain/media-asset.js';
import { MediaModule } from '../media/media.module.js';
import type { TaxonomySource } from '../taxonomy/application/taxonomy-catalog.js';
import { TAXONOMY } from '../taxonomy/application/taxonomy.tokens.js';
import { TaxonomyModule } from '../taxonomy/taxonomy.module.js';
import {
  GetMyTalentProfileQuery,
  GetPublicTalentProfileQuery,
  TalentDirectory,
} from './application/get-talent-profile.queries.js';
import type { ProfileAccounts } from './application/ports.js';
import {
  AvatarReviewHandler,
  SetApprovedAvatarHandler,
} from './application/set-approved-avatar.handler.js';
import type { AvatarUrls } from './application/talent-profile.presenter.js';
import { TALENT } from './application/talent-profile.tokens.js';
import { UpdateMyTalentProfileHandler } from './application/update-my-talent-profile.handler.js';
import type { TalentProfileRepository } from './domain/talent-profile.repository.js';
import { DrizzleTalentProfileRepository } from './infrastructure/drizzle-talent-profile.repository.js';
import { TalentProfileController } from './interface/http/talent-profile.controller.js';

const AVATAR_URLS = Symbol('AvatarUrls');

@Module({
  imports: [AccountsModule, TaxonomyModule, MediaModule],
  controllers: [TalentProfileController],
  providers: [
    {
      provide: TALENT.Repository,
      inject: [PLATFORM.UnitOfWork, PLATFORM.EventRecorder],
      useFactory: (uow: DrizzleUnitOfWork, events: EventRecorder) =>
        new DrizzleTalentProfileRepository(uow, events),
    },
    {
      provide: TALENT.Accounts,
      inject: [ACCOUNTS.Facade],
      useFactory: (facade: AccountsFacade): ProfileAccounts => facade,
    },
    {
      provide: AVATAR_URLS,
      inject: [MEDIA.Urls],
      useFactory:
        (urls: MediaUrls): AvatarUrls =>
        (ownerId, mediaId) =>
          urls.forImage(ownerId, mediaId),
    },
    {
      provide: TALENT.UpdateMine,
      inject: [
        TALENT.Repository,
        TALENT.Accounts,
        TAXONOMY.Source,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
        AVATAR_URLS,
      ],
      useFactory: (
        repo: TalentProfileRepository,
        accounts: ProfileAccounts,
        taxonomy: TaxonomySource,
        uow: UnitOfWork,
        clock: Clock,
        urls: AvatarUrls,
      ) => new UpdateMyTalentProfileHandler(repo, accounts, taxonomy, uow, clock, urls),
    },
    {
      provide: TALENT.GetMine,
      inject: [TALENT.Repository, TALENT.Accounts, TAXONOMY.Source, AVATAR_URLS],
      useFactory: (
        repo: TalentProfileRepository,
        accounts: ProfileAccounts,
        taxonomy: TaxonomySource,
        urls: AvatarUrls,
      ) => new GetMyTalentProfileQuery(repo, accounts, taxonomy, urls),
    },
    {
      provide: TALENT.GetPublic,
      inject: [TALENT.Repository, TALENT.Accounts, TAXONOMY.Source, AVATAR_URLS],
      useFactory: (
        repo: TalentProfileRepository,
        accounts: ProfileAccounts,
        taxonomy: TaxonomySource,
        urls: AvatarUrls,
      ) => new GetPublicTalentProfileQuery(repo, accounts, taxonomy, urls),
    },
    {
      provide: TALENT.Directory,
      inject: [TALENT.Repository, TALENT.Accounts, TAXONOMY.Source, AVATAR_URLS],
      useFactory: (
        repo: TalentProfileRepository,
        accounts: ProfileAccounts,
        taxonomy: TaxonomySource,
        urls: AvatarUrls,
      ) => new TalentDirectory(repo, accounts, taxonomy, urls),
    },
    {
      provide: TALENT.EventHandlers,
      inject: [TALENT.Repository, TALENT.Accounts, PLATFORM.UnitOfWork, PLATFORM.Clock],
      useFactory: (
        repo: TalentProfileRepository,
        accounts: ProfileAccounts,
        uow: UnitOfWork,
        clock: Clock,
      ): ModuleEventHandlers => {
        const setAvatar = new SetApprovedAvatarHandler(repo, accounts, uow, clock);
        const review = new AvatarReviewHandler(repo, accounts, uow, clock);
        return {
          register: (dispatcher) => {
            dispatcher.on(MediaEvents.Ready, (event) => setAvatar.handle(event));
            dispatcher.on(MediaEvents.Held, (event) => review.held(event));
            dispatcher.on(MediaEvents.Rejected, (event) => review.rejected(event));
          },
        };
      },
    },
  ],
  exports: [TALENT.Repository, TALENT.Directory, TALENT.GetMine, TALENT.EventHandlers],
})
export class TalentProfilesModule {}
