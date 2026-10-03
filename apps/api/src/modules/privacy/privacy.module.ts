import { Module } from '@nestjs/common';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config/env.js';
import type { Clock } from '../../platform/clock.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import {
  AGENT,
  type GetMyAgentProfileQuery,
} from '../agent-profiles/application/agent-profile.use-cases.js';
import {
  VERIFICATION,
  type GetMyVerificationQuery,
} from '../agent-profiles/application/verification.use-cases.js';
import { AgentProfilesModule } from '../agent-profiles/agent-profiles.module.js';
import type { IdentityFacade } from '../identity/application/identity.facade.js';
import { IDENTITY } from '../identity/application/identity.tokens.js';
import { IdentityModule } from '../identity/identity.module.js';
import type { MediaFacade } from '../media/application/media.facade.js';
import { MEDIA } from '../media/application/media.use-cases.js';
import { MediaModule } from '../media/media.module.js';
import {
  PORTFOLIO,
  type GetMyPortfolioQuery,
} from '../portfolio/application/portfolio.use-cases.js';
import { PortfolioModule } from '../portfolio/portfolio.module.js';
import type { GetMyTalentProfileQuery } from '../talent-profiles/application/get-talent-profile.queries.js';
import { TALENT } from '../talent-profiles/application/talent-profile.tokens.js';
import { TalentProfilesModule } from '../talent-profiles/talent-profiles.module.js';
import {
  AccountErasureJob,
  CancelDeletionHandler,
  ExportMyDataQuery,
  PRIVACY,
  RequestDeletionHandler,
  type PrivacySources,
} from './application/privacy.use-cases.js';
import { PrivacyController } from './interface/http/privacy.controller.js';

const SOURCES = Symbol('PrivacySources');

/** Account deletion and data export (NDPR). Coordinates other modules through their facades. */
@Module({
  imports: [
    AccountsModule,
    IdentityModule,
    MediaModule,
    TalentProfilesModule,
    AgentProfilesModule,
    PortfolioModule,
  ],
  controllers: [PrivacyController],
  providers: [
    {
      provide: SOURCES,
      inject: [TALENT.GetMine, AGENT.GetMine, VERIFICATION.GetMine, PORTFOLIO.GetMine],
      useFactory: (
        talent: GetMyTalentProfileQuery,
        agent: GetMyAgentProfileQuery,
        verification: GetMyVerificationQuery,
        portfolio: GetMyPortfolioQuery,
      ): PrivacySources => ({
        talentProfile: (userId) => talent.execute(userId),
        agentProfile: (userId) => agent.execute(userId),
        agentVerification: (userId) => verification.execute(userId),
        portfolio: (userId) => portfolio.execute(userId),
      }),
    },
    {
      provide: PRIVACY.RequestDeletion,
      inject: [
        ACCOUNTS.Facade,
        IDENTITY.Facade,
        PLATFORM.RateLimiter,
        PLATFORM.UnitOfWork,
        PLATFORM.Config,
      ],
      useFactory: (
        accounts: AccountsFacade,
        identity: IdentityFacade,
        limiter: RateLimiter,
        uow: UnitOfWork,
        config: AppConfig,
      ) =>
        new RequestDeletionHandler(
          accounts,
          identity,
          limiter,
          uow,
          config.ACCOUNT_DELETION_GRACE_DAYS,
        ),
    },
    {
      provide: PRIVACY.CancelDeletion,
      inject: [ACCOUNTS.Facade, PLATFORM.UnitOfWork],
      useFactory: (accounts: AccountsFacade, uow: UnitOfWork) =>
        new CancelDeletionHandler(accounts, uow),
    },
    {
      provide: PRIVACY.Export,
      inject: [ACCOUNTS.Facade, MEDIA.Facade, SOURCES, PLATFORM.RateLimiter, PLATFORM.Clock],
      useFactory: (
        accounts: AccountsFacade,
        media: MediaFacade,
        sources: PrivacySources,
        limiter: RateLimiter,
        clock: Clock,
      ) => new ExportMyDataQuery(accounts, media, sources, limiter, clock),
    },
    {
      provide: PRIVACY.Erasure,
      inject: [ACCOUNTS.Facade, MEDIA.Facade, PLATFORM.UnitOfWork, PLATFORM.Logger],
      useFactory: (accounts: AccountsFacade, media: MediaFacade, uow: UnitOfWork, logger: Logger) =>
        new AccountErasureJob(accounts, media, uow, logger),
    },
  ],
  exports: [PRIVACY.Erasure],
})
export class PrivacyModule {}
