import { Module } from '@nestjs/common';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../platform/domain-event.js';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import type { MediaFacade } from '../media/application/media.facade.js';
import { MEDIA } from '../media/application/media.use-cases.js';
import { MediaModule } from '../media/media.module.js';
import type { TalentDirectory } from '../talent-profiles/application/get-talent-profile.queries.js';
import { TALENT } from '../talent-profiles/application/talent-profile.tokens.js';
import { TalentProfilesModule } from '../talent-profiles/talent-profiles.module.js';
import {
  AddPortfolioItemHandler,
  GetMyPortfolioQuery,
  GetPublicPortfolioQuery,
  SharedTalentProfileQuery,
  PORTFOLIO,
  RemovePortfolioItemHandler,
  ReorderPortfolioHandler,
  UpdatePortfolioItemHandler,
  type PortfolioAccounts,
  type PortfolioMedia,
  type PortfolioTalents,
} from './application/portfolio.use-cases.js';
import type { PortfolioRepository } from './domain/portfolio.js';
import { DrizzlePortfolioRepository } from './infrastructure/drizzle-portfolio.repository.js';
import { SharedProfileController } from './interface/http/shared-profile.controller.js';
import { PortfolioController } from './interface/http/portfolio.controller.js';

const OWNER_DEPS = [
  PORTFOLIO.Repository,
  PORTFOLIO.Accounts,
  PORTFOLIO.Media,
  PLATFORM.UnitOfWork,
  PLATFORM.Clock,
];
type OwnerDeps = [PortfolioRepository, PortfolioAccounts, PortfolioMedia, UnitOfWork, Clock];

@Module({
  imports: [AccountsModule, MediaModule, TalentProfilesModule],
  controllers: [PortfolioController, SharedProfileController],
  providers: [
    {
      provide: PORTFOLIO.Repository,
      inject: [PLATFORM.UnitOfWork, PLATFORM.EventRecorder],
      useFactory: (uow: DrizzleUnitOfWork, events: EventRecorder) =>
        new DrizzlePortfolioRepository(uow, events),
    },
    {
      provide: PORTFOLIO.Accounts,
      inject: [ACCOUNTS.Facade],
      useFactory: (facade: AccountsFacade): PortfolioAccounts => facade,
    },
    {
      provide: PORTFOLIO.Media,
      inject: [MEDIA.Facade],
      useFactory: (facade: MediaFacade): PortfolioMedia => facade,
    },
    {
      provide: PORTFOLIO.Talents,
      inject: [TALENT.Directory],
      useFactory: (directory: TalentDirectory): PortfolioTalents => directory,
    },
    {
      provide: PORTFOLIO.GetMine,
      inject: [PORTFOLIO.Repository, PORTFOLIO.Accounts, PORTFOLIO.Media, PLATFORM.Clock],
      useFactory: (
        repo: PortfolioRepository,
        accounts: PortfolioAccounts,
        media: PortfolioMedia,
        clock: Clock,
      ) => new GetMyPortfolioQuery(repo, accounts, media, clock),
    },
    {
      provide: PORTFOLIO.Add,
      inject: OWNER_DEPS,
      useFactory: (...deps: OwnerDeps) => new AddPortfolioItemHandler(...deps),
    },
    {
      provide: PORTFOLIO.Update,
      inject: OWNER_DEPS,
      useFactory: (...deps: OwnerDeps) => new UpdatePortfolioItemHandler(...deps),
    },
    {
      provide: PORTFOLIO.Remove,
      inject: OWNER_DEPS,
      useFactory: (...deps: OwnerDeps) => new RemovePortfolioItemHandler(...deps),
    },
    {
      provide: PORTFOLIO.Reorder,
      inject: OWNER_DEPS,
      useFactory: (...deps: OwnerDeps) => new ReorderPortfolioHandler(...deps),
    },
    {
      provide: PORTFOLIO.GetPublic,
      inject: [PORTFOLIO.Repository, PORTFOLIO.Talents, PORTFOLIO.Media],
      useFactory: (repo: PortfolioRepository, talents: PortfolioTalents, media: PortfolioMedia) =>
        new GetPublicPortfolioQuery(repo, talents, media),
    },
    {
      provide: PORTFOLIO.Shared,
      inject: [PORTFOLIO.Repository, PORTFOLIO.Talents, PORTFOLIO.Media, PLATFORM.RateLimiter],
      useFactory: (
        repo: PortfolioRepository,
        talents: PortfolioTalents,
        media: PortfolioMedia,
        limiter: RateLimiter,
      ) => new SharedTalentProfileQuery(repo, talents, media, limiter),
    },
  ],
  exports: [PORTFOLIO.GetMine],
})
export class PortfolioModule {}
