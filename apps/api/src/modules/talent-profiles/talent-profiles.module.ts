import { Module } from '@nestjs/common';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../platform/domain-event.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import type { TaxonomySource } from '../taxonomy/application/taxonomy-catalog.js';
import { TAXONOMY } from '../taxonomy/application/taxonomy.tokens.js';
import { TaxonomyModule } from '../taxonomy/taxonomy.module.js';
import {
  GetMyTalentProfileQuery,
  GetPublicTalentProfileQuery,
} from './application/get-talent-profile.queries.js';
import type { ProfileAccounts } from './application/ports.js';
import { TALENT } from './application/talent-profile.tokens.js';
import { UpdateMyTalentProfileHandler } from './application/update-my-talent-profile.handler.js';
import type { TalentProfileRepository } from './domain/talent-profile.repository.js';
import { DrizzleTalentProfileRepository } from './infrastructure/drizzle-talent-profile.repository.js';
import { TalentProfileController } from './interface/http/talent-profile.controller.js';

@Module({
  imports: [AccountsModule, TaxonomyModule],
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
      provide: TALENT.UpdateMine,
      inject: [
        TALENT.Repository,
        TALENT.Accounts,
        TAXONOMY.Source,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
      ],
      useFactory: (
        repo: TalentProfileRepository,
        accounts: ProfileAccounts,
        taxonomy: TaxonomySource,
        uow: UnitOfWork,
        clock: Clock,
      ) => new UpdateMyTalentProfileHandler(repo, accounts, taxonomy, uow, clock),
    },
    {
      provide: TALENT.GetMine,
      inject: [TALENT.Repository, TALENT.Accounts, TAXONOMY.Source],
      useFactory: (
        repo: TalentProfileRepository,
        accounts: ProfileAccounts,
        taxonomy: TaxonomySource,
      ) => new GetMyTalentProfileQuery(repo, accounts, taxonomy),
    },
    {
      provide: TALENT.GetPublic,
      inject: [TALENT.Repository, TALENT.Accounts, TAXONOMY.Source],
      useFactory: (
        repo: TalentProfileRepository,
        accounts: ProfileAccounts,
        taxonomy: TaxonomySource,
      ) => new GetPublicTalentProfileQuery(repo, accounts, taxonomy),
    },
  ],
  exports: [TALENT.Repository],
})
export class TalentProfilesModule {}
