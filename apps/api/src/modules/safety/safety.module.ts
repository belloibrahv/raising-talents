import { Module } from '@nestjs/common';
import type { Logger } from 'pino';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import type { IdentityFacade } from '../identity/application/identity.facade.js';
import { IDENTITY } from '../identity/application/identity.tokens.js';
import { IdentityModule } from '../identity/identity.module.js';
import type { TalentDirectory } from '../talent-profiles/application/get-talent-profile.queries.js';
import { TALENT } from '../talent-profiles/application/talent-profile.tokens.js';
import { TalentProfilesModule } from '../talent-profiles/talent-profiles.module.js';
import type { ReportRepository } from './domain/report.js';
import {
  DecideReportsHandler,
  FileReportHandler,
  ListReportedAccountsQuery,
  ReinstateAccountHandler,
  SAFETY,
} from './application/safety.use-cases.js';
import { DrizzleReportRepository } from './infrastructure/drizzle-report.repository.js';
import { ReportModerationController } from './interface/http/report-moderation.controller.js';
import { ReportsController } from './interface/http/reports.controller.js';

import { AgentProfilesModule } from '../agent-profiles/agent-profiles.module.js';
import {
  AGENT,
  type AgentDirectory,
} from '../agent-profiles/application/agent-profile.use-cases.js';
import {
  MESSAGING,
  type ConversationEvidence,
} from '../messaging/application/messaging.use-cases.js';
import { MessagingModule } from '../messaging/messaging.module.js';

/** Reports from members and the suspensions and bans that follow them (ADR-028). */
@Module({
  imports: [
    AccountsModule,
    IdentityModule,
    TalentProfilesModule,
    AgentProfilesModule,
    MessagingModule,
  ],
  controllers: [ReportsController, ReportModerationController],
  providers: [
    {
      provide: SAFETY.Reports,
      inject: [PLATFORM.UnitOfWork],
      useFactory: (uow: DrizzleUnitOfWork) => new DrizzleReportRepository(uow),
    },
    {
      provide: SAFETY.File,
      inject: [
        SAFETY.Reports,
        ACCOUNTS.Facade,
        TALENT.Directory,
        MESSAGING.Evidence,
        PLATFORM.RateLimiter,
        PLATFORM.Clock,
      ],
      useFactory: (
        reports: ReportRepository,
        accounts: AccountsFacade,
        talents: TalentDirectory,
        conversations: ConversationEvidence,
        limiter: RateLimiter,
        clock: Clock,
      ) => new FileReportHandler(reports, accounts, talents, conversations, limiter, clock),
    },
    {
      provide: SAFETY.List,
      inject: [SAFETY.Reports, ACCOUNTS.Facade, TALENT.Directory, AGENT.Directory],
      useFactory: (
        reports: ReportRepository,
        accounts: AccountsFacade,
        talents: TalentDirectory,
        agents: AgentDirectory,
      ) => new ListReportedAccountsQuery(reports, accounts, talents, agents),
    },
    {
      provide: SAFETY.Decide,
      inject: [
        SAFETY.Reports,
        ACCOUNTS.Facade,
        IDENTITY.Facade,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
        PLATFORM.Logger,
      ],
      useFactory: (
        reports: ReportRepository,
        accounts: AccountsFacade,
        identity: IdentityFacade,
        uow: UnitOfWork,
        clock: Clock,
        logger: Logger,
      ) => new DecideReportsHandler(reports, accounts, identity, uow, clock, logger),
    },
    {
      provide: SAFETY.Reinstate,
      inject: [SAFETY.Reports, ACCOUNTS.Facade, PLATFORM.UnitOfWork, PLATFORM.Clock],
      useFactory: (
        reports: ReportRepository,
        accounts: AccountsFacade,
        uow: UnitOfWork,
        clock: Clock,
      ) => new ReinstateAccountHandler(reports, accounts, uow, clock),
    },
  ],
  exports: [SAFETY.Reinstate],
})
export class SafetyModule {}
