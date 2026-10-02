import { Module } from '@nestjs/common';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config/env.js';
import type { Clock } from '../../platform/clock.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import type { ModuleEventHandlers } from '../identity/identity.module.js';
import type { MediaUrls } from '../media/application/media-urls.js';
import { MEDIA } from '../media/application/media.use-cases.js';
import { MediaModule } from '../media/media.module.js';
import type { TalentDirectory } from '../talent-profiles/application/get-talent-profile.queries.js';
import { TALENT } from '../talent-profiles/application/talent-profile.tokens.js';
import { TalentProfilesModule } from '../talent-profiles/talent-profiles.module.js';
import type { TaxonomySource } from '../taxonomy/application/taxonomy-catalog.js';
import { TAXONOMY } from '../taxonomy/application/taxonomy.tokens.js';
import { TaxonomyModule } from '../taxonomy/taxonomy.module.js';
import type {
  AvatarUrls,
  SearchAccounts,
  SearchIndex,
  SearchTalents,
} from './application/ports.js';
import {
  INDEXING_EVENTS,
  IndexTalentHandler,
  RebuildSearchIndex,
  SEARCH,
  SearchTalentsHandler,
} from './application/search.use-cases.js';
import {
  DisabledSearchIndex,
  TypesenseSearchIndex,
} from './infrastructure/typesense-search-index.js';
import { SearchController } from './interface/http/search.controller.js';

@Module({
  imports: [AccountsModule, MediaModule, TalentProfilesModule, TaxonomyModule],
  controllers: [SearchController],
  providers: [
    {
      provide: SEARCH.Index,
      inject: [PLATFORM.Config],
      useFactory: (config: AppConfig): SearchIndex =>
        config.SEARCH_INDEX === 'typesense'
          ? new TypesenseSearchIndex(config.TYPESENSE_URL ?? '', config.TYPESENSE_API_KEY ?? '')
          : new DisabledSearchIndex(),
    },
    {
      provide: SEARCH.Talents,
      inject: [TALENT.Directory],
      useFactory: (directory: TalentDirectory): SearchTalents => directory,
    },
    {
      provide: SEARCH.Accounts,
      inject: [ACCOUNTS.Facade],
      useFactory: (facade: AccountsFacade): SearchAccounts => facade,
    },
    {
      provide: SEARCH.AvatarUrls,
      inject: [MEDIA.Urls],
      useFactory:
        (urls: MediaUrls): AvatarUrls =>
        (ownerId, mediaId) =>
          urls.forImage(ownerId, mediaId),
    },
    {
      provide: SEARCH.Search,
      inject: [
        SEARCH.Index,
        SEARCH.Accounts,
        TAXONOMY.Source,
        SEARCH.AvatarUrls,
        PLATFORM.RateLimiter,
        PLATFORM.Clock,
      ],
      useFactory: (
        index: SearchIndex,
        accounts: SearchAccounts,
        taxonomy: TaxonomySource,
        urls: AvatarUrls,
        limiter: RateLimiter,
        clock: Clock,
      ) => new SearchTalentsHandler(index, accounts, taxonomy, urls, limiter, clock),
    },
    {
      provide: SEARCH.IndexTalent,
      inject: [SEARCH.Index, SEARCH.Talents, SEARCH.Accounts],
      useFactory: (index: SearchIndex, talents: SearchTalents, accounts: SearchAccounts) =>
        new IndexTalentHandler(index, talents, accounts),
    },
    {
      provide: SEARCH.Rebuild,
      inject: [SEARCH.Index, SEARCH.Talents, SEARCH.Accounts, PLATFORM.Logger],
      useFactory: (
        index: SearchIndex,
        talents: SearchTalents,
        accounts: SearchAccounts,
        logger: Logger,
      ) => new RebuildSearchIndex(index, talents, accounts, logger),
    },
    {
      provide: SEARCH.EventHandlers,
      inject: [SEARCH.IndexTalent],
      useFactory: (indexTalent: IndexTalentHandler): ModuleEventHandlers => ({
        register: (dispatcher) => {
          for (const type of INDEXING_EVENTS)
            dispatcher.on(type, (event) => indexTalent.handle(event));
        },
      }),
    },
  ],
  exports: [SEARCH.EventHandlers, SEARCH.Rebuild],
})
export class SearchModule {}
