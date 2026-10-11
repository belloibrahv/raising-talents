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
import type { ModuleEventHandlers } from '../identity/identity.module.js';
import type { MediaUrls } from '../media/application/media-urls.js';
import { MEDIA } from '../media/application/media.use-cases.js';
import { MediaEvents } from '../media/domain/media-asset.js';
import { MediaModule } from '../media/media.module.js';
import {
  AGENT_DIRECTORY,
  GetAgentQuery,
  ListSavedAgentsQuery,
  SaveAgentHandler,
  SavedAgentsExport,
  SearchAgentsHandler,
  UnsaveAgentHandler,
  type AgentAvatarUrls,
} from './application/agent-directory.use-cases.js';
import {
  AGENT,
  AgentAvatarHandler,
  AgentDirectory,
  GetMyAgentProfileQuery,
  UpdateMyAgentProfileHandler,
} from './application/agent-profile.use-cases.js';
import type {
  AgentListing,
  AgentProfileRepository,
  SavedAgentRepository,
} from './domain/agent-profile.js';
import {
  DrizzleAgentListing,
  DrizzleSavedAgentRepository,
} from './infrastructure/drizzle-agent-listing.repository.js';
import { AgentDirectoryController } from './interface/http/agent-directory.controller.js';
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
  imports: [AccountsModule, TaxonomyModule, MediaModule],
  controllers: [AgentProfileController, VerificationController, AgentDirectoryController],
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
        AGENT.AvatarUrls,
      ],
      useFactory: (
        repo: AgentProfileRepository,
        accounts: AccountsFacade,
        taxonomy: TaxonomySource,
        uow: UnitOfWork,
        clock: Clock,
        urls: AgentAvatarUrls,
      ) => new UpdateMyAgentProfileHandler(repo, accounts, taxonomy, uow, clock, urls),
    },
    {
      provide: AGENT.Directory,
      inject: [AGENT.Repository, TAXONOMY.Source, AGENT_DIRECTORY.Listing],
      useFactory: (repo: AgentProfileRepository, taxonomy: TaxonomySource, listing: AgentListing) =>
        new AgentDirectory(repo, taxonomy, listing),
    },
    {
      provide: AGENT.GetMine,
      inject: [AGENT.Repository, ACCOUNTS.Facade, TAXONOMY.Source, AGENT.AvatarUrls],
      useFactory: (
        repo: AgentProfileRepository,
        accounts: AccountsFacade,
        taxonomy: TaxonomySource,
        urls: AgentAvatarUrls,
      ) => new GetMyAgentProfileQuery(repo, accounts, taxonomy, urls),
    },
    {
      provide: AGENT.AvatarUrls,
      inject: [MEDIA.Urls],
      useFactory:
        (urls: MediaUrls): AgentAvatarUrls =>
        (ownerId, mediaId) =>
          urls.forImage(ownerId, mediaId),
    },
    {
      provide: AGENT.EventHandlers,
      inject: [AGENT.Repository, PLATFORM.UnitOfWork, PLATFORM.Clock],
      useFactory: (
        repo: AgentProfileRepository,
        uow: UnitOfWork,
        clock: Clock,
      ): ModuleEventHandlers => {
        const avatar = new AgentAvatarHandler(repo, uow, clock);
        return {
          register: (dispatcher) => {
            dispatcher.on(MediaEvents.Ready, (event) => avatar.ready(event));
            dispatcher.on(MediaEvents.Rejected, (event) => avatar.removed(event));
            dispatcher.on(MediaEvents.Deleted, (event) => avatar.removed(event));
          },
        };
      },
    },
    {
      provide: AGENT_DIRECTORY.Listing,
      inject: [PLATFORM.UnitOfWork],
      useFactory: (uow: DrizzleUnitOfWork) => new DrizzleAgentListing(uow),
    },
    {
      provide: AGENT_DIRECTORY.Saved,
      inject: [PLATFORM.UnitOfWork],
      useFactory: (uow: DrizzleUnitOfWork) => new DrizzleSavedAgentRepository(uow),
    },
    {
      provide: AGENT_DIRECTORY.Search,
      inject: [
        AGENT_DIRECTORY.Listing,
        AGENT_DIRECTORY.Saved,
        ACCOUNTS.Facade,
        TAXONOMY.Source,
        AGENT.AvatarUrls,
        PLATFORM.RateLimiter,
      ],
      useFactory: (
        listing: AgentListing,
        saved: SavedAgentRepository,
        accounts: AccountsFacade,
        taxonomy: TaxonomySource,
        urls: AgentAvatarUrls,
        limiter: RateLimiter,
      ) => new SearchAgentsHandler(listing, saved, accounts, taxonomy, urls, limiter),
    },
    {
      provide: AGENT_DIRECTORY.Get,
      inject: [
        AGENT.Repository,
        AGENT_DIRECTORY.Listing,
        AGENT_DIRECTORY.Saved,
        ACCOUNTS.Facade,
        TAXONOMY.Source,
        AGENT.AvatarUrls,
      ],
      useFactory: (
        repo: AgentProfileRepository,
        listing: AgentListing,
        saved: SavedAgentRepository,
        accounts: AccountsFacade,
        taxonomy: TaxonomySource,
        urls: AgentAvatarUrls,
      ) => new GetAgentQuery(repo, listing, saved, accounts, taxonomy, urls),
    },
    {
      provide: AGENT_DIRECTORY.Save,
      inject: [AGENT_DIRECTORY.Listing, AGENT_DIRECTORY.Saved, ACCOUNTS.Facade, PLATFORM.Clock],
      useFactory: (
        listing: AgentListing,
        saved: SavedAgentRepository,
        accounts: AccountsFacade,
        clock: Clock,
      ) => new SaveAgentHandler(listing, saved, accounts, clock),
    },
    {
      provide: AGENT_DIRECTORY.Unsave,
      inject: [AGENT_DIRECTORY.Saved, ACCOUNTS.Facade],
      useFactory: (saved: SavedAgentRepository, accounts: AccountsFacade) =>
        new UnsaveAgentHandler(saved, accounts),
    },
    {
      provide: AGENT_DIRECTORY.ListSaved,
      inject: [
        AGENT_DIRECTORY.Listing,
        AGENT_DIRECTORY.Saved,
        ACCOUNTS.Facade,
        TAXONOMY.Source,
        AGENT.AvatarUrls,
      ],
      useFactory: (
        listing: AgentListing,
        saved: SavedAgentRepository,
        accounts: AccountsFacade,
        taxonomy: TaxonomySource,
        urls: AgentAvatarUrls,
      ) => new ListSavedAgentsQuery(listing, saved, accounts, taxonomy, urls),
    },
    {
      provide: AGENT_DIRECTORY.Export,
      inject: [AGENT_DIRECTORY.Saved, AGENT.Repository],
      useFactory: (saved: SavedAgentRepository, repo: AgentProfileRepository) =>
        new SavedAgentsExport(saved, repo),
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
  exports: [
    VERIFICATION.Outcomes,
    VERIFICATION.GetMine,
    AGENT.GetMine,
    AGENT.Directory,
    AGENT.EventHandlers,
    AGENT_DIRECTORY.Export,
  ],
})
export class AgentProfilesModule {}
