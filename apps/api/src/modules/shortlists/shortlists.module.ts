import { Module } from '@nestjs/common';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import type { TalentDirectory } from '../talent-profiles/application/get-talent-profile.queries.js';
import { TALENT } from '../talent-profiles/application/talent-profile.tokens.js';
import { TalentProfilesModule } from '../talent-profiles/talent-profiles.module.js';
import type { ShortlistRepository } from './domain/shortlist.js';
import {
  GetShortlistEntryQuery,
  ListShortlistQuery,
  RemoveFromShortlistHandler,
  SaveToShortlistHandler,
  SHORTLIST,
  ShortlistExport,
} from './application/shortlist.use-cases.js';
import { DrizzleShortlistRepository } from './infrastructure/drizzle-shortlist.repository.js';
import { ShortlistController } from './interface/http/shortlist.controller.js';

/** Talent an agent saved, with private notes (ADR-030). */
@Module({
  imports: [AccountsModule, TalentProfilesModule],
  controllers: [ShortlistController],
  providers: [
    {
      provide: SHORTLIST.Entries,
      inject: [PLATFORM.UnitOfWork],
      useFactory: (uow: DrizzleUnitOfWork) => new DrizzleShortlistRepository(uow),
    },
    {
      provide: SHORTLIST.List,
      inject: [SHORTLIST.Entries, ACCOUNTS.Facade, TALENT.Directory],
      useFactory: (
        entries: ShortlistRepository,
        accounts: AccountsFacade,
        talents: TalentDirectory,
      ) => new ListShortlistQuery(entries, accounts, talents),
    },
    {
      provide: SHORTLIST.Get,
      inject: [SHORTLIST.Entries, ACCOUNTS.Facade, TALENT.Directory],
      useFactory: (
        entries: ShortlistRepository,
        accounts: AccountsFacade,
        talents: TalentDirectory,
      ) => new GetShortlistEntryQuery(entries, accounts, talents),
    },
    {
      provide: SHORTLIST.Save,
      inject: [SHORTLIST.Entries, ACCOUNTS.Facade, TALENT.Directory, PLATFORM.Clock],
      useFactory: (
        entries: ShortlistRepository,
        accounts: AccountsFacade,
        talents: TalentDirectory,
        clock: Clock,
      ) => new SaveToShortlistHandler(entries, accounts, talents, clock),
    },
    {
      provide: SHORTLIST.Remove,
      inject: [SHORTLIST.Entries, ACCOUNTS.Facade, TALENT.Directory],
      useFactory: (
        entries: ShortlistRepository,
        accounts: AccountsFacade,
        talents: TalentDirectory,
      ) => new RemoveFromShortlistHandler(entries, accounts, talents),
    },
    {
      provide: SHORTLIST.Export,
      inject: [SHORTLIST.Entries, TALENT.Directory],
      useFactory: (entries: ShortlistRepository, talents: TalentDirectory) =>
        new ShortlistExport(entries, talents),
    },
  ],
  exports: [SHORTLIST.Export],
})
export class ShortlistsModule {}
