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
  AGENT,
  GetMyAgentProfileQuery,
  UpdateMyAgentProfileHandler,
} from './application/agent-profile.use-cases.js';
import type { AgentProfileRepository } from './domain/agent-profile.js';
import { DrizzleAgentProfileRepository } from './infrastructure/drizzle-agent-profile.repository.js';
import { AgentProfileController } from './interface/http/agent-profile.controller.js';

@Module({
  imports: [AccountsModule, TaxonomyModule],
  controllers: [AgentProfileController],
  providers: [
    {
      provide: AGENT.Repository,
      inject: [PLATFORM.UnitOfWork, PLATFORM.EventRecorder],
      useFactory: (uow: DrizzleUnitOfWork, events: EventRecorder) =>
        new DrizzleAgentProfileRepository(uow, events),
    },
    {
      provide: AGENT.UpdateMine,
      inject: [
        AGENT.Repository,
        ACCOUNTS.Facade,
        TAXONOMY.Source,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
      ],
      useFactory: (
        repo: AgentProfileRepository,
        accounts: AccountsFacade,
        taxonomy: TaxonomySource,
        uow: UnitOfWork,
        clock: Clock,
      ) => new UpdateMyAgentProfileHandler(repo, accounts, taxonomy, uow, clock),
    },
    {
      provide: AGENT.GetMine,
      inject: [AGENT.Repository, ACCOUNTS.Facade, TAXONOMY.Source],
      useFactory: (
        repo: AgentProfileRepository,
        accounts: AccountsFacade,
        taxonomy: TaxonomySource,
      ) => new GetMyAgentProfileQuery(repo, accounts, taxonomy),
    },
  ],
})
export class AgentProfilesModule {}
