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
import { VerificationController } from './interface/http/verification.controller.js';
import {
  DecideVerificationHandler,
  GetMyVerificationQuery,
  VerificationOutcomes,
  ListPendingVerificationsQuery,
  RequestVerificationHandler,
  VERIFICATION,
} from './application/verification.use-cases.js';
import type { VerificationRequestRepository } from './domain/verification-request.js';
import { DrizzleVerificationRequestRepository } from './infrastructure/drizzle-verification-request.repository.js';
import type { Logger } from 'pino';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';

@Module({
  imports: [AccountsModule, TaxonomyModule],
  controllers: [AgentProfileController, VerificationController],
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
    {
      provide: VERIFICATION.Requests,
      inject: [PLATFORM.UnitOfWork, PLATFORM.EventRecorder],
      useFactory: (uow: DrizzleUnitOfWork, events: EventRecorder) =>
        new DrizzleVerificationRequestRepository(uow, events),
    },
    {
      provide: VERIFICATION.Outcomes,
      inject: [VERIFICATION.Requests],
      useFactory: (requests: VerificationRequestRepository) => new VerificationOutcomes(requests),
    },
    {
      provide: VERIFICATION.GetMine,
      inject: [AGENT.Repository, VERIFICATION.Requests, ACCOUNTS.Facade],
      useFactory: (
        repo: AgentProfileRepository,
        requests: VerificationRequestRepository,
        accounts: AccountsFacade,
      ) => new GetMyVerificationQuery(repo, requests, accounts),
    },
    {
      provide: VERIFICATION.Request,
      inject: [
        AGENT.Repository,
        VERIFICATION.Requests,
        ACCOUNTS.Facade,
        PLATFORM.RateLimiter,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
      ],
      useFactory: (
        repo: AgentProfileRepository,
        requests: VerificationRequestRepository,
        accounts: AccountsFacade,
        limiter: RateLimiter,
        uow: UnitOfWork,
        clock: Clock,
      ) => new RequestVerificationHandler(repo, requests, accounts, limiter, uow, clock),
    },
    {
      provide: VERIFICATION.List,
      inject: [AGENT.Repository, VERIFICATION.Requests, ACCOUNTS.Facade, TAXONOMY.Source],
      useFactory: (
        repo: AgentProfileRepository,
        requests: VerificationRequestRepository,
        accounts: AccountsFacade,
        taxonomy: TaxonomySource,
      ) => new ListPendingVerificationsQuery(repo, requests, accounts, taxonomy),
    },
    {
      provide: VERIFICATION.Decide,
      inject: [
        AGENT.Repository,
        VERIFICATION.Requests,
        ACCOUNTS.Facade,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
        PLATFORM.Logger,
      ],
      useFactory: (
        repo: AgentProfileRepository,
        requests: VerificationRequestRepository,
        accounts: AccountsFacade,
        uow: UnitOfWork,
        clock: Clock,
        logger: Logger,
      ) => new DecideVerificationHandler(repo, requests, accounts, uow, clock, logger),
    },
  ],
  exports: [VERIFICATION.Outcomes, VERIFICATION.GetMine, AGENT.GetMine],
})
export class AgentProfilesModule {}
