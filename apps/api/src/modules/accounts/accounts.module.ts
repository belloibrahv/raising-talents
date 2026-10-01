import { Module } from '@nestjs/common';
import type { Clock } from '../../platform/clock.js';
import type { EventRecorder } from '../../platform/domain-event.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import { AccountsFacade } from './application/accounts.facade.js';
import { ACCOUNTS } from './application/accounts.tokens.js';
import { CreateAccountHandler } from './application/create-account.handler.js';
import { GetMeQuery } from './application/get-me.query.js';
import { MarkEmailVerifiedHandler } from './application/mark-email-verified.handler.js';
import { SelectRoleHandler } from './application/select-role.handler.js';
import type { AccountRepository } from './domain/account.repository.js';
import { DrizzleAccountRepository } from './infrastructure/drizzle-account.repository.js';
import { MeController } from './interface/http/me.controller.js';
import { ACCOUNTS_HTTP } from './interface/http/me.tokens.js';

@Module({
  controllers: [MeController],
  providers: [
    {
      provide: ACCOUNTS.Repository,
      inject: [PLATFORM.UnitOfWork, PLATFORM.EventRecorder],
      useFactory: (uow: DrizzleUnitOfWork, events: EventRecorder) =>
        new DrizzleAccountRepository(uow, events),
    },
    {
      provide: ACCOUNTS_HTTP.GetMe,
      inject: [ACCOUNTS.Repository],
      useFactory: (accounts: AccountRepository) => new GetMeQuery(accounts),
    },
    {
      provide: ACCOUNTS_HTTP.SelectRole,
      inject: [ACCOUNTS.Repository, PLATFORM.UnitOfWork, PLATFORM.Clock],
      useFactory: (accounts: AccountRepository, uow: UnitOfWork, clock: Clock) =>
        new SelectRoleHandler(accounts, uow, clock),
    },
    {
      provide: ACCOUNTS.Facade,
      inject: [ACCOUNTS.Repository, PLATFORM.Clock, ACCOUNTS_HTTP.GetMe],
      useFactory: (accounts: AccountRepository, clock: Clock, getMe: GetMeQuery) =>
        new AccountsFacade(
          accounts,
          new CreateAccountHandler(accounts),
          new MarkEmailVerifiedHandler(accounts, clock),
          getMe,
        ),
    },
  ],
  exports: [ACCOUNTS.Facade],
})
export class AccountsModule {}
